import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { findRepositoryRoot } from '../../git/repository.js';
import {
  installGuidePack, installGuidePreview, installedGuideRemovalPreview, isGuideInstalled, removeGuidePack,
  type GuideChangePreview,
} from '../../guides/install.js';
import { listGuidePacks, loadGuidePack, type LoadedGuidePack } from '../../guides/registry.js';

async function confirm(question: string, yes: boolean): Promise<boolean> {
  if (yes) return true;
  if (!stdin.isTTY) throw new Error('Guide changes require interactive confirmation. Re-run with --yes in automation.');
  const prompt = createInterface({ input: stdin, output: stdout });
  try { return /^y(?:es)?$/i.test((await prompt.question(`${question} [y/N] `)).trim()); }
  finally { prompt.close(); }
}

function printPack(pack: LoadedGuidePack): void {
  console.log(`${pack.id} v${pack.version} — ${pack.name}`);
  console.log(pack.description);
  console.log(`Default hook: ${pack.default_hook} · Compatible configuration: ${pack.compatible_config_versions.join(', ')}`);
}

function printPreview(title: string, preview: GuideChangePreview): void {
  console.log(`\n${title}`);
  for (const path of preview.create) console.log(`  CREATE ${path}`);
  for (const path of preview.update) console.log(`  UPDATE ${path}`);
  for (const path of preview.remove) console.log(`  REMOVE ${path}`);
}

export async function guideListCommand(): Promise<number> {
  for (const pack of await listGuidePacks()) console.log(`${pack.id.padEnd(24)} v${pack.version}  ${pack.name} — ${pack.description}`);
  return 0;
}

export async function guideInspectCommand(id: string): Promise<number> {
  const pack = await loadGuidePack(id);
  printPack(pack);
  if (pack.applicability) console.log(`Applicability hints: ${JSON.stringify(pack.applicability)}`);
  for (const check of pack.checks) {
    console.log(`\n${check.id} — ${check.name}`);
    console.log(`Category: ${check.category} · Severity: ${check.severity}`);
    console.log(`Applies to: ${check.applies_to.join(', ')}`);
    console.log(check.instructionsText.trim());
  }
  return 0;
}

export async function guideAddCommand(id: string, yes: boolean, cwd = process.cwd()): Promise<number> {
  const root = await findRepositoryRoot(cwd);
  const pack = await loadGuidePack(id);
  if (await isGuideInstalled(root, pack.id)) {
    const status = await installGuidePack(root, pack);
    console.log(status === 'already-installed' ? `✓ Guide ${pack.id} is already installed.` : `✓ Installed guide ${pack.id}.`);
    return 0;
  }
  printPack(pack);
  printPreview('Proposed guide changes:', installGuidePreview(pack));
  if (!await confirm(`Install ${pack.id}?`, yes)) { console.log('Guide installation cancelled.'); return 1; }
  await installGuidePack(root, pack);
  console.log(`✓ Installed guide ${pack.id}.`);
  return 0;
}

export async function guideRemoveCommand(id: string, yes: boolean, cwd = process.cwd()): Promise<number> {
  const root = await findRepositoryRoot(cwd);
  const pack = await loadGuidePack(id);
  if (!await isGuideInstalled(root, pack.id)) { console.log(`✓ Guide ${pack.id} is not installed.`); return 0; }
  printPack(pack);
  printPreview('Proposed guide removal:', await installedGuideRemovalPreview(root, pack.id));
  if (!await confirm(`Remove ${pack.id}?`, yes)) { console.log('Guide removal cancelled.'); return 1; }
  await removeGuidePack(root, pack);
  console.log(`✓ Removed guide ${pack.id}.`);
  return 0;
}
