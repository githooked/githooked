import { access, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import YAML from 'yaml';
import { configSchema, defaultHooks, hookConfigSchema, type GitHookedConfig } from './schema.js';

async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }
async function atomicCreate(path: string, content: string): Promise<boolean> {
  if (await exists(path)) return false;
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  try { await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' }); await rename(temporary, path); return true; }
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
