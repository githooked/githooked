import { resolveAgent } from '../../agents/registry.js';
import { loadProjectConfig } from '../../config/load.js';
import { findRepositoryRoot } from '../../git/repository.js';
import { loadLastReview } from '../../review/cache.js';

export async function fixCommand(cwd = process.cwd()): Promise<number> {
  const root = await findRepositoryRoot(cwd);
  const project = await loadProjectConfig(root);
  const last = await loadLastReview(root);
  if (!last || last.result.findings.length === 0) { console.log('No saved findings to fix. Run a semantic check first.'); return 1; }
  const agent = resolveAgent(project.config.agent.provider, root);
  if (agent.id !== last.provider) { console.log(`Saved findings came from ${last.provider}, but ${agent.id} is configured. Run the check again first.`); return 1; }
  console.log(`Starting explicit modification-enabled fix for ${last.result.findings.length} findings with ${agent.displayName}...`);
  const result = await agent.fix({ findings: last.result, timeoutMs: project.config.agent.timeout_ms });
  console.log(result.summary);
  return result.success ? 0 : 1;
}
