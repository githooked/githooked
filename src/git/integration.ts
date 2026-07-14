import { access } from 'node:fs/promises';
import { join } from 'node:path';

export interface HookManager { marker: string; name: string }
const managers: HookManager[] = [
  { marker: '.husky', name: 'Husky' }, { marker: 'lefthook.yml', name: 'Lefthook' },
  { marker: 'lefthook.yaml', name: 'Lefthook' }, { marker: '.pre-commit-config.yaml', name: 'pre-commit' },
];

export async function detectHookManager(root: string): Promise<HookManager | undefined> {
  for (const manager of managers) {
    try { await access(join(root, manager.marker)); return manager; }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
  }
  return undefined;
}

export function manualIntegration(manager: HookManager): string {
  const heading = `${manager.name} detected (${manager.marker}). Add Git Hooked through ${manager.name}:`;
  if (manager.name === 'Husky') {
    return `${heading}\n\n.husky/pre-commit:\n  npx --no-install git-hooked check pre-commit\n\n.husky/pre-push:\n  npx --no-install git-hooked check pre-push "$@"`;
  }
  if (manager.name === 'Lefthook') {
    return `${heading}\n\npre-commit:\n  commands:\n    git-hooked:\n      run: npx --no-install git-hooked check pre-commit\npre-push:\n  commands:\n    git-hooked:\n      run: npx --no-install git-hooked check pre-push`;
  }
  return `${heading}\n\nAdd these hooks under an existing repo: local entry in .pre-commit-config.yaml:\n  hooks:\n    - id: git-hooked-pre-commit\n      name: Git Hooked pre-commit\n      entry: npx --no-install git-hooked check pre-commit\n      language: system\n      pass_filenames: false\n      stages: [pre-commit]\n    - id: git-hooked-pre-push\n      name: Git Hooked pre-push\n      entry: npx --no-install git-hooked check pre-push\n      language: system\n      pass_filenames: false\n      stages: [pre-push]\n\nThen run: pre-commit install --hook-type pre-commit --hook-type pre-push`;
}
