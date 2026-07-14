import { resolve } from 'node:path';
import type { CommandRunner } from '../core/process.js';
import { runCommand } from '../core/process.js';

export async function findRepositoryRoot(cwd: string, run: CommandRunner = runCommand): Promise<string> {
  const result = await run('git', ['rev-parse', '--show-toplevel'], { cwd, timeout: 10_000 });
  if (result.exitCode !== 0) throw new Error('Git Hooked must be run inside a Git repository.');
  return resolve(result.stdout.trim());
}

export async function getGitDir(root: string, run: CommandRunner = runCommand): Promise<string> {
  const result = await run('git', ['rev-parse', '--git-path', 'hooks'], { cwd: root, timeout: 10_000 });
  if (result.exitCode !== 0) throw new Error('Could not locate the Git hooks directory.');
  return resolve(root, result.stdout.trim());
}
