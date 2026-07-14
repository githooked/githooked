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
  return `${manager.name} detected (${manager.marker}). Add these commands through ${manager.name}:\n  git-hooked check pre-commit\n  git-hooked check pre-push "$@"`;
}
