import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configurationTrustHash, writeTrustedHash } from '../src/checks/trust.js';
import { checkCommand } from '../src/cli/commands/check.js';
import { defaultConfig } from '../src/config/schema.js';
import { writeConfig } from '../src/config/write.js';

const execute = promisify(execFile); const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('trusted command checks', () => {
  it('executes without a shell from its check directory and blocks on failure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'git-hooked-command-')); roots.push(root);
    await execute('git', ['init', '-q'], { cwd: root }); await execute('git', ['config', 'user.email', 'test@example.com'], { cwd: root }); await execute('git', ['config', 'user.name', 'Test'], { cwd: root });
    await writeFile(join(root, 'base.txt'), 'base\n'); await execute('git', ['add', 'base.txt'], { cwd: root }); await execute('git', ['commit', '-qm', 'initial'], { cwd: root });
    await writeConfig(root, defaultConfig);
    const directory = join(root, '.githooked', 'checks', 'failing'); await mkdir(directory);
    await writeFile(join(directory, 'check.yml'), 'version: 1\nid: failing\nname: Failing check\ntype: command\ncategory: correctness\nseverity: high\ncommand:\n  executable: node\n  args: [run.mjs]\n');
    await writeFile(join(directory, 'run.mjs'), 'process.stderr.write("expected failure"); process.exit(1);\n');
    await writeFile(join(root, '.githooked', 'hooks', 'pre-commit.yml'), 'checks: [check:failing]\n');
    await writeTrustedHash(root, await configurationTrustHash(root));
    await writeFile(join(root, 'changed.txt'), 'changed\n'); await execute('git', ['add', 'changed.txt'], { cwd: root });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await expect(checkCommand('pre-commit', root)).resolves.toBe(1);
  });
});
