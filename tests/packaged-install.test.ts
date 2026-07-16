import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCommand, type CommandResult } from '../src/core/process.js';

const packageTarball = process.env.GIT_HOOKED_PACKAGE_TARBALL;
const roots: string[] = [];

function output(result: CommandResult): string {
  return [result.stdout, result.stderr].filter(Boolean).join('\n');
}

async function successful(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<CommandResult> {
  const result = await runCommand(command, args, { cwd, env, timeout: 120_000 });
  if (result.exitCode !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.exitCode}):\n${output(result)}`);
  return result;
}

async function exercise(name: string, existingHook: boolean): Promise<void> {
  if (!packageTarball) throw new Error('GIT_HOOKED_PACKAGE_TARBALL is required');
  const root = await mkdtemp(join(tmpdir(), `git-hooked-package-${name}-`));
  roots.push(root);
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: `${name}-fixture`, private: true }, null, 2));
  await writeFile(join(root, '.gitignore'), 'node_modules/\n', 'utf8');
  await successful('git', ['init', '-q', '--initial-branch=main'], root, process.env);
  await successful('git', ['config', 'user.name', 'Packaged Install Tests'], root, process.env);
  await successful('git', ['config', 'user.email', 'install@githooked.invalid'], root, process.env);
  if (existingHook) {
    const hooks = join(root, '.git', 'hooks');
    await mkdir(hooks, { recursive: true });
    const preCommit = join(hooks, 'pre-commit');
    await writeFile(preCommit, '#!/bin/sh\necho "existing hook preserved"\n', 'utf8');
    await chmod(preCommit, 0o755);
  }

  await successful('npm', ['install', '--ignore-scripts', '--save-dev', resolve(packageTarball)], root, process.env);
  const env = { ...process.env, PATH: `${join(root, 'node_modules', '.bin')}${delimiter}${process.env.PATH ?? ''}` };
  const initialized = await successful('npx', ['--no-install', 'git-hooked', 'init'], root, env);
  expect(initialized.stdout).toContain('Pre-commit hook installed');
  expect(initialized.stdout).toContain('Pre-push hook installed');
  const hook = await readFile(join(root, '.git', 'hooks', 'pre-commit'), 'utf8');
  expect(hook).toContain('node_modules/.bin/git-hooked');
  if (existingHook) expect(hook).toContain('existing hook preserved');

  await writeFile(join(root, 'README.md'), `# ${name}\n`, 'utf8');
  await successful('git', ['add', '--all'], root, env);
  const allowed = await successful('git', ['commit', '-m', 'baseline'], root, env);
  expect(output(allowed)).toContain('Gitleaks is not installed');

  await writeFile(join(root, '.env'), 'EXAMPLE_ONLY=true\n', 'utf8');
  await successful('git', ['add', '--force', '.env'], root, env);
  const blocked = await runCommand('git', ['commit', '-m', 'must be blocked'], { cwd: root, env, timeout: 60_000 });
  expect(blocked.exitCode).toBe(1);
  expect(output(blocked)).toContain('Environment file staged');
  expect(output(blocked)).toContain('Operation blocked.');
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe.skipIf(!packageTarball).sequential('packaged installation in fresh repositories', () => {
  it('installs into an empty application repository', () => exercise('application', false), 180_000);
  it('preserves an existing hook in a service repository', () => exercise('service', true), 180_000);
});
