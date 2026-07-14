import { resolveAgent } from '../../agents/registry.js';
import { loadProjectConfig } from '../../config/load.js';
import { VERSION } from '../../core/version.js';
import { getGitDir, findRepositoryRoot } from '../../git/repository.js';
import { hookStatus } from '../../git/hooks.js';
import { detectHookManager } from '../../git/integration.js';

export async function doctorCommand(testAgent: boolean, cwd = process.cwd()): Promise<number> {
  console.log(`Git Hooked ${VERSION}`);
  let root: string;
  try { root = await findRepositoryRoot(cwd); console.log(`✓ Git repository: ${root}`); }
  catch (error) { console.log(`✗ ${error instanceof Error ? error.message : String(error)}`); return 1; }
  let project;
  try { project = await loadProjectConfig(root); console.log('✓ Configuration valid'); }
  catch (error) { console.log(`✗ ${error instanceof Error ? error.message : String(error)}`); return 1; }
  let healthy = true;
  const agent = resolveAgent(project.config.agent.provider, root);
  const detection = await agent.detect();
  console.log(detection.available ? `✓ ${agent.displayName} detected${detection.version ? `: ${detection.version}` : ''}` : `✗ ${agent.displayName}: ${detection.error ?? 'unavailable'}`); if (!detection.available) healthy = false;
  const hooksDir = await getGitDir(root);
  for (const hook of ['pre-commit', 'pre-push'] as const) {
    const status = await hookStatus(hooksDir, hook);
    console.log(`${status === 'installed' ? '✓' : '✗'} ${hook} hook: ${status}`);
    if (status !== 'installed') healthy = false;
  }
  const manager = await detectHookManager(root); if (manager) console.log(`ℹ Hook manager: ${manager.name}`);
  if (testAgent && detection.available) {
    try {
      await agent.review({ diff: 'diff --git a/healthcheck.txt b/healthcheck.txt\n+healthcheck', files: ['healthcheck.txt'], checks: [{ id: 'healthcheck', name: 'Health check', category: 'correctness', instructions: 'Return pass with no findings.', files: ['healthcheck.txt'] }], partial: false, timeoutMs: Math.min(project.config.agent.timeout_ms, 60_000) });
      console.log('✓ Read-only agent invocation succeeded');
    } catch (error) { console.log(`✗ Read-only agent invocation failed: ${error instanceof Error ? error.message : String(error)}`); healthy = false; }
  } else console.log('ℹ Agent invocation not tested; run `git-hooked doctor --test-agent`');
  return healthy ? 0 : 1;
}
