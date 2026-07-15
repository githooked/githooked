import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { resolveAgent } from '../../agents/registry.js';
import { builtinChecks } from '../../checks/registry.js';
import { ConfigError, loadProjectConfig, type ProjectConfig } from '../../config/load.js';
import { findRepositoryRoot } from '../../git/repository.js';
import { discoverRepository } from '../../setup/fingerprint.js';
import { assertRuleImplementationAvailable, installRuleImplementation, ruleCheckIds } from '../../rules/install.js';
import { validateGeneratedRuleScript } from '../../rules/validate.js';
import {
  rulePlanDecisionSchema,
  type ExistingRuleSummary,
  type RuleClarificationAnswer,
  type RuleClarificationQuestion,
  type RuleImplementation,
  type RulePlanInput,
  type RulePlanResult,
} from '../../rules/plan.js';

export interface AddRuleOptions { dryRun?: boolean; yes?: boolean }
export interface AddRuleDependencies {
  plan?: (input: RulePlanInput) => Promise<RulePlanResult>;
  answer?: (question: RuleClarificationQuestion) => Promise<string>;
  confirm?: (implementation: RuleImplementation) => Promise<boolean>;
}

const MAX_RULE_LENGTH = 4_000;
const MAX_ANSWER_LENGTH = 4_000;
const MAX_CLARIFICATION_ROUNDS = 3;

const builtinDescriptions: Record<keyof typeof builtinChecks, string> = {
  'env-files': 'Blocks staged .env and .env.* files, except files ending in .example.',
  secrets: 'Runs Gitleaks against staged content when Gitleaks is installed.',
  'conflict-markers': 'Blocks added merge-conflict markers.',
  'security-review': 'Reviews changed code for exploitable security problems.',
  'missing-tests': 'Reviews changed behavior for missing relevant tests.',
  'breaking-changes': 'Reviews changed APIs and contracts for backward incompatibility.',
};

