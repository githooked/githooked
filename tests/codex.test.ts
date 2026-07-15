import { describe, expect, it, vi } from 'vitest';
import { CodexAdapter } from '../src/agents/codex.js';
import type { CommandRunner } from '../src/core/process.js';

describe('Codex adapter', () => {
  const check = { id: 'security-review', name: 'Security review', category: 'security' as const, instructions: 'Review security.', files: ['a.ts'] };
  const pass = { status: 'pass', summary: 'ok', findings: [] };
  it('detects Codex', async () => {
    const run: CommandRunner = vi.fn().mockResolvedValue({ stdout: 'codex-cli 1.0', stderr: '', exitCode: 0 });
    await expect(new CodexAdapter(run).detect()).resolves.toMatchObject({ available: true });
  });
  it('uses stdin and a read-only sandbox', async () => {
    const run: CommandRunner = vi.fn().mockResolvedValue({ stdout: JSON.stringify(pass), stderr: '', exitCode: 0 });
    await new CodexAdapter(run).review({ diff: 'diff', files: ['a.ts'], checks: [check], partial: false, timeoutMs: 1_000 });
    expect(run).toHaveBeenCalledWith('codex', expect.arrayContaining(['exec', '--sandbox', 'read-only', '-']), expect.objectContaining({ input: expect.stringContaining('diff') }));
  });
  it('never treats malformed JSON as success', async () => {
    const run: CommandRunner = vi.fn().mockResolvedValue({ stdout: 'not json', stderr: '', exitCode: 0 });
    await expect(new CodexAdapter(run).review({ diff: 'x', files: [], checks: [], partial: false, timeoutMs: 1_000 })).rejects.toThrow('malformed JSON');
  });
  it('uses workspace-write only for explicit fix mode', async () => {
    const run: CommandRunner = vi.fn().mockResolvedValue({ stdout: 'fixed', stderr: '', exitCode: 0 });
    const result = await new CodexAdapter(run).fix({ findings: { status: 'fail', summary: '', findings: [] }, timeoutMs: 1_000 });
    expect(result.success).toBe(true);
    expect(run).toHaveBeenCalledWith('codex', expect.arrayContaining(['--sandbox', 'workspace-write']), expect.anything());
  });
  it('requests security proposals with bounded context in read-only mode', async () => {
    const proposal = {
      summary: 'one proposal',
      proposals: [{
        id: 'tenant-isolation', name: 'Tenant isolation', focus: 'database',
        rule: 'Every tenant query must use the authenticated tenant identifier.',
        rationale: 'Authenticated tenant context and tenant data access are both present.',
        evidence: [{ path: 'src/routes/a.ts', detail: 'A route reads tenant data.' }],
        severity: 'high', applies_to: ['src/routes/**/*.ts'], confidence: 0.9,
      }],
    };
    const run: CommandRunner = vi.fn().mockResolvedValue({ stdout: JSON.stringify(proposal), stderr: '', exitCode: 0 });
    const result = await new CodexAdapter(run).proposeSecurity({
      context: {
        fingerprint: { languages: [{ name: 'TypeScript', files: 1 }], frameworks: ['Express'], packageManagers: ['npm'], databaseClients: ['Prisma'], authenticationLibraries: [], testTools: [], apiEntryPoints: ['src/routes/a.ts'] },
        repositoryMap: { files: ['src/routes/a.ts'], scannedFiles: 1, truncated: false },
        selectedFiles: [{ path: 'src/routes/a.ts', content: 'export const route = true;', truncated: false }],
      },
      existingChecks: [], focus: ['database'], maxProposals: 3, timeoutMs: 1_000,
    });
    expect(result.proposals[0]?.id).toBe('tenant-isolation');
    expect(run).toHaveBeenCalledWith(
      'codex',
      expect.arrayContaining(['--sandbox', 'read-only', '--ignore-user-config', '--skip-git-repo-check']),
      expect.objectContaining({
        input: expect.stringContaining('untrusted-repository-context'),
        cwd: expect.stringContaining('git-hooked-'),
        env: expect.objectContaining({
          PWD: expect.stringContaining('git-hooked-'),
          OLDPWD: expect.stringContaining('git-hooked-'),
        }),
      }),
    );
  });
  it.skipIf(process.env.GIT_HOOKED_CODEX_INTEGRATION !== '1')('completes a real read-only structured review', async () => {
    const result = await new CodexAdapter(undefined, process.cwd()).review({
      diff: 'diff --git a/a.ts b/a.ts\n--- /dev/null\n+++ b/a.ts\n@@ -0,0 +1 @@\n+export const answer = 42;',
      files: ['a.ts'], checks: [check], partial: false, timeoutMs: 120_000,
    });
    expect(result.status).toMatch(/pass|warn|fail/);
  });
});
