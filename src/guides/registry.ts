import { lstat, readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isAbsolute, join, relative, resolve } from 'node:path';
import YAML from 'yaml';
import { guidePackSchema, type GuideCheck, type GuidePack } from './schema.js';

export const guidePackIds = [
  'security/web-api',
  'security/multi-tenant',
  'security/payments',
  'quality/api',
  'quality/database',
] as const;

export type GuidePackId = typeof guidePackIds[number];
export interface LoadedGuideCheck extends GuideCheck { instructionsText: string }
export interface LoadedGuidePack extends Omit<GuidePack, 'checks'> { directory: string; checks: LoadedGuideCheck[] }

const packsRoot = fileURLToPath(new URL('../../guide-packs/', import.meta.url));

export class GuideError extends Error {}

function isGuidePackId(value: string): value is GuidePackId { return (guidePackIds as readonly string[]).includes(value); }

async function regularFile(path: string, maxBytes: number): Promise<void> {
  const stats = await lstat(path);
  if (stats.isSymbolicLink() || !stats.isFile()) throw new GuideError(`Guide resource is not a regular file: ${path}`);
  if (stats.size > maxBytes) throw new GuideError(`Guide resource exceeds ${maxBytes} bytes: ${path}`);
}

async function safeResource(directory: string, resource: string): Promise<string> {
  const lexical = resolve(directory, resource);
  const lexicalRelative = relative(directory, lexical);
  if (lexicalRelative.startsWith('..') || isAbsolute(lexicalRelative)) throw new GuideError(`Guide resource escapes its pack: ${resource}`);
  const [resolvedDirectory, resolvedFile] = await Promise.all([realpath(directory), realpath(lexical)]);
  const resolvedRelative = relative(resolvedDirectory, resolvedFile);
  if (resolvedRelative.startsWith('..') || isAbsolute(resolvedRelative)) throw new GuideError(`Guide resource symlink escapes its pack: ${resource}`);
  await regularFile(resolvedFile, 64 * 1024);
  return resolvedFile;
}

export async function loadGuidePack(id: string): Promise<LoadedGuidePack> {
  if (!isGuidePackId(id)) throw new GuideError(`Unknown guide pack: ${id}`);
  const directory = join(packsRoot, ...id.split('/'));
  const manifestPath = join(directory, 'pack.yml');
  await regularFile(manifestPath, 64 * 1024);
  let parsed: unknown;
  try { parsed = YAML.parse(await readFile(manifestPath, 'utf8')); }
  catch (error) { throw new GuideError(`Could not parse guide pack ${id}: ${error instanceof Error ? error.message : String(error)}`); }
  const pack = guidePackSchema.parse(parsed);
  if (pack.id !== id) throw new GuideError(`Guide registry id ${id} does not match manifest id ${pack.id}.`);
  const checks: LoadedGuideCheck[] = [];
  for (const check of pack.checks) {
    const instructionsPath = await safeResource(directory, check.instructions);
    checks.push({ ...check, instructionsText: await readFile(instructionsPath, 'utf8') });
  }
  return { ...pack, directory, checks };
}

export async function listGuidePacks(): Promise<LoadedGuidePack[]> {
  return Promise.all(guidePackIds.map((id) => loadGuidePack(id)));
}
