import { describe, expect, it, vi } from 'vitest';
import { collectDiff, parsePushUpdates } from '../src/git/diff.js';
import type { CommandRunner } from '../src/core/process.js';

describe('diff collection', () => {
  it('uses the staged diff for pre-commit', async () => {
    const run: CommandRunner = vi.fn().mockResolvedValueOnce({ stdout: 'diff text', stderr: '', exitCode: 0 }).mockResolvedValueOnce({ stdout: 'src/a file.ts', stderr: '', exitCode: 0 });
    const result = await collectDiff('/repo', 'pre-commit', run);
    expect(run).toHaveBeenCalledWith('git', expect.arrayContaining(['diff', '--cached']), expect.objectContaining({ cwd: '/repo' }));
    expect(result.files).toEqual(['src/a file.ts']);
  });
  it('uses the upstream merge base for pre-push', async () => {
    const run: CommandRunner = vi.fn()
      .mockResolvedValueOnce({ stdout: 'origin/main', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'abc123', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'diff', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'a.ts', stderr: '', exitCode: 0 });
    const result = await collectDiff('/repo', 'pre-push', run);
    expect(result.base).toBe('abc123');
  });
  it('preserves whitespace and newline characters using NUL-delimited names', async () => {
    const run: CommandRunner = vi.fn().mockResolvedValueOnce({ stdout: 'diff', stderr: '', exitCode: 0 }).mockResolvedValueOnce({ stdout: ' leading.ts\0line\nbreak.ts\0', stderr: '', exitCode: 0 });
    await expect(collectDiff('/repo', 'pre-commit', run)).resolves.toMatchObject({ files: [' leading.ts', 'line\nbreak.ts'] });
  });
  it('parses exact pre-push updates', () => {
    const localSha = 'a'.repeat(40); const remoteSha = 'b'.repeat(40);
    expect(parsePushUpdates(`refs/heads/a ${localSha} refs/heads/a ${remoteSha}\n`)).toEqual([{ localRef: 'refs/heads/a', localSha, remoteRef: 'refs/heads/a', remoteSha }]);
  });
  it('reviews a complete new branch when no remote merge base exists', async () => {
    const run: CommandRunner = vi.fn()
      .mockResolvedValueOnce({ stdout: '', stderr: 'none', exitCode: 1 })
      .mockResolvedValueOnce({ stdout: 'diff', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'a.ts\0', stderr: '', exitCode: 0 });
    const localSha = 'a'.repeat(40);
    const update = { localRef: 'refs/heads/a', localSha, remoteRef: 'refs/heads/a', remoteSha: '0000000000000000000000000000000000000000' };
    const result = await collectDiff('/repo', 'pre-push', run, { remoteName: 'origin', updates: [update] });
    expect(result.note).toContain('complete tree');
    expect(run).toHaveBeenCalledWith('git', expect.arrayContaining(['diff', `4b825dc642cb6eb9a060e54bf8d69288fbee4904..${localSha}`]), expect.anything());
  });
});
