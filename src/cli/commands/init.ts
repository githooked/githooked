import { access } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createAgentRegistry } from '../../agents/registry.js';
import { defaultConfig } from '../../config/schema.js';
import { ensureConfig } from '../../config/write.js';
import { loadProjectConfig } from '../../config/load.js';
import { getGitDir, findRepositoryRoot } from '../../git/repository.js';
import { installHooks } from '../../git/hooks.js';

export async function initCommand(cwd = process.cwd()): Promise<void> {
  const root = await findRepositoryRoot(cwd);
  const codex = createAgentRegistry(root)[0]!;
  const detection = await codex.detect();
  console.log(detection.available ? `✓ Codex detected${detection.version ? ` (${detection.version})` : ''}` : '⚠ Codex CLI not detected');
  for (const marker of ['.husky', 'lefthook.yml', 'lefthook.yaml', '.pre-commit-config.yaml']) {
    try { await access(join(root, marker)); throw new Error(`Detected ${marker}. Automatic native-hook integration is unsafe; add \`git-hooked check pre-commit\` and \`git-hooked check pre-push "$@"\` to that framework manually.`); }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
  }
  const created = await ensureConfig(root, defaultConfig);
  await loadProjectConfig(root);
  await installHooks(await getGitDir(root));
  console.log(created.length ? `✓ Created ${created.map((path) => relative(root, path)).join(', ')}` : '✓ Existing .githooked configuration preserved');
  console.log('✓ Pre-commit hook installed\n✓ Pre-push hook installed\n\n☕ Hooky is watching your repo');
}
