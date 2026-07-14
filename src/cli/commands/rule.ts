import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import YAML from 'yaml';
import { ConfigError, loadProjectConfig } from '../../config/load.js';
import { hookConfigSchema, repositoryCheckSchema } from '../../config/schema.js';
import { findRepositoryRoot } from '../../git/repository.js';

function slugify(rule: string): string {
  return rule.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60).replace(/-$/g, '') || 'repository-rule';
}
async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }
async function atomicReplace(path: string, content: string): Promise<void> {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  try { await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' }); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
}

export async function addRuleCommand(rule: string, cwd = process.cwd()): Promise<void> {
  const normalized = rule.trim();
  if (!normalized) throw new ConfigError('Rule cannot be empty.');
  const root = await findRepositoryRoot(cwd);
  const project = await loadProjectConfig(root);
  for (const check of project.checks.values()) {
    if (check.type === 'semantic' && check.instructionsText?.trim().toLowerCase() === normalized.toLowerCase()) {
      console.log(`✓ Rule already exists: ${check.id}`);
      return;
    }
  }
  const base = slugify(normalized);
  let id = base;
  let suffix = 2;
  const checksRoot = join(root, '.githooked', 'checks');
  while (project.checks.has(id) || await exists(join(checksRoot, id))) id = `${base}-${suffix++}`;
  const directory = join(root, '.githooked', 'checks', id);
  const temporaryDirectory = `${directory}.tmp-${process.pid}-${Date.now()}`;
  await mkdir(temporaryDirectory, { recursive: false });
  const manifest = repositoryCheckSchema.parse({ version: 1, id, name: normalized, type: 'semantic', category: 'repository-rule', severity: 'high', instructions: 'instructions.md' });
  const hookPath = join(root, '.githooked', 'hooks', 'pre-push.yml');
  const originalHook = await readFile(hookPath, 'utf8');
  const hook = hookConfigSchema.parse(YAML.parse(originalHook));
  const reference = `check:${id}`;
  if (!hook.checks.includes(reference)) hook.checks.push(reference);
  try {
    await writeFile(join(temporaryDirectory, 'check.yml'), YAML.stringify(manifest, { lineWidth: 0 }), { encoding: 'utf8', flag: 'wx' });
    await writeFile(join(temporaryDirectory, 'instructions.md'), `${normalized}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(temporaryDirectory, directory);
    try { await atomicReplace(hookPath, YAML.stringify(hook, { lineWidth: 0 })); }
    catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
  } finally { await rm(temporaryDirectory, { recursive: true, force: true }); }
  console.log(`✓ Added rule ${id}\n  ${normalized}`);
}
