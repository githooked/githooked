import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { loadCachedReview, loadLastReview, reviewCacheKey, saveCachedReview, saveLastReview } from '../src/review/cache.js';
import { defaultConfig } from '../src/config/schema.js';

const execute = promisify(execFile); const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));
async function repository(): Promise<string> { const root = await mkdtemp(join(tmpdir(), 'git-hooked-cache-')); roots.push(root); await execute('git', ['init', '-q'], { cwd: root }); return root; }

describe('review state', () => {
  it('caches only successful validated reviews and persists the latest review', async () => {
    const root = await repository(); const result = { status: 'pass' as const, summary: 'ok', findings: [] };
    const key = reviewCacheKey('diff', defaultConfig, 'codex', []);
    await saveCachedReview(root, key, result);
    await expect(loadCachedReview(root, key)).resolves.toEqual(result);
    await saveLastReview(root, 'codex', result);
    expect((await loadLastReview(root))?.provider).toBe('codex');
  });
});
