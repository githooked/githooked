import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commandChecksTrusted, configurationTrustHash, writeTrustedHash } from '../src/checks/trust.js';
import { addRuleCommand } from '../src/cli/commands/rule-add.js';
import { loadProjectConfig } from '../src/config/load.js';
import { defaultConfig } from '../src/config/schema.js';
import { writeConfig } from '../src/config/write.js';
import { installRuleImplementation, ruleCheckIds } from '../src/rules/install.js';
import type { RuleImplementation, RulePlanResult } from '../src/rules/plan.js';

const execute = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'git-hooked-rule-flow-')); roots.push(root);
  await execute('git', ['init', '-q'], { cwd: root });
  await writeConfig(root, defaultConfig);
  await mkdir(join(root, 'src', 'routes'), { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { express: '1' } }));
  await writeFile(join(root, 'src', 'routes', 'account.ts'), 'export const account = true;\n');
  return root;
}

const base = {
  id: 'protect-api-responses', name: 'Protect API responses',
  rule: 'Public API responses must not expose passwordHash.',
  rationale: 'Express routes construct public account responses in this repository.',
  evidence: [{ path: 'src/routes/account.ts', detail: 'This file defines an account route.' }],
  severity: 'high' as const, hook: 'pre-push' as const, applies_to: ['src/routes/**/*.ts'], confidence: 0.95,
};

const semantic: RuleImplementation = {
  ...base, kind: 'semantic', semantic: { instructions: 'Report changed public responses that expose passwordHash. Allow internal-only reads.' },
};

const command: RuleImplementation = {
  ...base, id: 'forbid-debug-files', name: 'Forbid debug files', kind: 'command', hook: 'pre-commit',
  command: { script: { filename: 'check.mjs', source: 'import process from "node:process";\nprocess.exit(0);' }, timeout_ms: 10_000 },
};

function ready(implementation: RuleImplementation): RulePlanResult {
  return { status: 'ready', summary: 'A validated plan is ready.', implementation };
}

const clarification: RulePlanResult = {
  status: 'needs_clarification', summary: 'Scope is ambiguous.', questions: [{ id: 'public-routes', question: 'Which routes are public?', reason: 'The answer determines applicability.' }],
};

describe('rule interaction boundaries', () => {
  it('rejects empty and oversized rule requests before invoking a planner', async () => {
    const plan = vi.fn(async () => ready(semantic));
    await expect(addRuleCommand('   ', {}, process.cwd(), { plan })).rejects.toThrow('Rule cannot be empty');
    await expect(addRuleCommand('x'.repeat(4_001), {}, process.cwd(), { plan })).rejects.toThrow('cannot exceed 4000');
    expect(plan).not.toHaveBeenCalled();
  });

  it('rejects empty and oversized clarification answers without changing configuration', async () => {
    for (const answer of ['   ', 'x'.repeat(4_001)]) {
      const root = await repository();
      const before = await configurationTrustHash(root);
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await expect(addRuleCommand(base.rule, {}, root, { plan: async () => clarification, answer: async () => answer })).rejects.toThrow(/cannot be empty|cannot exceed 4000/);
      expect(await configurationTrustHash(root)).toBe(before);
    }
  });

  it('caps clarification at three answered rounds and leaves configuration unchanged', async () => {
    const root = await repository();
    const before = await configurationTrustHash(root);
    const plan = vi.fn(async () => clarification);
    const answer = vi.fn(async () => 'Only routes under src/routes/public');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await expect(addRuleCommand(base.rule, {}, root, { plan, answer })).rejects.toThrow('after 3 clarification rounds');
    expect(plan).toHaveBeenCalledTimes(4);
    expect(answer).toHaveBeenCalledTimes(3);
    expect(await configurationTrustHash(root)).toBe(before);
  });

  it('carries answers into replanning and replaces a repeated answer by stable question id', async () => {
    const root = await repository();
    const seen: Array<Array<{ id: string; answer: string }>> = [];
    const responses = [
      { status: 'needs_clarification', summary: 'Need two answers.', questions: [
        { id: 'scope', question: 'Which routes are public?', reason: 'Scope changes enforcement.' },
        { id: 'exceptions', question: 'Are admin routes exempt?', reason: 'Exceptions change enforcement.' },
      ] } satisfies RulePlanResult,
      { status: 'needs_clarification', summary: 'Confirm scope.', questions: [
        { id: 'scope', question: 'Should public webhooks count too?', reason: 'This refines the same scope.' },
      ] } satisfies RulePlanResult,
      ready(semantic),
    ];
    const supplied = ['src/routes/**', 'Yes', 'src/routes/** and src/webhooks/**'];
    let answerIndex = 0;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await addRuleCommand(base.rule, { dryRun: true }, root, {
      plan: async (input) => { seen.push(input.answers.map((answer) => ({ ...answer }))); return responses.shift()!; },
      answer: async () => supplied[answerIndex++]!,
    });
    expect(seen).toEqual([
      [],
      [{ id: 'scope', answer: 'src/routes/**' }, { id: 'exceptions', answer: 'Yes' }],
      [{ id: 'scope', answer: 'src/routes/** and src/webhooks/**' }, { id: 'exceptions', answer: 'Yes' }],
    ]);
  });

  it.skipIf(Boolean(process.stdin.isTTY))('fails safely when clarification or approval requires a non-interactive terminal', async () => {
    const root = await repository();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await expect(addRuleCommand(base.rule, {}, root, { plan: async () => clarification })).rejects.toThrow('no interactive terminal');
    await expect(addRuleCommand(base.rule, {}, root, { plan: async () => ready(semantic) })).rejects.toThrow('requires approval in a terminal');
  });

  it('cancellation and dry-run preserve the entire configuration and preview all files', async () => {
    for (const mode of ['cancel', 'dry-run'] as const) {
      const root = await repository();
      const before = await configurationTrustHash(root);
      const output: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...values: unknown[]) => output.push(values.map(String).join(' ')));
      await addRuleCommand(base.rule, mode === 'dry-run' ? { dryRun: true } : {}, root, {
        plan: async () => ready(semantic), confirm: async () => false,
      });
      const rendered = output.join('\n');
      expect(rendered).toContain('.githooked/checks/protect-api-responses/check.yml');
      expect(rendered).toContain('.githooked/checks/protect-api-responses/instructions.md');
      expect(rendered).toContain('Semantic instructions:');
      expect(await configurationTrustHash(root)).toBe(before);
    }
  });

  it('--yes skips confirmation but never trusts generated commands', async () => {
    const root = await repository();
    const confirm = vi.fn(async () => false);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await addRuleCommand(base.rule, { yes: true }, root, { plan: async () => ready(command), confirm });
    expect(confirm).not.toHaveBeenCalled();
    expect(await commandChecksTrusted(root)).toBe(false);
  });
});

