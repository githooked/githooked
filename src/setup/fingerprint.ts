import { lstat, readFile, readdir } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';
import type { RepositoryFingerprint, RepositoryProposalContext, SelectedRepositoryFile } from './proposal.js';

const MAX_SCANNED_FILES = 5_000;
const MAX_MAP_FILES = 400;
const MAX_SELECTED_FILES = 18;
const MAX_SELECTED_BYTES = 48_000;
const MAX_FILE_EXCERPT_BYTES = 6_000;
const excludedDirectories = new Set([
  '.git', 'node_modules', 'vendor', 'dist', 'build', 'coverage', '.next', '.nuxt', '.turbo', 'target', 'out', '.venv', 'venv', '__pycache__',
]);
const sensitivePath = /(^|\/)(?:\.env(?:\.|$)|credentials?(?:\.|$)|secrets?(?:\.|$)|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$))|\.(?:pem|key|p12|pfx|jks)$/i;
const sourceExtension = /\.(?:[cm]?[jt]sx?|py|go|rs|rb|php|java|kt|cs|sql)$/i;
const relevantSourcePath = /(^|\/)(?:auth|session|security|routes?|controllers?|handlers?|api|db|database|prisma|models?)(?:\/|\.|$)/i;
const manifestNames = new Set([
  'package.json', 'tsconfig.json', 'pyproject.toml', 'requirements.txt', 'go.mod', 'cargo.toml', 'gemfile', 'composer.json', 'pom.xml', 'build.gradle', 'schema.prisma',
]);

function posixPath(path: string): string { return path.split(sep).join('/'); }
function uniqueSorted(values: Iterable<string>): string[] { return [...new Set(values)].sort((a, b) => a.localeCompare(b)); }
function hasOwnRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

async function repositoryFiles(root: string): Promise<{ files: string[]; truncated: boolean }> {
  const pending = [''];
  const files: string[] = [];
  let truncated = false;
  while (pending.length) {
    const directory = pending.shift()!;
    let entries;
    try { entries = await readdir(join(root, directory), { withFileTypes: true }); }
    catch { continue; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const relativePath = posixPath(join(directory, entry.name));
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!excludedDirectories.has(entry.name)) pending.push(relativePath);
        continue;
      }
      if (!entry.isFile() || sensitivePath.test(relativePath)) continue;
      files.push(relativePath);
      if (files.length >= MAX_SCANNED_FILES) { truncated = true; return { files: files.sort(), truncated }; }
    }
  }
  return { files: files.sort(), truncated };
}

function languageFor(path: string): string | undefined {
  const extension = path.slice(path.lastIndexOf('.')).toLowerCase();
  return ({
    '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
    '.py': 'Python', '.go': 'Go', '.rs': 'Rust', '.rb': 'Ruby', '.php': 'PHP', '.java': 'Java', '.kt': 'Kotlin', '.cs': 'C#', '.sql': 'SQL',
  } as Record<string, string>)[extension];
}

async function dependencies(root: string, files: string[]): Promise<Set<string>> {
  const result = new Set<string>();
  for (const path of files.filter((candidate) => basename(candidate).toLowerCase() === 'package.json').slice(0, 30)) {
    try {
      const stats = await lstat(join(root, path));
      if (stats.size > 256_000) continue;
      const parsed: unknown = JSON.parse(await readFile(join(root, path), 'utf8'));
      if (!hasOwnRecord(parsed)) continue;
      for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
        const values = parsed[field];
        if (hasOwnRecord(values)) for (const name of Object.keys(values)) result.add(name.toLowerCase());
      }
    } catch { /* A malformed manifest is still represented in the repository map. */ }
  }
  return result;
}

function detectedPackages(deps: Set<string>, definitions: Array<[string, string]>): string[] {
  return definitions.filter(([dependency]) => deps.has(dependency)).map(([, display]) => display);
}

