import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigError, loadProjectConfig } from '../../config/load.js';
import { writeSemanticCheck } from '../../config/write.js';
import { findRepositoryRoot } from '../../git/repository.js';

function slugify(rule: string): string {
  return rule.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60).replace(/-$/g, '') || 'repository-rule';
}
async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }

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
  await writeSemanticCheck(root, {
    id,
    name: normalized,
    category: 'repository-rule',
    severity: 'high',
    appliesTo: ['**/*'],
    instructions: normalized,
  });
  console.log(`✓ Added rule ${id}\n  ${normalized}`);
}
