import { relative } from 'node:path';
import { createAgentRegistry } from '../../agents/registry.js';
import { defaultConfig } from '../../config/schema.js';
import { ensureConfig } from '../../config/write.js';
import { loadProjectConfig } from '../../config/load.js';
import { getGitDir, findRepositoryRoot } from '../../git/repository.js';
import { installHooks } from '../../git/hooks.js';
import { detectHookManager, manualIntegration } from '../../git/integration.js';

export async function initCommand(cwd = process.cwd()): Promise<void> {
  const root = await findRepositoryRoot(cwd);
  const codex = createAgentRegistry(root)[0]!;
  const detection = await codex.detect();
  console.log(detection.available ? `✓ Codex detected${detection.version ? ` (${detection.version})` : ''}` : '⚠ Codex CLI not detected');
  const manager = await detectHookManager(root);
  const created = await ensureConfig(root, defaultConfig);
  await loadProjectConfig(root);
  console.log(created.length ? `✓ Created ${created.map((path) => relative(root, path)).join(', ')}` : '✓ Existing .githooked configuration preserved');
  if (manager) {
    console.log(`\n⚠ ${manager.name} manages this repository's Git hooks; native hooks were not changed.`);
    console.log(manualIntegration(manager));
    console.log('\n☕ Hooky is configured. Complete the integration above to enable its hooks.');
    return;
  }
  await installHooks(await getGitDir(root));
  console.log('✓ Pre-commit hook installed\n✓ Pre-push hook installed\n\n☕ Hooky is watching your repo');
}