describe('rule installation safety', () => {
  it('rejects unknown coverage claims and excludes disabled checks from planner context', async () => {
    const root = await repository();
    await writeFile(join(root, '.githooked', 'hooks', 'pre-commit.yml'), 'checks: [builtin:conflict-markers]\n');
    let ids: string[] = [];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await addRuleCommand('Do not commit env files', { dryRun: true }, root, {
      plan: async (input) => { ids = input.existingChecks.map((check) => check.id); return ready(semantic); },
    });
    expect(ids).not.toContain('builtin:env-files');
    await expect(addRuleCommand('Unknown coverage', {}, root, { plan: async () => ({
      status: 'already_covered', summary: 'Covered.', existing_check_id: 'builtin:not-real', reason: 'Invented by the planner.',
    }) })).rejects.toThrow('unknown existing check');
  });

  it('detects semantic and hybrid component collisions before approval', async () => {
    for (const implementation of [semantic, { ...semantic, id: 'hybrid-policy', kind: 'hybrid' as const, command: command.command }]) {
      const root = await repository();
      const colliding = ruleCheckIds(implementation).at(-1)!;
      await mkdir(join(root, '.githooked', 'checks', colliding));
      const before = await configurationTrustHash(root);
      const confirm = vi.fn(async () => true);
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await expect(addRuleCommand(base.rule, {}, root, { plan: async () => ready(implementation), confirm })).rejects.toThrow(`Check already exists: ${colliding}`);
      expect(confirm).not.toHaveBeenCalled();
      expect(await configurationTrustHash(root)).toBe(before);
    }
  });

  it('rejects invalid generated JavaScript before approval or writes', async () => {
    const root = await repository();
    const invalid: RuleImplementation = { ...command, command: { ...command.command, script: { filename: 'check.mjs', source: 'import { from broken syntax;' } } };
    const before = await configurationTrustHash(root);
    const confirm = vi.fn(async () => true);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await expect(addRuleCommand(base.rule, {}, root, { plan: async () => ready(invalid), confirm })).rejects.toThrow('not valid JavaScript');
    expect(confirm).not.toHaveBeenCalled();
    expect(await configurationTrustHash(root)).toBe(before);
  });

  it('keeps hybrid component ids valid and unique at the maximum planner id length', () => {
    const implementation = { ...semantic, id: `policy-${'x'.repeat(73)}`, kind: 'hybrid' as const, command: command.command };
    expect(implementation.id).toHaveLength(80);
    const ids = ruleCheckIds(implementation);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9][a-z0-9-]{0,79}$/);
  });

  it('rolls back cleanly when the selected hook cannot be parsed', async () => {
    const root = await repository();
    await writeFile(join(root, '.githooked', 'hooks', 'pre-push.yml'), 'checks: [unterminated\n');
    await expect(installRuleImplementation(root, semantic)).rejects.toThrow();
    await expect(readFile(join(root, '.githooked', 'checks', semantic.id), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('invalidates prior command trust after any later semantic rule change', async () => {
    const root = await repository();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await addRuleCommand(command.rule, { yes: true }, root, { plan: async () => ready(command) });
    await writeTrustedHash(root, await configurationTrustHash(root));
    expect(await commandChecksTrusted(root)).toBe(true);
    await addRuleCommand(semantic.rule, { yes: true }, root, { plan: async () => ready(semantic) });
    expect(await commandChecksTrusted(root)).toBe(false);
    const project = await loadProjectConfig(root);
    expect(project.hooks['pre-commit'].checks).toContain(`check:${command.id}`);
    expect(project.hooks['pre-push'].checks).toContain(`check:${semantic.id}`);
  });
});
