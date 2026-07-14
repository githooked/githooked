import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addManagedBlock, installHooks, removeManagedBlock } from '../src/git/hooks.js';

describe('managed hooks', () => {
  it('preserves an existing hook', () => {
    const original = '#!/bin/sh\nnpm test\n';
    const installed = addManagedBlock(original, 'pre-push');
    expect(installed).toContain(original);
    expect(installed).toContain('git-hooked check pre-push');
    expect(installed).toContain('"$@"');
  });
  it('rejects incomplete managed blocks', () => expect(() => addManagedBlock('# >>> git-hooked managed >>>\n', 'pre-push')).toThrow('incomplete'));
  it('refuses to follow hook symlinks', async () => {
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
  it('removes only its managed block', () => {
    const original = '#!/bin/sh\nnpm test\n';
    expect(removeManagedBlock(addManagedBlock(original, 'pre-push'))).toBe(original);
  });
});
