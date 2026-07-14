import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import YAML from 'yaml';
import { ZodError, type z } from 'zod';
import { isBuiltinCheckId } from '../checks/registry.js';
import {
  configSchema, hookConfigSchema, repositoryCheckSchema,
  type GitHookedConfig, type HookConfig, type RepositoryCheck,
} from './schema.js';

export class ConfigError extends Error {}

export interface LoadedRepositoryCheck extends RepositoryCheck {
  directory: string;
  instructionsText?: string;
}

export interface ProjectConfig {
  config: GitHookedConfig;
  hooks: Record<'pre-commit' | 'pre-push', HookConfig>;
  checks: Map<string, LoadedRepositoryCheck>;
}

async function parseYaml<S extends z.ZodTypeAny>(path: string, schema: S): Promise<z.output<S>> {
  try {
    const stats = await lstat(path);
    if (stats.isSymbolicLink()) throw new ConfigError(`Refusing to load symlinked configuration file: ${path}`);
    if (!stats.isFile()) throw new ConfigError(`Configuration path is not a regular file: ${path}`);
    const raw: unknown = YAML.parse(await readFile(path, 'utf8'));
    return schema.parse(raw);
  } catch (error) {
    if (error instanceof ZodError) {
      const details = error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join('\n');
      throw new ConfigError(`Invalid ${path}:\n${details}`);
    }
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') throw new ConfigError(`Missing ${path}. Run \`git-hooked init\` first.`);
    throw error;
  }
}

async function safeChild(parent: string, child: string): Promise<string> {
  const lexical = resolve(parent, child);
  const lexicalRelative = relative(parent, lexical);
  if (lexicalRelative.startsWith('..') || isAbsolute(lexicalRelative)) throw new ConfigError(`Instructions path escapes its check directory: ${child}`);
  const [resolvedParent, resolvedFile] = await Promise.all([realpath(parent), realpath(lexical)]);
  const resolvedRelative = relative(resolvedParent, resolvedFile);
  if (resolvedRelative.startsWith('..') || isAbsolute(resolvedRelative)) throw new ConfigError(`Instructions symlink escapes its check directory: ${child}`);
  const stats = await lstat(resolvedFile);
  if (!stats.isFile()) throw new ConfigError(`Instructions must be a regular file: ${child}`);
  if (stats.size > 64 * 1024) throw new ConfigError(`Instructions exceed the 64 KiB limit: ${child}`);
  return resolvedFile;
}

async function loadRepositoryCheck(root: string, id: string): Promise<LoadedRepositoryCheck> {
  const directory = join(root, '.githooked', 'checks', id);
  const check = await parseYaml(join(directory, 'check.yml'), repositoryCheckSchema);
  if (check.id !== id) throw new ConfigError(`Check directory ${id} contains manifest id ${check.id}; these must match.`);
  let instructionsText: string | undefined;
  if (check.instructions) instructionsText = await readFile(await safeChild(directory, check.instructions), 'utf8');
  return { ...check, directory, ...(instructionsText === undefined ? {} : { instructionsText }) };
}

export async function loadConfig(root: string): Promise<GitHookedConfig> {
  return parseYaml(join(root, '.githooked', 'config.yml'), configSchema);
}

export async function loadProjectConfig(root: string): Promise<ProjectConfig> {
  const config = await parseYaml(join(root, '.githooked', 'config.yml'), configSchema);
  const hooks = {
    'pre-commit': await parseYaml(join(root, '.githooked', 'hooks', 'pre-commit.yml'), hookConfigSchema),
    'pre-push': await parseYaml(join(root, '.githooked', 'hooks', 'pre-push.yml'), hookConfigSchema),
  };
  const checks = new Map<string, LoadedRepositoryCheck>();
  for (const reference of new Set([...hooks['pre-commit'].checks, ...hooks['pre-push'].checks])) {
    if (reference.startsWith('builtin:')) {
      const id = reference.slice('builtin:'.length);
      if (!isBuiltinCheckId(id)) throw new ConfigError(`Unknown built-in check: ${id}`);
    } else {
      const id = reference.slice('check:'.length);
      checks.set(id, await loadRepositoryCheck(root, id));
    }
  }
  return { config, hooks, checks };
}
