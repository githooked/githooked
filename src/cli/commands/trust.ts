import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { configurationTrustHash, writeTrustedHash } from '../../checks/trust.js';
import { loadProjectConfig } from '../../config/load.js';
import { findRepositoryRoot } from '../../git/repository.js';

export async function trustCommand(yes: boolean, cwd = process.cwd()): Promise<number> {
  const root = await findRepositoryRoot(cwd);
  const project = await loadProjectConfig(root);
  const commands = [...project.checks.values()].filter((check) => check.type === 'command');
  if (!commands.length) { console.log('No repository command checks are configured.'); return 0; }
  console.log('Repository command checks can execute local code:');
  for (const check of commands) console.log(`  ${check.id}: ${check.command!.executable} ${check.command!.args.join(' ')}`);
  if (!yes) {
    if (!stdin.isTTY) { console.log('Trust not stored. Re-run with --yes in non-interactive environments.'); return 1; }
    const prompt = createInterface({ input: stdin, output: stdout });
    const answer = await prompt.question('Trust the current .githooked contents? [y/N] '); prompt.close();
    if (!/^y(?:es)?$/i.test(answer.trim())) return 1;
  }
  const hash = await configurationTrustHash(root); await writeTrustedHash(root, hash);
  console.log(`✓ Trusted command-check configuration ${hash.slice(0, 12)}`);
  return 0;
}
