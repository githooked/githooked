import type { CommandRunner } from '../core/process.js';
import { runCommand } from '../core/process.js';

export type HookName = 'pre-commit' | 'pre-push';
export interface PushUpdate { localRef: string; localSha: string; remoteRef: string; remoteSha: string }
export interface PushContext { remoteName?: string; updates: PushUpdate[] }
export interface CollectedDiff { content: string; files: string[]; partial: boolean; omittedFiles?: number; base?: string; note?: string }
const MAX_DIFF_BYTES = 200_000;
const ZERO_SHA = /^0+$/;
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

async function git(root: string, args: string[], run: CommandRunner): Promise<string | undefined> {
  const result = await run('git', args, { cwd: root, timeout: 30_000 });
  return result.exitCode === 0 ? result.stdout.trim() : undefined;
}

function nulNames(value: string): string[] { return value.split('\0').filter((name) => name.length > 0); }

async function runDiff(root: string, diffArgs: string[], run: CommandRunner): Promise<{ content: string; files: string[] }> {
  const [diffResult, namesResult] = await Promise.all([
    run('git', [...diffArgs, '--no-ext-diff', '--unified=3', '--diff-filter=ACMRT', '--', '.'], { cwd: root, timeout: 30_000 }),
    run('git', [...diffArgs, '--name-only', '-z', '--diff-filter=ACMRT', '--', '.'], { cwd: root, timeout: 30_000 }),
  ]);
  if (diffResult.exitCode !== 0) throw new Error(`Could not collect diff: ${diffResult.stderr.trim()}`);
  if (namesResult.exitCode !== 0) throw new Error(`Could not collect changed filenames: ${namesResult.stderr.trim()}`);
  return { content: diffResult.stdout, files: nulNames(namesResult.stdout) };
}

export function parsePushUpdates(input: string): PushUpdate[] {
  return input.split(/\r?\n/).filter(Boolean).map((line) => {
    const parts = line.split(' ');
    if (parts.length !== 4) throw new Error(`Malformed pre-push update: ${line}`);
    const [, localSha, , remoteSha] = parts;
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(localSha!) || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(remoteSha!)) throw new Error(`Malformed pre-push object ID: ${line}`);
    return { localRef: parts[0]!, localSha: localSha!, remoteRef: parts[2]!, remoteSha: remoteSha! };
  });
}

function limitDiff(full: string): { content: string; partial: boolean; omittedFiles?: number } {
  if (Buffer.byteLength(full) <= MAX_DIFF_BYTES) return { content: full, partial: false };
  const patches = full.split(/(?=^diff --git )/m).filter(Boolean);
  const selected: string[] = [];
  let size = 0;
  for (const patch of patches) {
    const bytes = Buffer.byteLength(patch);
    if (size + bytes > MAX_DIFF_BYTES) break;
    selected.push(patch); size += bytes;
  }
  if (selected.length === 0 && patches[0]) {
    let first = '';
    for (const line of patches[0].split(/(?<=\n)/)) {
      if (Buffer.byteLength(first) + Buffer.byteLength(line) > MAX_DIFF_BYTES) break;
      first += line;
    }
    selected.push(first);
  }
  return { content: selected.join(''), partial: true, omittedFiles: Math.max(0, patches.length - selected.length) };
}

export async function collectDiff(root: string, hook: HookName, run: CommandRunner = runCommand, push?: PushContext): Promise<CollectedDiff> {
  let chunks: Array<{ content: string; files: string[] }>;
  let base: string | undefined;
  let note: string | undefined;
  if (hook === 'pre-commit') {
    chunks = [await runDiff(root, ['diff', '--cached'], run)];
  } else if (push?.updates.length) {
    const ranges: string[][] = [];
    for (const update of push.updates) {
      if (ZERO_SHA.test(update.localSha)) continue;
      let rangeBase = update.remoteSha;
      if (ZERO_SHA.test(rangeBase)) {
        const remoteHead = push.remoteName ? `refs/remotes/${push.remoteName}/HEAD` : undefined;
        rangeBase = remoteHead ? await git(root, ['merge-base', update.localSha, remoteHead], run) ?? EMPTY_TREE : EMPTY_TREE;
        note = rangeBase === EMPTY_TREE ? 'New branch has no remote merge base; reviewing its complete tree.' : `New branch compared with ${remoteHead}.`;
      }
      base ??= rangeBase;
      ranges.push(['diff', `${rangeBase}..${update.localSha}`]);
    }
    chunks = await Promise.all(ranges.map((args) => runDiff(root, args, run)));
  } else {
    const upstream = await git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], run);
    base = upstream ? await git(root, ['merge-base', 'HEAD', upstream], run) : undefined;
    if (!base) { base = EMPTY_TREE; note = 'No upstream was found; reviewing the complete HEAD tree.'; }
    chunks = [await runDiff(root, ['diff', `${base}..HEAD`], run)];
  }
  const full = chunks.map((chunk) => chunk.content).join('\n');
  const files = [...new Set(chunks.flatMap((chunk) => chunk.files))];
  const limited = limitDiff(full);
  const limitNote = limited.partial ? `Analysis is partial${limited.omittedFiles ? `; ${limited.omittedFiles} file patches were omitted` : ''}.` : undefined;
  const combinedNote = [note, limitNote].filter(Boolean).join(' ');
  return { ...limited, files, ...(base ? { base } : {}), ...(combinedNote ? { note: combinedNote } : {}) };
}
