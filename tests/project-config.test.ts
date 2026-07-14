import { mkdtemp, mkdir, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadProjectConfig } from '../src/config/load.js';
import { defaultConfig } from '../src/config/schema.js';
import { ensureConfig, writeConfig } from '../src/config/write.js';

const roots: string[] = [];
async function root(): Promise<string> { const value = await mkdtemp(join(tmpdir(), 'git-hooked-test-')); roots.push(value); return value; }
afterEach(async () => { await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe('project configuration', () => {
  it('loads hook assignments and semantic check instructions', async () => {
    const directory = await root();
    await writeConfig(directory, defaultConfig);
    const checkDirectory = join(directory, '.githooked', 'checks', 'tenant-isolation');
    await mkdir(checkDirectory, { recursive: true });
    await writeFile(join(checkDirectory, 'check.yml'), 'version: 1\nid: tenant-isolation\nname: Tenant isolation\ntype: semantic\ninstructions: instructions.md\n');
    await writeFile(join(checkDirectory, 'instructions.md'), 'Every tenant query must be scoped.\n');
    await writeFile(join(directory, '.githooked', 'hooks', 'pre-push.yml'), 'checks:\n  - builtin:security-review\n  - check:tenant-isolation\n');
    const project = await loadProjectConfig(directory);
    expect(project.checks.get('tenant-isolation')?.instructionsText).toContain('tenant query');
  });
  it('rejects unknown built-in checks', async () => {
    const directory = await root(); await writeConfig(directory, defaultConfig);
    await writeFile(join(directory, '.githooked', 'hooks', 'pre-commit.yml'), 'checks: [builtin:typo]\n');
    await expect(loadProjectConfig(directory)).rejects.toThrow('Unknown built-in check');
  });
  it('loads command checks without executing them', async () => {
    const directory = await root(); await writeConfig(directory, defaultConfig);
    const checkDirectory = join(directory, '.githooked', 'checks', 'script'); await mkdir(checkDirectory);
    await writeFile(join(checkDirectory, 'check.yml'), 'version: 1\nid: script\nname: Script\ntype: command\ncommand:\n  executable: node\n');
    await writeFile(join(directory, '.githooked', 'hooks', 'pre-push.yml'), 'checks: [check:script]\n');
    const project = await loadProjectConfig(directory);
    expect(project.checks.get('script')?.command?.executable).toBe('node');
  });
  (process.platform === 'win32' ? it.skip : it)('rejects instruction symlinks that escape the check directory', async () => {
    const directory = await root(); await writeConfig(directory, defaultConfig);
    const outside = join(directory, 'outside.md'); await writeFile(outside, 'private');
    const checkDirectory = join(directory, '.githooked', 'checks', 'escape'); await mkdir(checkDirectory);
    await writeFile(join(checkDirectory, 'check.yml'), 'version: 1\nid: escape\nname: Escape\ntype: semantic\ninstructions: instructions.md\n');
    await symlink(outside, join(checkDirectory, 'instructions.md'));
    await writeFile(join(directory, '.githooked', 'hooks', 'pre-push.yml'), 'checks: [check:escape]\n');
    await expect(loadProjectConfig(directory)).rejects.toThrow('symlink escapes');
  });
  it('repairs missing default files without replacing existing config', async () => {
    const directory = await root(); await writeConfig(directory, defaultConfig);
    const prePush = join(directory, '.githooked', 'hooks', 'pre-push.yml'); await unlink(prePush);
    const before = await readFile(join(directory, '.githooked', 'config.yml'), 'utf8');
    const created = await ensureConfig(directory, defaultConfig);
    expect(created).toContain(prePush);
    expect(await readFile(join(directory, '.githooked', 'config.yml'), 'utf8')).toBe(before);
  });
});
