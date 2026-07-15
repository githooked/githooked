import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import YAML from 'yaml';
import { hookConfigSchema, repositoryCheckSchema, type RepositoryCheck } from '../config/schema.js';
import type { RuleImplementation } from './plan.js';

interface RenderedCheck {
  id: string;
  manifest: RepositoryCheck;
  files: Array<{ name: string; content: string }>;
}

async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }

function componentId(id: string, suffix: 'deterministic' | 'semantic'): string {
  return `${id.slice(0, 79 - suffix.length).replace(/-$/g, '')}-${suffix}`;
}

export function ruleCheckIds(implementation: RuleImplementation): string[] {
  if (implementation.kind !== 'hybrid') return [implementation.id];
  return [componentId(implementation.id, 'deterministic'), componentId(implementation.id, 'semantic')];
}

function semanticCheck(implementation: RuleImplementation, id = implementation.id): RenderedCheck {
  if (implementation.kind === 'command') throw new Error('A command implementation has no semantic definition.');
  const manifest = repositoryCheckSchema.parse({
    version: 1,
    id,
    name: implementation.kind === 'hybrid' ? `${implementation.name} (semantic)` : implementation.name,
    type: 'semantic',
    category: 'repository-rule',
    severity: implementation.severity,
    applies_to: implementation.applies_to,
    instructions: 'instructions.md',
  });
  return { id, manifest, files: [{ name: 'instructions.md', content: `${implementation.semantic.instructions.trim()}\n` }] };
}

function commandCheck(implementation: RuleImplementation, id = implementation.id): RenderedCheck {
  if (implementation.kind === 'semantic') throw new Error('A semantic implementation has no command definition.');
  const manifest = repositoryCheckSchema.parse({
    version: 1,
    id,
    name: implementation.kind === 'hybrid' ? `${implementation.name} (deterministic)` : implementation.name,
    type: 'command',
    category: 'repository-rule',
    severity: implementation.severity,
    applies_to: implementation.applies_to,
    command: {
      executable: 'node',
      args: [implementation.command.script.filename],
      timeout_ms: implementation.command.timeout_ms,
    },
  });
  return { id, manifest, files: [{ name: implementation.command.script.filename, content: `${implementation.command.script.source.trimEnd()}\n` }] };
}

function render(implementation: RuleImplementation): RenderedCheck[] {
  if (implementation.kind === 'semantic') return [semanticCheck(implementation)];
  if (implementation.kind === 'command') return [commandCheck(implementation)];
  return [
    commandCheck(implementation, componentId(implementation.id, 'deterministic')),
    semanticCheck(implementation, componentId(implementation.id, 'semantic')),
  ];
}

async function atomicReplace(path: string, content: string): Promise<void> {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  try { await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' }); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
}

export async function assertRuleImplementationAvailable(root: string, implementation: RuleImplementation): Promise<void> {
  const checksRoot = join(root, '.githooked', 'checks');
  for (const id of ruleCheckIds(implementation)) if (await exists(join(checksRoot, id))) throw new Error(`Check already exists: ${id}`);
}

export async function installRuleImplementation(root: string, implementation: RuleImplementation): Promise<string[]> {
  const rendered = render(implementation);
  const checksRoot = join(root, '.githooked', 'checks');
  await assertRuleImplementationAvailable(root, implementation);
  const hookPath = join(root, '.githooked', 'hooks', `${implementation.hook}.yml`);
  const hook = hookConfigSchema.parse(YAML.parse(await readFile(hookPath, 'utf8')));
  for (const check of rendered) {
    const reference = `check:${check.id}`;
    if (!hook.checks.includes(reference)) hook.checks.push(reference);
  }

  const directories = rendered.map((check) => ({
    check,
    final: join(checksRoot, check.id),
    temporary: join(checksRoot, `${check.id}.tmp-${process.pid}-${Date.now()}`),
  }));
  const installed: typeof directories = [];
  try {
    for (const directory of directories) {
      await mkdir(directory.temporary, { recursive: false });
      await writeFile(join(directory.temporary, 'check.yml'), YAML.stringify(directory.check.manifest, { lineWidth: 0 }), { encoding: 'utf8', flag: 'wx' });
      for (const file of directory.check.files) await writeFile(join(directory.temporary, file.name), file.content, { encoding: 'utf8', flag: 'wx' });
    }
    for (const directory of directories) {
      await rename(directory.temporary, directory.final);
      installed.push(directory);
    }
    await atomicReplace(hookPath, YAML.stringify(hook, { lineWidth: 0 }));
    return rendered.map((check) => check.id);
  } catch (error) {
    await Promise.all(installed.map((directory) => rm(directory.final, { recursive: true, force: true })));
    throw error;
  } finally {
    await Promise.all(directories.map((directory) => rm(directory.temporary, { recursive: true, force: true })));
  }
}
