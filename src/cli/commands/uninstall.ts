import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { getGitDir, findRepositoryRoot } from '../../git/repository.js';
import { uninstallHooks } from '../../git/hooks.js';

export async function uninstallCommand(removeConfig: boolean, cwd = process.cwd()): Promise<void> {
  const root = await findRepositoryRoot(cwd);
  await uninstallHooks(await getGitDir(root));
  console.log('✓ Removed Git Hooked entries from pre-commit and pre-push hooks');
  if (removeConfig) { await rm(join(root, '.githooked'), { recursive: true, force: true }); console.log('✓ Removed .githooked configuration'); }
  else console.log('✓ Preserved .githooked configuration');
}
