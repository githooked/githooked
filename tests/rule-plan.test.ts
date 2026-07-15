import { describe, expect, it, vi } from 'vitest';
import { CodexAdapter } from '../src/agents/codex.js';
import type { CommandRunner } from '../src/core/process.js';
import { rulePlanDecisionSchema, type RulePlanInput } from '../src/rules/plan.js';

const input: RulePlanInput = {
  request: 'API responses must not expose passwordHash.',
  context: {
    fingerprint: {
      languages: [{ name: 'TypeScript', files: 1 }], frameworks: ['Express'], packageManagers: ['npm'], databaseClients: [], authenticationLibraries: [], testTools: [], apiEntryPoints: ['src/routes/account.ts'],
    },
    repositoryMap: { files: ['src/routes/account.ts'], scannedFiles: 1, truncated: false },
    selectedFiles: [{ path: 'src/routes/account.ts', content: 'export const route = true;', truncated: false }],
  },
  existingChecks: [],
  answers: [],
  timeoutMs: 1_000,
};

const result = {
  status: 'ready' as const,
  summary: 'Use a semantic rule.',
  implementation: {
    id: 'protect-api-response', name: 'Protect API response', kind: 'semantic' as const,
    rule: input.request, rationale: 'Public response construction needs contextual review.',
    evidence: [{ path: 'src/routes/account.ts', detail: 'This file defines the account route.' }],
    severity: 'high' as const, hook: 'pre-push' as const, applies_to: ['src/routes/**/*.ts'], confidence: 0.9,
    semantic: { instructions: 'Report public responses that expose passwordHash. Allow internal database reads.' },
  },
};

describe('rule planning', () => {
  it('uses an isolated read-only Codex invocation with the requested rule and bounded context', async () => {
    const run: CommandRunner = vi.fn().mockResolvedValue({ stdout: JSON.stringify({ result }), stderr: '', exitCode: 0 });
    await expect(new CodexAdapter(run).planRule(input)).resolves.toEqual(result);
    expect(run).toHaveBeenCalledWith(
      'codex',
      expect.arrayContaining(['--sandbox', 'read-only', '--ignore-user-config', '--skip-git-repo-check']),
      expect.objectContaining({
        input: expect.stringContaining(input.request),
        cwd: expect.stringContaining('git-hooked-'),
      }),
    );
  });

  it('rejects unsafe generated script paths and repository evidence paths', () => {
    const command = {
      ...result,
      implementation: {
        ...result.implementation,
        kind: 'command',
        command: { script: { filename: '../check.mjs', source: 'process.exit(0); // generated check' }, timeout_ms: 1_000 },
      },
    };
    expect(rulePlanDecisionSchema.safeParse(command).success).toBe(false);
    expect(rulePlanDecisionSchema.safeParse({
      ...result,
      implementation: { ...result.implementation, evidence: [{ path: '../secret', detail: 'Outside the repository.' }] },
    }).success).toBe(false);
  });

  it('limits clarification rounds to unique, bounded questions', () => {
    const duplicate = {
      status: 'needs_clarification', summary: 'Need scope.', questions: [
        { id: 'scope', question: 'Which routes are public?', reason: 'The scope changes enforcement.' },
        { id: 'scope', question: 'Should admin routes count?', reason: 'The scope changes enforcement.' },
      ],
    };
    expect(rulePlanDecisionSchema.safeParse(duplicate).success).toBe(false);
  });
});
