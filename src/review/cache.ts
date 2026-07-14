import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { SemanticCheckInput } from '../agents/types.js';
import type { GitHookedConfig } from '../config/schema.js';
import { getGitPath } from '../git/repository.js';
import { reviewResultSchema, type ReviewResult } from './result.js';

const lastReviewSchema = z.object({ provider: z.string(), createdAt: z.string().datetime(), result: reviewResultSchema }).strict();
export type LastReview = z.infer<typeof lastReviewSchema>;

async function atomicWrite(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  try { await writeFile(temporary, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600 }); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
}

async function stateDirectory(root: string): Promise<string> {
  const directory = await getGitPath(root, 'githooked');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  return directory;
}

export function reviewCacheKey(diff: string, config: GitHookedConfig, provider: string, checks: SemanticCheckInput[]): string {
  return createHash('sha256').update(JSON.stringify({ diff, config, provider, checks })).digest('hex');
}

export async function loadCachedReview(root: string, key: string): Promise<ReviewResult | undefined> {
  try {
    const parsed = reviewResultSchema.parse(JSON.parse(await readFile(join(await stateDirectory(root), 'cache', `${key}.json`), 'utf8')));
    return parsed.status === 'pass' ? parsed : undefined;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    return undefined;
  }
}

export async function saveCachedReview(root: string, key: string, result: ReviewResult): Promise<void> {
  if (result.status !== 'pass') return;
  const directory = join(await stateDirectory(root), 'cache'); await mkdir(directory, { recursive: true, mode: 0o700 });
  await atomicWrite(join(directory, `${key}.json`), reviewResultSchema.parse(result));
}

export async function saveLastReview(root: string, provider: string, result: ReviewResult): Promise<void> {
  await atomicWrite(join(await stateDirectory(root), 'last-review.json'), { provider, createdAt: new Date().toISOString(), result: reviewResultSchema.parse(result) });
}

export async function loadLastReview(root: string): Promise<LastReview | undefined> {
  try { return lastReviewSchema.parse(JSON.parse(await readFile(join(await stateDirectory(root), 'last-review.json'), 'utf8'))); }
  catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined; throw error; }
}

export async function clearLastReview(root: string): Promise<void> { await rm(join(await stateDirectory(root), 'last-review.json'), { force: true }); }
