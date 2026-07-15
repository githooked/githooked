import { createHash } from 'node:crypto';
import { access, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import YAML from 'yaml';
import { loadProjectConfig, type ProjectConfig } from '../config/load.js';
import {
  removeSemanticChecks, renderSemanticCheck, writeSemanticChecks,
  type SemanticCheckDefinition,
} from '../config/write.js';
import type { LoadedGuidePack } from './registry.js';
import { GuideError } from './registry.js';
import { guideReceiptSchema, type GuideReceipt } from './schema.js';

function sha256(content: string): string { return createHash('sha256').update(content).digest('hex'); }
function receiptName(id: string): string { return `${id.replace('/', '--')}.yml`; }
function receiptPath(root: string, id: string): string { return join(root, '.githooked', 'guides', receiptName(id)); }
async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }

export async function isGuideInstalled(root: string, id: string): Promise<boolean> { return exists(receiptPath(root, id)); }

function definitions(pack: LoadedGuidePack): SemanticCheckDefinition[] {
  return pack.checks.map((check) => ({
    id: check.id,
    name: check.name,
    category: check.category,
    severity: check.severity,
    appliesTo: check.applies_to,
    instructions: check.instructionsText,
  }));
}

function createReceipt(pack: LoadedGuidePack): GuideReceipt {
  return guideReceiptSchema.parse({
    version: 1,
    pack: pack.id,
    pack_version: pack.version,
    hook: pack.default_hook,
    checks: definitions(pack).map((definition) => {
      const rendered = renderSemanticCheck(definition);
      return { id: definition.id, manifest_sha256: sha256(rendered.manifest), instructions_sha256: sha256(rendered.instructions) };
    }),
  });
}

async function readReceipt(path: string): Promise<GuideReceipt> {
  const stats = await lstat(path);
  if (stats.isSymbolicLink() || !stats.isFile()) throw new GuideError(`Guide receipt is not a regular file: ${path}`);
  if (stats.size > 64 * 1024) throw new GuideError(`Guide receipt is too large: ${path}`);
  return guideReceiptSchema.parse(YAML.parse(await readFile(path, 'utf8')));
}

async function receiptChanges(root: string, receipt: GuideReceipt, project: ProjectConfig): Promise<string[]> {
  const changes: string[] = [];
  const references = new Set(project.hooks[receipt.hook].checks);
  for (const check of receipt.checks) {
    if (!references.has(`check:${check.id}`)) changes.push(`hook reference check:${check.id} is missing`);
    const directory = join(root, '.githooked', 'checks', check.id);
    try {
      const [manifest, instructions] = await Promise.all([
        readFile(join(directory, 'check.yml'), 'utf8'),
        readFile(join(directory, 'instructions.md'), 'utf8'),
      ]);
      const entries = (await readdir(directory)).sort();
      if (entries.join('\0') !== ['check.yml', 'instructions.md'].join('\0')) changes.push(`${check.id} contains unowned files`);
      if (sha256(manifest) !== check.manifest_sha256) changes.push(`${check.id}/check.yml was modified`);
      if (sha256(instructions) !== check.instructions_sha256) changes.push(`${check.id}/instructions.md was modified`);
    } catch { changes.push(`${check.id} files are missing`); }
  }
  return changes;
}

export interface GuideChangePreview { create: string[]; update: string[]; remove: string[] }

export function installGuidePreview(pack: LoadedGuidePack): GuideChangePreview {
  return {
    create: [
      ...pack.checks.flatMap((check) => [`.githooked/checks/${check.id}/check.yml`, `.githooked/checks/${check.id}/instructions.md`]),
      `.githooked/guides/${receiptName(pack.id)}`,
    ],
    update: [`.githooked/hooks/${pack.default_hook}.yml (${pack.checks.map((check) => `check:${check.id}`).join(', ')})`],
    remove: [],
  };
}

export async function installedGuideRemovalPreview(root: string, id: string): Promise<GuideChangePreview> {
  const receipt = await readReceipt(receiptPath(root, id));
  return {
    create: [],
    update: [`.githooked/hooks/${receipt.hook}.yml (${receipt.checks.map((check) => `check:${check.id}`).join(', ')})`],
    remove: [
      ...receipt.checks.flatMap((check) => [`.githooked/checks/${check.id}/check.yml`, `.githooked/checks/${check.id}/instructions.md`]),
      `.githooked/guides/${receiptName(receipt.pack)}`,
    ],
  };
}

export async function installGuidePack(root: string, pack: LoadedGuidePack): Promise<'installed' | 'already-installed'> {
  const project = await loadProjectConfig(root);
  if (!pack.compatible_config_versions.includes(project.config.version)) throw new GuideError(`Guide ${pack.id} is not compatible with configuration version ${project.config.version}.`);
  const path = receiptPath(root, pack.id);
  if (await exists(path)) {
    const receipt = await readReceipt(path);
    if (receipt.pack !== pack.id || receipt.pack_version !== pack.version) throw new GuideError(`Guide receipt ${path} does not match ${pack.id} version ${pack.version}.`);
    if (JSON.stringify(receipt) !== JSON.stringify(createReceipt(pack))) throw new GuideError(`Guide ${pack.id} version ${pack.version} differs from its installed receipt; preserve the installation and publish template changes with a new pack version.`);
    const changes = await receiptChanges(root, receipt, project);
    if (changes.length) throw new GuideError(`Guide ${pack.id} has local changes and was preserved:\n${changes.map((change) => `- ${change}`).join('\n')}`);
    return 'already-installed';
  }

  const receipt = createReceipt(pack);
  await mkdir(join(root, '.githooked', 'guides'), { recursive: true });
  const temporaryReceipt = `${path}.tmp-${process.pid}-${Date.now()}`;
  let checksInstalled = false;
  try {
    await writeFile(temporaryReceipt, YAML.stringify(receipt, { lineWidth: 0 }), { encoding: 'utf8', flag: 'wx' });
    await writeSemanticChecks(root, definitions(pack), pack.default_hook);
    checksInstalled = true;
    await rename(temporaryReceipt, path);
  } catch (error) {
    if (checksInstalled) await removeSemanticChecks(root, receipt.checks.map((check) => check.id), receipt.hook);
    throw error;
  } finally {
    await rm(temporaryReceipt, { force: true });
  }
  await loadProjectConfig(root);
  return 'installed';
}

export async function removeGuidePack(root: string, pack: LoadedGuidePack): Promise<'removed' | 'not-installed'> {
  const path = receiptPath(root, pack.id);
  if (!await exists(path)) return 'not-installed';
  const project = await loadProjectConfig(root);
  const receipt = await readReceipt(path);
  if (receipt.pack !== pack.id) throw new GuideError(`Guide receipt ${path} belongs to ${receipt.pack}, not ${pack.id}.`);
  const changes = await receiptChanges(root, receipt, project);
  if (changes.length) throw new GuideError(`Guide ${pack.id} has local changes and was preserved:\n${changes.map((change) => `- ${change}`).join('\n')}`);

  const backupReceipt = `${path}.remove-${process.pid}-${Date.now()}`;
  await rename(path, backupReceipt);
  try {
    await removeSemanticChecks(root, receipt.checks.map((check) => check.id), receipt.hook);
  } catch (error) {
    await rename(backupReceipt, path);
    throw error;
  }
  await rm(backupReceipt, { force: true }).catch(() => undefined);
  await loadProjectConfig(root);
  return 'removed';
}
