import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addManagedBlock, installHooks, removeManagedBlock } from '../src/git/hooks.js';
import { runCommand } from '../src/core/process.js';

describe('managed hooks', () => {
  it('preserves an existing hook', () => {
    const original = '#!/bin/sh\nnpm test\n';
    const installed = addManagedBlock(original, 'pre-push');
    expect(installed).toContain(original);
    expect(installed).toContain('git-hooked check pre-push');
    expect(installed).toContain('node_modules/.bin/git-hooked');
    expect(installed).toContain('"$@"');
  });
  it('rejects incomplete managed blocks', () => expect(() => addManagedBlock('# >>> git-hooked managed >>>\n', 'pre-push')).toThrow('incomplete'));
  (process.platform === 'win32' ? it.skip : it)('refuses to follow hook symlinks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'git-hooked-hooks-'));
    try {
      const target = join(root, 'target'); await writeFile(target, '#!/bin/sh\n');
      await symlink(target, join(root, 'pre-commit'));
      await expect(installHooks(root)).rejects.toThrow('symlinked');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('is idempotent', () => {
    const once = addManagedBlock('', 'pre-commit');
    expect(addManagedBlock(once, 'pre-commit')).toBe(once);
  });
  it('upgrades an existing managed block', () => {
    const legacy = '#!/bin/sh\n# >>> git-hooked managed >>>\ngit-hooked check pre-commit "$@"\n# <<< git-hooked managed <<<\n';
    const upgraded = addManagedBlock(legacy, 'pre-commit');
    expect(upgraded).toContain('node_modules/.bin/git-hooked');
    expect(upgraded).not.toContain('\ngit-hooked check pre-commit "$@"\n');
  });
  it('removes only its managed block', () => {
    const original = '#!/bin/sh\nnpm test\n';
    expect(removeManagedBlock(addManagedBlock(original, 'pre-push'))).toBe(original);
  });
  (process.platform === 'win32' ? it.skip : it)('runs the repository-pinned CLI without a global installation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'git-hooked-local-cli-'));
    try {
      const initialized = await runCommand('git', ['init', '-q'], { cwd: root });
      expect(initialized.exitCode).toBe(0);
      const localBin = join(root, 'node_modules', '.bin');
      const capture = join(root, 'captured.txt');
      await mkdir(localBin, { recursive: true });
      const executable = join(localBin, 'git-hooked');
      await writeFile(executable, `#!/bin/sh\nprintf '%s\\n' "$*" > "${capture}"\n`, 'utf8');
      await chmod(executable, 0o755);
      await installHooks(join(root, '.git', 'hooks'));
      const result = await runCommand(join(root, '.git', 'hooks', 'pre-commit'), ['forwarded'], { cwd: root, env: { PATH: '/usr/bin:/bin' } });
      expect(result.exitCode).toBe(0);
      expect(await readFile(capture, 'utf8')).toBe('check pre-commit forwarded\n');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