function title(id: string): string { return id.split('-').map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`).join(' '); }

function enabledHooks(project: ProjectConfig, reference: string): Array<'pre-commit' | 'pre-push'> {
  return (['pre-commit', 'pre-push'] as const).filter((hook) => project.hooks[hook].checks.includes(reference));
}

function existingRules(project: ProjectConfig): ExistingRuleSummary[] {
  const references = new Set([...project.hooks['pre-commit'].checks, ...project.hooks['pre-push'].checks]);
  const result: ExistingRuleSummary[] = [];
  for (const reference of references) {
    if (reference.startsWith('builtin:')) {
      const id = reference.slice('builtin:'.length) as keyof typeof builtinChecks;
      result.push({ id: reference, name: title(id), kind: builtinChecks[id].kind, description: builtinDescriptions[id], hooks: enabledHooks(project, reference) });
      continue;
    }
    const id = reference.slice('check:'.length);
    const check = project.checks.get(id);
    if (!check) continue;
    const description = check.type === 'semantic'
      ? check.instructionsText ?? check.name
      : `${check.command?.executable ?? ''} ${check.command?.args.join(' ') ?? ''}`.trim();
    result.push({ id: reference, name: check.name, kind: check.type, description, hooks: enabledHooks(project, reference) });
  }
  return result;
}

async function interactiveAnswer(question: RuleClarificationQuestion): Promise<string> {
  if (!stdin.isTTY) throw new ConfigError('Rule planning needs clarification, but no interactive terminal is available. Re-run in a terminal.');
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    console.log(`\nClarification needed: ${question.reason}`);
    let answer = '';
    while (!answer) answer = (await prompt.question(`${question.question}\n> `)).trim();
    return answer;
  } finally { prompt.close(); }
}

async function interactiveConfirm(implementation: RuleImplementation): Promise<boolean> {
  if (!stdin.isTTY) throw new ConfigError('Rule creation requires approval in a terminal. Use --dry-run to preview or --yes to approve non-interactively.');
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const executable = implementation.kind === 'command' || implementation.kind === 'hybrid';
    const answer = await prompt.question(executable
      ? 'Create this rule with untrusted executable code? Review the source above first. [y/N] '
      : 'Create this rule? [y/N] ');
    return /^y(?:es)?$/i.test(answer.trim());
  } finally { prompt.close(); }
}

function validateEvidence(implementation: RuleImplementation, allowedPaths: readonly string[]): void {
  const allowed = new Set(allowedPaths);
  for (const evidence of implementation.evidence) {
    if (!allowed.has(evidence.path)) throw new ConfigError(`Rule plan cites evidence outside the bounded repository map: ${evidence.path}`);
  }
}

function showPlan(root: string, plan: Extract<RulePlanResult, { status: 'ready' }>): void {
  const implementation = plan.implementation;
  const ids = ruleCheckIds(implementation);
  console.log(`\n${plan.summary}`);
  console.log(`\nRecommended implementation: ${implementation.kind}`);
  console.log(`Reason: ${implementation.rationale}`);
  console.log(`Hook: ${implementation.hook}`);
  console.log(`Severity: ${implementation.severity}`);
  console.log(`Confidence: ${Math.round(implementation.confidence * 100)}%`);
  console.log(`Applies to: ${implementation.applies_to.join(', ')}`);
  if (implementation.evidence.length) {
    console.log('\nRepository evidence:');
    for (const evidence of implementation.evidence) console.log(`  ${evidence.path}: ${evidence.detail}`);
  }
  console.log('\nProposed changes:');
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index]!;
    const directory = `.githooked/checks/${id}`;
    const contentFile = implementation.kind === 'semantic' || (implementation.kind === 'hybrid' && index === 1)
      ? 'instructions.md' : implementation.command.script.filename;
    console.log(`  ${directory}/check.yml`);
    console.log(`  ${directory}/${contentFile}`);
  }
  for (const id of ids) console.log(`  .githooked/hooks/${implementation.hook}.yml → check:${id}`);
  if (implementation.kind === 'semantic' || implementation.kind === 'hybrid') {
    console.log('\nSemantic instructions:');
    console.log(implementation.semantic.instructions.trim());
  }
  if (implementation.kind === 'command' || implementation.kind === 'hybrid') {
    console.log(`\nGenerated executable (${implementation.command.script.filename}):`);
    console.log(implementation.command.script.source.trimEnd());
  }
}

export async function addRuleCommand(
  rule: string,
  options: AddRuleOptions = {},
  cwd = process.cwd(),
  dependencies: AddRuleDependencies = {},
): Promise<number> {
  const normalized = rule.trim();
  if (!normalized) throw new ConfigError('Rule cannot be empty.');
  if (normalized.length > MAX_RULE_LENGTH) throw new ConfigError(`Rule cannot exceed ${MAX_RULE_LENGTH} characters.`);
  const root = await findRepositoryRoot(cwd);
  const [project, context] = await Promise.all([loadProjectConfig(root), discoverRepository(root)]);
  const checks = existingRules(project);
  const agent = dependencies.plan ? undefined : resolveAgent(project.config.agent.provider, root);
  if (agent) {
    const detection = await agent.detect();
    if (!detection.available) throw new ConfigError(`${agent.displayName} is required to plan a rule: ${detection.error ?? 'unavailable'}`);
    console.log(`✓ ${agent.displayName} detected${detection.version ? ` (${detection.version})` : ''}`);
  }
  console.log('Analyzing the requested rule and repository...');

  const answers: RuleClarificationAnswer[] = [];
  let result: RulePlanResult | undefined;
  for (let round = 0; round <= MAX_CLARIFICATION_ROUNDS; round += 1) {
    const input: RulePlanInput = { request: normalized, context, existingChecks: checks, answers, timeoutMs: project.config.agent.timeout_ms };
    result = rulePlanDecisionSchema.parse(await (dependencies.plan ? dependencies.plan(input) : agent!.planRule(input)));
    if (result.status !== 'needs_clarification') break;
    if (round === MAX_CLARIFICATION_ROUNDS) throw new ConfigError(`Rule planning did not converge after ${MAX_CLARIFICATION_ROUNDS} clarification rounds.`);
    for (const question of result.questions) {
      const answer = (await (dependencies.answer ? dependencies.answer(question) : interactiveAnswer(question))).trim();
      if (!answer) throw new ConfigError(`Clarification answer cannot be empty: ${question.id}`);
      if (answer.length > MAX_ANSWER_LENGTH) throw new ConfigError(`Clarification answer cannot exceed ${MAX_ANSWER_LENGTH} characters: ${question.id}`);
      const previous = answers.find((item) => item.id === question.id);
      if (previous) previous.answer = answer;
      else answers.push({ id: question.id, answer });
    }
  }
  if (!result || result.status === 'needs_clarification') throw new ConfigError('Rule planning did not produce an implementation.');
  if (result.status === 'already_covered') {
    if (!checks.some((check) => check.id === result.existing_check_id)) throw new ConfigError(`Rule planner cited an unknown existing check: ${result.existing_check_id}`);
    console.log(`✓ Already covered by ${result.existing_check_id}`);
    console.log(`  ${result.reason}`);
    return 0;
  }

  validateEvidence(result.implementation, context.repositoryMap.files);
  await assertRuleImplementationAvailable(root, result.implementation);
  await validateGeneratedRuleScript(result.implementation);
  showPlan(root, result);
  if (options.dryRun) { console.log('\nDry run complete; .githooked configuration was not changed.'); return 0; }
  const approved = options.yes || await (dependencies.confirm ? dependencies.confirm(result.implementation) : interactiveConfirm(result.implementation));
  if (!approved) { console.log('Rule creation cancelled.'); return 0; }
  const installed = await installRuleImplementation(root, result.implementation);
  console.log(`✓ Added ${installed.length === 1 ? 'rule' : 'rule checks'} ${installed.join(', ')} to ${result.implementation.hook}.`);
  if (result.implementation.kind === 'command' || result.implementation.kind === 'hybrid') {
    console.log('⚠ Generated executable code is not trusted and will not run. Review it, then run `git-hooked trust`.');
  }
  return 0;
}
