import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { runCommand, type CommandResult } from '../src/core/process.js';
import { createProcessShims } from './helpers/example-repository.js';

const enabled = process.env.GIT_HOOKED_MANAGER_INTEGRATION === '1';
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const roots: string[] = [];

type Manager = 'git' | 'husky' | 'lefthook' | 'pre-commit';

function output(result: CommandResult): string {
  return [result.stdout, result.stderr].filter(Boolean).join('\n');
}

async function successful(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
  const result = await runCommand(command, args, { cwd, env, timeout: 60_000 });
  if (result.exitCode !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.exitCode}):\n${output(result)}`);
}

async function installManager(manager: Manager, root: string, env: NodeJS.ProcessEnv): Promise<void> {
  if (manager === 'husky') {
    await writeFile(join(root, 'package.json'), '{"name":"hook-manager-fixture","private":true}\n', 'utf8');
    await successful('husky', ['init'], root, env);
    await writeFile(join(root, '.husky', 'pre-commit'), 'git-hooked check pre-commit\n', 'utf8');
  } else if (manager === 'lefthook') {
    await writeFile(join(root, 'lefthook.yml'), 'pre-commit:\n  commands:\n    git-hooked:\n      run: git-hooked check pre-commit\n', 'utf8');
    await successful('lefthook', ['install'], root, env);
  } else if (manager === 'pre-commit') {
    await writeFile(join(root, '.pre-commit-config.yaml'), `repos:
  - repo: local
    hooks:
      - id: git-hooked-pre-commit
        name: Git Hooked pre-commit
        entry: git-hooked check pre-commit
        language: system
        pass_filenames: false
        stages: [pre-commit]
`, 'utf8');
    await successful('python', ['-m', 'pre_commit', 'install', '--hook-type', 'pre-commit'], root, env);
  }
}

async function exercise(manager: Manager): Promise<{ exitCode: number; hookOutput: string }> {
  const temporary = await mkdtemp(join(tmpdir(), `git-hooked-manager-${manager}-`));
  roots.push(temporary);
  const root = join(temporary, 'repository');
  const bin = join(temporary, 'bin');
  const hookOutputPath = join(temporary, 'hook-output.txt');
  await Promise.all([mkdir(root, { recursive: true }), createProcessShims(bin)]);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
    GIT_HOOKED_CAPTURE_OUTPUT: hookOutputPath,
    GIT_HOOKED_CAPTURE_PROMPT: join(temporary, 'agent-prompt.txt'),
    GIT_HOOKED_RECORDED_RESPONSE: join(projectRoot, 'examples', 'responses', 'pass.json'),
    GIT_HOOKED_RECORDED_EXIT: '0',
    GIT_HOOKED_GITLEAKS: 'pass',
    GIT_CONFIG_NOSYSTEM: '1',
    PRE_COMMIT_HOME: join(temporary, 'pre-commit-cache'),
  };

  await successful('git', ['init', '-q', '--initial-branch=main'], root, env);
  await successful('git', ['config', 'user.name', 'Git Hooked Manager Tests'], root, env);
  await successful('git', ['config', 'user.email', 'managers@githooked.invalid'], root, env);
  await installManager(manager, root, env);
  await successful('git-hooked', ['init'], root, env);
  await writeFile(join(root, 'README.md'), `# ${manager} fixture\n`, 'utf8');
  await successful('git', ['add', '--all'], root, env);
  await successful('git', ['commit', '-q', '--no-verify', '-m', 'fixture baseline'], root, env);
  await writeFile(join(root, '.env'), 'TOKEN=manager-fixture\n', 'utf8');
  await successful('git', ['add', '--force', '.env'], root, env);
  const result = await runCommand('git', ['commit', '-m', 'must be blocked'], { cwd: root, env, timeout: 60_000 });
  return { exitCode: result.exitCode, hookOutput: await readFile(hookOutputPath, 'utf8') };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe.skipIf(!enabled).sequential('native hook-manager workflows', () => {
  it.each<Manager>(['git', 'husky', 'lefthook', 'pre-commit'])('%s runs Git Hooked and blocks the commit', async (manager) => {
    const result = await exercise(manager);
    expect(result.exitCode).toBe(1);
    expect(result.hookOutput).toContain('Environment file staged');
    expect(result.hookOutput).toContain('Operation blocked.');
  }, 120_000);
});
