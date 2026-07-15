import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand, type CommandRunner } from '../core/process.js';
import type { RuleImplementation } from './plan.js';

export async function validateGeneratedRuleScript(implementation: RuleImplementation, run: CommandRunner = runCommand): Promise<void> {
  if (implementation.kind === 'semantic') return;
  const directory = await mkdtemp(join(tmpdir(), 'git-hooked-rule-script-'));
  const script = join(directory, implementation.command.script.filename);
  try {
    await writeFile(script, implementation.command.script.source, { encoding: 'utf8', mode: 0o600 });
    const result = await run(process.execPath, ['--check', script], { timeout: 10_000 });
    if (result.exitCode !== 0) {
      const detail = (result.stderr || result.stdout).trim().split('\n').slice(-8).join('\n').slice(-2_000);
      throw new Error(`Generated command script is not valid JavaScript: ${detail}`);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
