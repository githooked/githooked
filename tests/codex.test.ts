import { describe, expect, it, vi } from 'vitest';
import { CodexAdapter } from '../src/agents/codex.js';
import type { CommandRunner } from '../src/core/process.js';

describe('Codex adapter', () => {
  const check = { id: 'security-review', name: 'Security review', category: 'security' as const, instructions: 'Review security.', files: ['a.ts'] };
  it('detects Codex', async () => {
    const run: CommandRunner = vi.fn().mockResolvedValue({ stdout: 'codex-cli 1.0', stderr: '', exitCode: 0 });
    await expect(new CodexAdapter(run).detect()).resolves.toMatchObject({ available: true });
  });
  it('uses stdin and a read-only sandbox', async () => {
    const run: CommandRunner = vi.fn().mockResolvedValue({ stdout: JSON.stringify({ status: 'pass', summary: 'ok', findings: [] }), stderr: '', exitCode: 0 });
    await new CodexAdapter(run).review({ diff: 'diff', files: ['a.ts'], checks: [check], partial: false, timeoutMs: 1_000 });
    expect(run).toHaveBeenCalledWith('codex', expect.arrayContaining(['exec', '--sandbox', 'read-only', '-']), expect.objectContaining({ input: expect.stringContaining('diff') }));
  });
  it('never treats malformed JSON as success', async () => {
    const run: CommandRunner = vi.fn().mockResolvedValue({ stdout: 'not json', stderr: '', exitCode: 0 });
    await expect(new CodexAdapter(run).review({ diff: 'x', files: [], checks: [], partial: false, timeoutMs: 1_000 })).rejects.toThrow('malformed JSON');
  });
});
