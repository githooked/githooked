import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commandChecksTrusted, configurationTrustHash } from '../src/checks/trust.js';
import { addRuleCommand } from '../src/cli/commands/rule-add.js';
import { loadProjectConfig } from '../src/config/load.js';
import { defaultConfig } from '../src/config/schema.js';
import { writeConfig } from '../src/config/write.js';
import { ruleCheckIds } from '../src/rules/install.js';
import type { RuleImplementation, RulePlanResult } from '../src/rules/plan.js';

const execute = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'git-hooked-rule-')); roots.push(root);
  await execute('git', ['init', '-q'], { cwd: root });
  await writeConfig(root, defaultConfig);
  await mkdir(join(root, 'src', 'routes'), { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { express: '1' } }));
  await writeFile(join(root, 'src', 'routes', 'account.ts'), 'export const accountRoute = true;\n');
  return root;
}

const common = {
  id: 'protect-api-responses',
  name: 'Protect API responses',
  rule: 'API responses must never expose passwordHash or accessToken.',
  rationale: 'Express routes return account data and require contextual response review.',
  evidence: [{ path: 'src/routes/account.ts', detail: 'This file defines an account route.' }],
  severity: 'high' as const,
  hook: 'pre-push' as const,
  applies_to: ['src/routes/**/*.ts'],
  confidence: 0.94,
};

const semantic: RuleImplementation = {
  ...common,
  kind: 'semantic',
  semantic: { instructions: 'Report changed public responses that expose passwordHash or accessToken. Allow internal-only reads.' },
};

const command: RuleImplementation = {
  ...common,
  id: 'forbid-debug-route',
  name: 'Forbid debug route',
  hook: 'pre-commit',
  kind: 'command',
  command: {
    script: { filename: 'check.mjs', source: 'import process from "node:process";\nprocess.exit(0);' },
    timeout_ms: 10_000,
  },
};

const hybrid: RuleImplementation = {
  ...common,
  id: 'protect-response-fields',
  kind: 'hybrid',
  semantic: { instructions: 'Review changed response construction for indirect exposure of protected account fields.' },
  command: {
    script: { filename: 'check.mjs', source: 'import process from "node:process";\nprocess.exit(0);' },
    timeout_ms: 10_000,
  },
};

function ready(implementation: RuleImplementation): RulePlanResult {
  return { status: 'ready', summary: 'A repository-specific rule is ready.', implementation };
}

describe('rule add planner', () => {
  it('asks necessary clarification questions and replans before writing a semantic rule', async () => {
    const root = await repository();
    const plan = vi.fn(async (input): Promise<RulePlanResult> => input.answers.length
      ? ready(semantic)
      : {
        status: 'needs_clarification', summary: 'The public API boundary is ambiguous.', questions: [{
          id: 'admin-routes', question: 'Should internal admin routes be included?', reason: 'This changes the applicability boundary.',
        }],
      });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await addRuleCommand(common.rule, {}, root, { plan, answer: async () => 'No', confirm: async () => true });
    expect(plan).toHaveBeenCalledTimes(2);
    expect(plan.mock.calls[1]?.[0].answers).toEqual([{ id: 'admin-routes', answer: 'No' }]);
    const project = await loadProjectConfig(root);
    expect(project.hooks['pre-push'].checks).toContain('check:protect-api-responses');
    expect(project.checks.get('protect-api-responses')).toMatchObject({ type: 'semantic', applies_to: common.applies_to });
  });

  it('recognizes an enabled existing check and makes no changes', async () => {
    const root = await repository();
    const before = await configurationTrustHash(root);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await addRuleCommand('Never commit .env files', {}, root, { plan: async () => ({
      status: 'already_covered', summary: 'The default check covers this.', existing_check_id: 'builtin:env-files', reason: 'It blocks staged .env files.',
    }) });
    expect(await configurationTrustHash(root)).toBe(before);
  });

  it('creates a generated command check but does not trust it automatically', async () => {
    const root = await repository();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await addRuleCommand(command.rule, {}, root, { plan: async () => ready(command), confirm: async () => true });
    const project = await loadProjectConfig(root);
    expect(project.hooks['pre-commit'].checks).toContain('check:forbid-debug-route');
    expect(project.checks.get('forbid-debug-route')).toMatchObject({
      type: 'command', command: { executable: 'node', args: ['check.mjs'], timeout_ms: 10_000 },
    });
    expect(await readFile(join(root, '.githooked', 'checks', 'forbid-debug-route', 'check.mjs'), 'utf8')).toBe(`${command.command.script.source}\n`);
    await expect(commandChecksTrusted(root)).resolves.toBe(false);
  });

  it('materializes hybrid plans as deterministic and semantic checks', async () => {
    const root = await repository();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await addRuleCommand(hybrid.rule, {}, root, { plan: async () => ready(hybrid), confirm: async () => true });
    const ids = ruleCheckIds(hybrid);
    const project = await loadProjectConfig(root);
    expect(ids).toEqual(['protect-response-fields-deterministic', 'protect-response-fields-semantic']);
    expect(project.hooks['pre-push'].checks).toEqual(expect.arrayContaining(ids.map((id) => `check:${id}`)));
    expect(project.checks.get(ids[0]!)).toMatchObject({ type: 'command' });
    expect(project.checks.get(ids[1]!)).toMatchObject({ type: 'semantic' });
  });

  it('keeps configuration unchanged for a dry run', async () => {
    const root = await repository();
    const before = await configurationTrustHash(root);
    const confirm = vi.fn(async () => true);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await addRuleCommand(semantic.rule, { dryRun: true }, root, { plan: async () => ready(semantic), confirm });
    expect(confirm).not.toHaveBeenCalled();
    expect(await configurationTrustHash(root)).toBe(before);
  });

  it('rejects invented evidence before approval or configuration writes', async () => {
    const root = await repository();
    const before = await configurationTrustHash(root);
    const confirm = vi.fn(async () => true);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const invented = { ...semantic, evidence: [{ path: 'src/routes/invented.ts', detail: 'This path was invented.' }] };
    await expect(addRuleCommand(semantic.rule, {}, root, { plan: async () => ready(invented), confirm })).rejects.toThrow('outside the bounded repository map');
    expect(confirm).not.toHaveBeenCalled();
    expect(await configurationTrustHash(root)).toBe(before);
  });
});
