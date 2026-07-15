import { access, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { resolveAgent } from '../../agents/registry.js';
import { builtinChecks } from '../../checks/registry.js';
import { ConfigError, loadProjectConfig, type ProjectConfig } from '../../config/load.js';
import { writeSemanticCheck } from '../../config/write.js';
import { findRepositoryRoot } from '../../git/repository.js';
import { deduplicateSecurityProposals } from '../../setup/deduplicate.js';
import { discoverRepository } from '../../setup/fingerprint.js';
import {
  securityFocusSchema, securityProposalResultSchema,
  type ExistingSemanticCheck, type SecurityFocus, type SecurityProposal, type SecurityProposalInput, type SecurityProposalResult,
} from '../../setup/proposal.js';

export interface SetupSecurityOptions {
  dryRun?: boolean;
  nonInteractive?: boolean;
  output?: string;
  focus?: string;
  maxProposals?: string | number;
}

export interface SetupSecurityDependencies {
  propose?: (input: SecurityProposalInput) => Promise<SecurityProposalResult>;
  confirm?: (proposal: SecurityProposal) => Promise<boolean>;
}

function parseMaximum(value: string | number | undefined): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 5);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) throw new ConfigError('--max-proposals must be an integer from 1 to 20.');
  return parsed;
}

function parseFocus(value: string | undefined): SecurityFocus[] {
  if (!value) return [];
  const values = [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
  try { return values.map((item) => securityFocusSchema.parse(item)); }
  catch { throw new ConfigError('--focus must contain: auth, database, api, secrets, dependencies, testing, or general.'); }
}

function builtinName(id: string): string { return id.split('-').map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`).join(' '); }

async function configuredChecks(root: string, project: ProjectConfig): Promise<ExistingSemanticCheck[]> {
  const checks: ExistingSemanticCheck[] = Object.keys(builtinChecks).map((id) => ({ id, name: builtinName(id), instructions: builtinName(id) }));
  for (const check of project.checks.values()) {
    if (check.type === 'semantic') checks.push({ id: check.id, name: check.name, instructions: check.instructionsText ?? check.name });
  }
  const checksRoot = join(root, '.githooked', 'checks');
  try {
    for (const entry of await readdir(checksRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && !checks.some((check) => check.id === entry.name)) checks.push({ id: entry.name, name: entry.name, instructions: entry.name });
    }
  } catch { /* loadProjectConfig already reports missing required configuration. */ }
  return checks;
}

function validateProposalEvidence(proposals: readonly SecurityProposal[], allowedPaths: readonly string[]): void {
  const allowed = new Set(allowedPaths);
  for (const proposal of proposals) {
    for (const evidence of proposal.evidence) {
      if (!allowed.has(evidence.path)) throw new ConfigError(`Proposal ${proposal.id} cites evidence outside the bounded repository map: ${evidence.path}`);
    }
  }
}

function proposalInstructions(proposal: SecurityProposal): string {
  const evidence = proposal.evidence.map((item) => `- ${item.path}: ${item.detail}`).join('\n');
  return `${proposal.rule}\n\nRationale:\n${proposal.rationale}\n\nRepository evidence observed during setup:\n${evidence}`;
}

function showProposal(proposal: SecurityProposal, root: string): void {
  console.log(`\nSuggested security check: ${proposal.id}`);
  console.log(`Severity: ${proposal.severity} · Focus: ${proposal.focus} · Confidence: ${Math.round(proposal.confidence * 100)}%`);
  console.log(`\nRule:\n  ${proposal.rule}`);
  console.log('\nEvidence:');
  for (const evidence of proposal.evidence) console.log(`  ${evidence.path}: ${evidence.detail}`);
  console.log('\nProposed changes:');
  console.log(`  ${relative(root, join(root, '.githooked', 'checks', proposal.id, 'check.yml'))}`);
  console.log(`  ${relative(root, join(root, '.githooked', 'checks', proposal.id, 'instructions.md'))}`);
  console.log(`  .githooked/hooks/pre-push.yml → check:${proposal.id}`);
}

async function confirmProposal(proposal: SecurityProposal): Promise<boolean> {
  if (!stdin.isTTY) throw new ConfigError('Interactive approval requires a terminal. Use --dry-run or --non-interactive in automation.');
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await prompt.question(`Add ${proposal.id} to pre-push? [Y/n] `);
    return !/^n(?:o)?$/i.test(answer.trim());
  } finally { prompt.close(); }
}

async function atomicOutput(path: string, value: unknown): Promise<void> {
  const temporary = join(dirname(path), `.${basename(path)}.tmp-${process.pid}-${Date.now()}`);
  try { await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' }); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
}

function isWithin(parent: string, path: string): boolean {
  const child = relative(parent, path);
  return child === '' || (!child.startsWith('..') && !isAbsolute(child));
}

async function outputPath(cwd: string, root: string, value: string): Promise<string> {
  const [canonicalCwd, canonicalRoot] = await Promise.all([realpath(cwd), realpath(root)]);
  const requested = resolve(canonicalCwd, value);
  const configEntry = join(canonicalRoot, '.githooked');
  if (isWithin(configEntry, requested)) throw new ConfigError('--output must not write inside .githooked.');

  const [directory, configRoot] = await Promise.all([realpath(dirname(requested)), realpath(configEntry)]);
  const path = join(directory, basename(requested));
  if (isWithin(configRoot, path)) {
    throw new ConfigError('--output must not write inside .githooked.');
  }
  return path;
}

async function pathExists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }

export async function setupSecurityCommand(
  options: SetupSecurityOptions,
  cwd = process.cwd(),
  dependencies: SetupSecurityDependencies = {},
): Promise<number> {
  const root = await findRepositoryRoot(cwd);
  const project = await loadProjectConfig(root);
  const maxProposals = parseMaximum(options.maxProposals);
  const focus = parseFocus(options.focus);
  const proposalOutputPath = options.output ? await outputPath(cwd, root, options.output) : undefined;
  const context = await discoverRepository(root);
  const existingChecks = await configuredChecks(root, project);
  const input: SecurityProposalInput = { context, existingChecks, focus, maxProposals, timeoutMs: project.config.agent.timeout_ms };
  const result = securityProposalResultSchema.parse(await (dependencies.propose
    ? dependencies.propose(input)
    : resolveAgent(project.config.agent.provider, root).proposeSecurity(input)));
  validateProposalEvidence(result.proposals, context.repositoryMap.files);
  const focused = focus.length ? result.proposals.filter((proposal) => focus.includes(proposal.focus)) : result.proposals;
  const deduplicated = deduplicateSecurityProposals(focused, existingChecks);
  const proposals = deduplicated.proposals.slice(0, maxProposals);

  for (const removed of deduplicated.removed) console.log(`ℹ Skipped duplicate proposal ${removed.id} (covered by ${removed.duplicateOf}).`);
  const exportValue = { version: 1, summary: result.summary, fingerprint: context.fingerprint, proposals };
  if (proposalOutputPath) {
    if (await pathExists(proposalOutputPath)) console.log(`ℹ Replacing proposal output ${proposalOutputPath}`);
    await atomicOutput(proposalOutputPath, exportValue);
    console.log(`✓ Wrote ${proposals.length} proposals to ${proposalOutputPath}`);
  }

  if (!proposals.length) { console.log('No new repository-specific security checks were proposed.'); return 0; }
  const reviewOnly = Boolean(options.dryRun || options.nonInteractive);
  const written: string[] = [];
  for (const proposal of proposals) {
    showProposal(proposal, root);
    if (reviewOnly) continue;
    const approved = await (dependencies.confirm ? dependencies.confirm(proposal) : confirmProposal(proposal));
    if (!approved) { console.log(`ℹ Skipped ${proposal.id}.`); continue; }
    await writeSemanticCheck(root, {
      id: proposal.id,
      name: proposal.name,
      category: 'security',
      severity: proposal.severity,
      appliesTo: proposal.applies_to,
      instructions: proposalInstructions(proposal),
    });
    written.push(proposal.id);
    console.log(`✓ Added security check ${proposal.id} to pre-push.`);
  }
  if (reviewOnly) console.log(options.dryRun ? '\nDry run complete; .githooked configuration was not changed.' : '\nReview complete; non-interactive mode did not change .githooked configuration.');
  else if (written.length) await loadProjectConfig(root);
  return 0;
}