function fingerprint(files: string[], deps: Set<string>): RepositoryFingerprint {
  const languageCounts = new Map<string, number>();
  for (const path of files) {
    const language = languageFor(path);
    if (language) languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1);
  }
  const basenames = new Set(files.map((path) => basename(path).toLowerCase()));
  return {
    languages: [...languageCounts].map(([name, count]) => ({ name, files: count })).sort((a, b) => b.files - a.files || a.name.localeCompare(b.name)),
    frameworks: detectedPackages(deps, [
      ['express', 'Express'], ['fastify', 'Fastify'], ['@nestjs/core', 'NestJS'], ['next', 'Next.js'], ['koa', 'Koa'], ['hono', 'Hono'], ['@hapi/hapi', 'hapi'],
    ]),
    packageManagers: [
      basenames.has('pnpm-lock.yaml') ? 'pnpm' : undefined,
      basenames.has('yarn.lock') ? 'Yarn' : undefined,
      basenames.has('package-lock.json') ? 'npm' : undefined,
      basenames.has('bun.lock') || basenames.has('bun.lockb') ? 'Bun' : undefined,
    ].filter((value): value is string => value !== undefined),
    databaseClients: detectedPackages(deps, [
      ['@prisma/client', 'Prisma'], ['prisma', 'Prisma'], ['drizzle-orm', 'Drizzle ORM'], ['sequelize', 'Sequelize'], ['knex', 'Knex'], ['typeorm', 'TypeORM'], ['mongoose', 'Mongoose'], ['pg', 'PostgreSQL'], ['mysql2', 'MySQL'],
    ]),
    authenticationLibraries: detectedPackages(deps, [
      ['next-auth', 'NextAuth'], ['@auth/core', 'Auth.js'], ['passport', 'Passport'], ['jsonwebtoken', 'jsonwebtoken'], ['jose', 'jose'], ['@clerk/backend', 'Clerk'], ['@clerk/nextjs', 'Clerk'], ['lucia', 'Lucia'],
    ]),
    testTools: detectedPackages(deps, [
      ['vitest', 'Vitest'], ['jest', 'Jest'], ['mocha', 'Mocha'], ['@playwright/test', 'Playwright'], ['cypress', 'Cypress'], ['tap', 'tap'],
    ]),
    apiEntryPoints: files.filter((path) => sourceExtension.test(path) && (relevantSourcePath.test(path) || /(^|\/)(?:server|app|main)\.[^/]+$/i.test(path))).slice(0, 40),
  };
}

async function selectedFiles(root: string, files: string[]): Promise<SelectedRepositoryFile[]> {
  const ranked = files.map((path) => {
    const name = basename(path).toLowerCase();
    const priority = path.startsWith('.githooked/') ? 0 : manifestNames.has(name) ? 1 : relevantSourcePath.test(path) && sourceExtension.test(path) ? 2 : 3;
    return { path, priority };
  }).filter((entry) => entry.priority < 3).sort((a, b) => a.priority - b.priority || a.path.localeCompare(b.path));
  const chosen = [
    ...ranked.filter((entry) => entry.priority === 0).slice(0, 6),
    ...ranked.filter((entry) => entry.priority === 1).slice(0, 6),
    ...ranked.filter((entry) => entry.priority === 2).slice(0, 6),
  ];
  const chosenPaths = new Set(chosen.map((entry) => entry.path));
  for (const entry of ranked) {
    if (chosen.length >= MAX_SELECTED_FILES) break;
    if (!chosenPaths.has(entry.path)) { chosen.push(entry); chosenPaths.add(entry.path); }
  }
  const selected: SelectedRepositoryFile[] = [];
  let totalBytes = 0;
  for (const { path } of chosen) {
    if (selected.length >= MAX_SELECTED_FILES || totalBytes >= MAX_SELECTED_BYTES) break;
    try {
      const stats = await lstat(join(root, path));
      if (!stats.isFile() || stats.size > 1_000_000) continue;
      const raw = await readFile(join(root, path), 'utf8');
      if (raw.includes('\0')) continue;
      const remaining = Math.min(MAX_FILE_EXCERPT_BYTES, MAX_SELECTED_BYTES - totalBytes);
      const content = Buffer.from(raw).subarray(0, remaining).toString('utf8');
      const truncated = Buffer.byteLength(raw) > Buffer.byteLength(content);
      selected.push({ path, content, truncated });
      totalBytes += Buffer.byteLength(content);
    } catch { /* Files can change during discovery; omit unstable excerpts. */ }
  }
  return selected;
}

export async function discoverRepository(root: string): Promise<RepositoryProposalContext> {
  const discovered = await repositoryFiles(root);
  const deps = await dependencies(root, discovered.files);
  const selected = await selectedFiles(root, discovered.files);
  const selectedPaths = selected.map((file) => file.path);
  const selectedSet = new Set(selectedPaths);
  const mappedSet = new Set(discovered.files.slice(0, MAX_MAP_FILES));
  for (const path of selectedPaths) {
    if (mappedSet.has(path)) continue;
    if (mappedSet.size >= MAX_MAP_FILES) {
      const replaceable = [...mappedSet].reverse().find((candidate) => !selectedSet.has(candidate));
      if (replaceable) mappedSet.delete(replaceable);
    }
    mappedSet.add(path);
  }
  const mapped = uniqueSorted(mappedSet);
  return {
    fingerprint: fingerprint(discovered.files, deps),
    repositoryMap: {
      files: mapped,
      scannedFiles: discovered.files.length,
      truncated: discovered.truncated || discovered.files.length > MAX_MAP_FILES,
    },
    selectedFiles: selected,
  };
}

export function repositoryRelativePath(root: string, path: string): string {
  return posixPath(relative(root, path));
}
