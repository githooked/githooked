import { chmod, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const START = '# >>> git-hooked managed >>>';
const END = '# <<< git-hooked managed <<<';

function block(hook: string): string {
  return `${START}
if [ "\${GIT_HOOKED_SKIP:-}" = "1" ]; then
  echo "WARNING: Git Hooked check bypassed via GIT_HOOKED_SKIP=1" >&2
else
  GIT_HOOKED_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit $?
  GIT_HOOKED_LOCAL="$GIT_HOOKED_ROOT/node_modules/.bin/git-hooked"
  if [ -x "$GIT_HOOKED_LOCAL" ]; then
    "$GIT_HOOKED_LOCAL" check ${hook} "$@" || exit $?
  elif command -v git-hooked >/dev/null 2>&1; then
    git-hooked check ${hook} "$@" || exit $?
  else
    echo "Git Hooked CLI not found. Run: npm install --save-dev @githooked/cli" >&2
    exit 127
  fi
fi
${END}`;
}

function managedPattern(): RegExp {
  return new RegExp(`${START.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
}

export function addManagedBlock(content: string, hook: string): string {
  if (content.includes(START) !== content.includes(END)) throw new Error(`The ${hook} hook contains an incomplete Git Hooked managed block.`);
  if (content.includes(START)) return content.replace(managedPattern(), block(hook));
  const prefix = content.length === 0 ? '#!/bin/sh\n' : content.endsWith('\n') ? content : `${content}\n`;
  return `${prefix}${block(hook)}\n`;
}

export function removeManagedBlock(content: string): string {
  const pattern = new RegExp(`\\n?${managedPattern().source}\\n?`);
  return content.replace(pattern, '\n').replace(/^\n/, '');
}

async function existing(path: string): Promise<{ content: string; mode: number }> {
  try {
    const stats = await lstat(path);
    if (stats.isSymbolicLink()) throw new Error(`Refusing to modify symlinked Git hook: ${path}`);
    if (!stats.isFile()) throw new Error(`Git hook is not a regular file: ${path}`);
    return { content: await readFile(path, 'utf8'), mode: stats.mode & 0o777 };
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return { content: '', mode: 0o755 };
    throw error;
  }
}

async function atomicWrite(path: string, content: string, mode: number): Promise<void> {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  try { await writeFile(temporary, content, { encoding: 'utf8', mode: mode | 0o100 }); await rename(temporary, path); await chmod(path, mode | 0o100); }
  finally { await rm(temporary, { force: true }); }
}

export async function installHooks(hooksDir: string): Promise<void> {
  await mkdir(hooksDir, { recursive: true });
  for (const hook of ['pre-commit', 'pre-push']) {
    const path = join(hooksDir, hook);
    const current = await existing(path);
    await atomicWrite(path, addManagedBlock(current.content, hook), current.mode);
  }
}

export async function uninstallHooks(hooksDir: string): Promise<void> {
  for (const hook of ['pre-commit', 'pre-push']) {
    const path = join(hooksDir, hook);
    const current = await existing(path);
    if (current.content.includes(START)) await atomicWrite(path, removeManagedBlock(current.content), current.mode);
  }
}

export async function hookStatus(hooksDir: string, hook: 'pre-commit' | 'pre-push'): Promise<'installed' | 'missing' | 'partial'> {
  const current = await existing(join(hooksDir, hook));
  const start = current.content.includes(START); const end = current.content.includes(END);
  return start && end ? 'installed' : start || end ? 'partial' : 'missing';
}
