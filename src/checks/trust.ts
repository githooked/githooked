import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { CommandRunner } from '../core/process.js';
import { runCommand } from '../core/process.js';

async function files(directory: string, root = directory): Promise<Array<{ path: string; content: Buffer }>> {
  const result: Array<{ path: string; content: Buffer }> = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const stats = await lstat(path);
    if (stats.isSymbolicLink()) throw new Error(`Refusing to trust symlinked configuration: ${relative(root, path)}`);
    if (stats.isDirectory()) result.push(...await files(path, root));
    else if (stats.isFile()) {
      if (stats.size > 1024 * 1024) throw new Error(`Trust source exceeds 1 MiB: ${relative(root, path)}`);
      result.push({ path: relative(root, path), content: await readFile(path) });
    }
  }
  return result;
}

export async function configurationTrustHash(root: string): Promise<string> {
  const entries = await files(join(root, '.githooked'));
  entries.sort((a, b) => a.path.localeCompare(b.path));
  const hash = createHash('sha256');
  for (const entry of entries) hash.update(entry.path).update('\0').update(entry.content).update('\0');
  return hash.digest('hex');
}

export async function readTrustedHash(root: string, run: CommandRunner = runCommand): Promise<string | undefined> {
  const result = await run('git', ['config', '--local', '--get', 'githooked.trustedConfigHash'], { cwd: root, timeout: 10_000 });
  return result.exitCode === 0 ? result.stdout.trim() : undefined;
}

export async function writeTrustedHash(root: string, hash: string, run: CommandRunner = runCommand): Promise<void> {
  const result = await run('git', ['config', '--local', 'githooked.trustedConfigHash', hash], { cwd: root, timeout: 10_000 });
  if (result.exitCode !== 0) throw new Error(`Could not store command-check trust: ${result.stderr.trim()}`);
}

export async function commandChecksTrusted(root: string, run: CommandRunner = runCommand): Promise<boolean> {
  return await readTrustedHash(root, run) === await configurationTrustHash(root);
}
