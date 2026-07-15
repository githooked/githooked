import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkCommand } from '../src/cli/commands/check.js';
import { defaultConfig } from '../src/config/schema.js';
import { writeConfig } from '../src/config/write.js';

const execute = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('command-check applicability', () => {
  it('does not require trust or run a command when no changed file matches its globs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'git-hooked-command-scope-')); roots.push(root);
    await execute('git', ['init', '-q'], { cwd: root });
    await execute('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
    await execute('git', ['config', 'user.name', 'Test'], { cwd: root });
    await writeFile(join(root, 'base.txt'), 'base\n');
    await execute('git', ['add', 'base.txt'], { cwd: root });
    await execute('git', ['commit', '-qm', 'initial'], { cwd: root });
    await writeConfig(root, defaultConfig);
    const check = join(root, '.githooked', 'checks', 'source-only');
    await mkdir(check);
    await writeFile(join(check, 'check.yml'), 'version: 1\nid: source-only\nname: Source only\ntype: command\ncategory: correctness\nseverity: high\napplies_to: [src/**]\ncommand:\n  executable: node\n  args: [check.mjs]\n');
    await writeFile(join(check, 'check.mjs'), 'process.exit(1);\n');
    await writeFile(join(root, '.githooked', 'hooks', 'pre-commit.yml'), 'checks: [check:source-only]\n');
    await writeFile(join(root, 'README.md'), 'documentation only\n');
    await execute('git', ['add', 'README.md'], { cwd: root });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await expect(checkCommand('pre-commit', root)).resolves.toBe(0);
  });
});
