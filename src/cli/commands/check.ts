import { minimatch } from 'minimatch';
import { resolveAgent } from '../../agents/registry.js';
import type { SemanticCheckInput } from '../../agents/types.js';
import { runDeterministicChecks } from '../../checks/deterministic.js';
import { builtinKind, type BuiltinCheckId } from '../../checks/registry.js';
import { loadProjectConfig } from '../../config/load.js';
import { collectDiff, parsePushUpdates, type HookName } from '../../git/diff.js';
import { findRepositoryRoot } from '../../git/repository.js';
import { report, type SemanticReviewState } from '../../review/reporter.js';
import { isBlocking, type ReviewResult } from '../../review/result.js';

const builtinSemantic: Record<string, Omit<SemanticCheckInput, 'files'>> = {
  'security-review': { id: 'security-review', name: 'Security review', category: 'security', instructions: 'Find exploitable security problems introduced by the diff.' },
  'missing-tests': { id: 'missing-tests', name: 'Missing tests', category: 'testing', instructions: 'Find changed behavior that lacks relevant automated tests.' },
  'breaking-changes': { id: 'breaking-changes', name: 'Breaking changes', category: 'breaking-change', instructions: 'Find backward-incompatible API or contract changes introduced by the diff.' },
};

export async function checkCommand(hook: HookName, cwd = process.cwd(), remoteName?: string, pushInput = ''): Promise<number> {
  if (process.env.GIT_HOOKED_SKIP === '1') { console.warn('⚠ Git Hooked check bypassed via GIT_HOOKED_SKIP=1'); return 0; }
  const root = await findRepositoryRoot(cwd);
  const project = await loadProjectConfig(root);
  const config = project.config;
  const references = project.hooks[hook].checks;
  const builtinChecks = references.filter((reference) => reference.startsWith('builtin:')).map((reference) => reference.slice('builtin:'.length) as BuiltinCheckId);
  const push = hook === 'pre-push' && pushInput ? { ...(remoteName ? { remoteName } : {}), updates: parsePushUpdates(pushInput) } : undefined;
  const diff = await collectDiff(root, hook, undefined, push);
  const deterministicIds = builtinChecks.filter((id) => builtinKind(id) === 'deterministic');
  const deterministic = await runDeterministicChecks(diff, deterministicIds);
  let result: ReviewResult = { status: deterministic.length ? 'fail' : 'pass', summary: 'Deterministic checks complete.', findings: deterministic };
  const semanticChecks: SemanticCheckInput[] = builtinChecks.filter((id) => builtinKind(id) === 'semantic').map((id) => ({ ...builtinSemantic[id]!, files: diff.files }));
  for (const reference of references.filter((item) => item.startsWith('check:'))) {
    const check = project.checks.get(reference.slice('check:'.length));
    if (!check || check.type !== 'semantic') continue;
    const files = diff.files.filter((file) => check.applies_to.some((pattern) => minimatch(file, pattern, { dot: true })));
    if (files.length) semanticChecks.push({ id: check.id, name: check.name, instructions: check.instructionsText ?? '', category: check.category, severity: check.severity, files });
  }
  let semanticState: SemanticReviewState = semanticChecks.length ? diff.content ? 'error' : 'no-changes' : 'not-configured';
  let agentErrorBlocks = false;
  if (semanticChecks.length > 0 && diff.content.length > 0) {
    try {
      const ai = await resolveAgent(config.agent.provider, root).review({ diff: diff.content, files: diff.files, checks: semanticChecks, partial: diff.partial, timeoutMs: config.agent.timeout_ms });
      const definitions = new Map(semanticChecks.map((check) => [check.id, check]));
      const findings = ai.findings.map((finding) => {
        if (!finding.rule || !definitions.has(finding.rule)) throw new Error(`Agent finding ${finding.id} has an unknown or missing check id.`);
        const definition = definitions.get(finding.rule)!;
        if (finding.file && !definition.files.includes(finding.file)) throw new Error(`Agent finding ${finding.id} references a file outside check ${finding.rule}.`);
        return { ...finding, category: definition.category, ...(definition.severity ? { severity: definition.severity } : {}) };
      });
      result = { status: ai.status === 'fail' || deterministic.length ? 'fail' : ai.status, summary: ai.summary, findings: [...deterministic, ...findings] };
      semanticState = 'complete';
    } catch (error) {
      console.warn(`⚠ Agent review error: ${error instanceof Error ? error.message : String(error)}`);
      agentErrorBlocks = config.behaviour.agent_error === 'block';
    }
  }
  const blocking = isBlocking(result, config.blocking.severities);
  report(result, diff.files.length, blocking || agentErrorBlocks, semanticState, diff.note);
  return agentErrorBlocks ? 2 : blocking ? 1 : 0;
}
