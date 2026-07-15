import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import YAML from 'yaml';
import {
  configSchema, defaultHooks, hookConfigSchema, repositoryCheckSchema,
  type GitHookedConfig, type RepositoryCheck,
} from './schema.js';

async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }
async function atomicCreate(path: string, content: string): Promise<boolean> {
  if (await exists(path)) return false;
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  try { await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' }); await rename(temporary, path); return true; }
  finally { await rm(temporary, { force: true }); }
}

async function atomicReplace(path: string, content: string): Promise<void> {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  try { await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' }); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
}

export async function ensureConfig(root: string, config: GitHookedConfig): Promise<string[]> {
  const validated = configSchema.parse(config);
  const directory = join(root, '.githooked');
  await mkdir(join(directory, 'hooks'), { recursive: true });
  await mkdir(join(directory, 'checks'), { recursive: true });
  const files: Array<[string, string]> = [
    [join(directory, 'config.yml'), YAML.stringify(validated, { lineWidth: 0 })],
    [join(directory, 'hooks', 'pre-commit.yml'), YAML.stringify(hookConfigSchema.parse(defaultHooks['pre-commit']))],
    [join(directory, 'hooks', 'pre-push.yml'), YAML.stringify(hookConfigSchema.parse(defaultHooks['pre-push']))],
  ];
  const created: string[] = [];
  for (const [path, content] of files) if (await atomicCreate(path, content)) created.push(path);
  return created;
}

export async function writeConfig(root: string, config: GitHookedConfig): Promise<void> { await ensureConfig(root, config); }

export interface SemanticCheckDefinition {
  id: string;
  name: string;
  category: RepositoryCheck['category'];
  severity: RepositoryCheck['severity'];
  appliesTo: string[];
  instructions: string;
}

export interface RenderedSemanticCheck { manifest: string; instructions: string }

export function renderSemanticCheck(definition: SemanticCheckDefinition): RenderedSemanticCheck {
  const manifest = repositoryCheckSchema.parse({
    version: 1,
    id: definition.id,
    name: definition.name,
    type: 'semantic',
    category: definition.category,
    severity: definition.severity,
    applies_to: definition.appliesTo,
    instructions: 'instructions.md',
  });
  return {
    manifest: YAML.stringify(manifest, { lineWidth: 0 }),
    instructions: `${definition.instructions.trim()}\n`,
  };
}

export async function writeSemanticChecks(
  root: string,
  definitions: readonly SemanticCheckDefinition[],
  hookName: keyof typeof defaultHooks = 'pre-push',
): Promise<void> {
  const ids = definitions.map((definition) => definition.id);
  if (new Set(ids).size !== ids.length) throw new Error('Semantic check ids must be unique.');
  const rendered = definitions.map((definition) => ({ definition, files: renderSemanticCheck(definition) }));
  const checksRoot = join(root, '.githooked', 'checks');
  for (const id of ids) if (await exists(join(checksRoot, id))) throw new Error(`Check already exists: ${id}`);
  const hookPath = join(root, '.githooked', 'hooks', `${hookName}.yml`);
  const hook = hookConfigSchema.parse(YAML.parse(await readFile(hookPath, 'utf8')));
  for (const id of ids) {
    const reference = `check:${id}`;
    if (!hook.checks.includes(reference)) hook.checks.push(reference);
  }
  const temporaryDirectories = rendered.map(({ definition }) => ({
    final: join(checksRoot, definition.id),
    temporary: join(checksRoot, `${definition.id}.tmp-${process.pid}-${Date.now()}`),
  }));
  const installed: string[] = [];
  try {
    for (let index = 0; index < rendered.length; index += 1) {
      const directory = temporaryDirectories[index]!;
      const files = rendered[index]!.files;
      await mkdir(directory.temporary, { recursive: false });
      await writeFile(join(directory.temporary, 'check.yml'), files.manifest, { encoding: 'utf8', flag: 'wx' });
      await writeFile(join(directory.temporary, 'instructions.md'), files.instructions, { encoding: 'utf8', flag: 'wx' });
    }
    for (const directory of temporaryDirectories) {
      await rename(directory.temporary, directory.final);
      installed.push(directory.final);
    }
    await atomicReplace(hookPath, YAML.stringify(hook, { lineWidth: 0 }));
  } catch (error) {
    await Promise.all(installed.map((directory) => rm(directory, { recursive: true, force: true })));
    throw error;
  } finally {
    await Promise.all(temporaryDirectories.map((directory) => rm(directory.temporary, { recursive: true, force: true })));
  }
}

export async function writeSemanticCheck(
  root: string,
  definition: SemanticCheckDefinition,
  hookName: keyof typeof defaultHooks = 'pre-push',
): Promise<void> { await writeSemanticChecks(root, [definition], hookName); }

export async function removeSemanticChecks(
  root: string,
  ids: readonly string[],
  hookName: keyof typeof defaultHooks = 'pre-push',
): Promise<void> {
  const uniqueIds = [...new Set(ids)];
  const checksRoot = join(root, '.githooked', 'checks');
  const hookPath = join(root, '.githooked', 'hooks', `${hookName}.yml`);
  const hook = hookConfigSchema.parse(YAML.parse(await readFile(hookPath, 'utf8')));
  hook.checks = hook.checks.filter((reference) => !uniqueIds.some((id) => reference === `check:${id}`));
  const moved = uniqueIds.map((id) => ({
    original: join(checksRoot, id),
    backup: join(checksRoot, `${id}.remove-${process.pid}-${Date.now()}`),
  }));
  const completed: typeof moved = [];
  try {
    for (const item of moved) { await rename(item.original, item.backup); completed.push(item); }
    await atomicReplace(hookPath, YAML.stringify(hook, { lineWidth: 0 }));
  } catch (error) {
    for (const item of completed.reverse()) await rename(item.backup, item.original);
    throw error;
  }
  await Promise.allSettled(moved.map((item) => rm(item.backup, { recursive: true, force: true })));
}
