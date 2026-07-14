#!/usr/bin/env node
import { Command } from 'commander';
import { checkCommand } from './commands/check.js';
import { initCommand } from './commands/init.js';
import { addRuleCommand } from './commands/rule.js';

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

const program = new Command().name('git-hooked').description('Catch bad code before you push.').version('0.1.0');
program.command('init').description('Configure Git Hooked in this repository').action(async () => initCommand());
program.command('check').description('Run checks for a Git hook').argument('<hook>', 'pre-commit or pre-push').argument('[remote-name]').argument('[remote-url]').action(async (hook: string, remoteName?: string) => {
  if (hook !== 'pre-commit' && hook !== 'pre-push') throw new Error('Hook must be pre-commit or pre-push.');
  process.exitCode = await checkCommand(hook, process.cwd(), remoteName, hook === 'pre-push' ? await readStdin() : '');
});
program.command('rule').description('Manage repository rules').command('add').argument('<rule>').action(async (rule: string) => addRuleCommand(rule));
program.parseAsync().catch((error: unknown) => { console.error(`✗ ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
