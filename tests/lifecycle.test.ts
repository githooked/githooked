import { execFile } from 'node:child_process';
import { access, mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { uninstallCommand } from '../src/cli/commands/uninstall.js';
import { defaultConfig } from '../src/config/schema.js';
import { writeConfig } from '../src/config/write.js';
import { installHooks } from '../src/git/hooks.js';
import { detectHookManager, manualIntegration } from '../src/git/integration.js';

const execute = promisify(execFile); const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('lifecycle', () => {
  it('uninstalls only managed hook blocks and preserves configuration by default', async () => {
    const root = await mkdtemp(join(tmpdir(), 'git-hooked-lifecycle-')); roots.push(root); await execute('git', ['init', '-q'], { cwd: root }); await writeConfig(root, defaultConfig);
    const hooks = join(root, '.git', 'hooks'); await installHooks(hooks); vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await uninstallCommand(false, root);
    expect(await readFile(join(hooks, 'pre-commit'), 'utf8')).not.toContain('git-hooked managed');
    await expect(access(join(root, '.githooked', 'config.yml'))).resolves.toBeUndefined();
  });
  it('detects framework-managed hook configuration', async () => {
    const root = await mkdtemp(join(tmpdir(), 'git-hooked-manager-')); roots.push(root); await mkdir(join(root, '.husky'));
    await expect(detectHookManager(root)).resolves.toMatchObject({ name: 'Husky' });
  });
  it.each([
    [{ name: 'Husky', marker: '.husky' }, '.husky/pre-push'],
    [{ name: 'Lefthook', marker: 'lefthook.yml' }, 'commands:'],
    [{ name: 'pre-commit', marker: '.pre-commit-config.yaml' }, 'stages: [pre-push]'],
  ])('provides actionable manual integration for $0.name', (manager, expected) => {
    expect(manualIntegration(manager)).toContain(expected);
    expect(manualIntegration(manager)).toContain('npx --no-install git-hooked');
  });
});
