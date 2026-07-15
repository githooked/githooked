#!/usr/bin/env node
import { Command } from 'commander';
import { checkCommand } from './commands/check.js';
import { initCommand } from './commands/init.js';
import { addRuleCommand, type AddRuleOptions } from './commands/rule-add.js';
import { doctorCommand } from './commands/doctor.js';
import { uninstallCommand } from './commands/uninstall.js';
import { VERSION } from '../core/version.js';
import { fixCommand } from './commands/fix.js';
import { trustCommand } from './commands/trust.js';
import { setupSecurityCommand, type SetupSecurityOptions } from './commands/setup-security.js';
import { guideAddCommand, guideInspectCommand, guideListCommand, guideRemoveCommand } from './commands/guide.js';

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

const program = new Command().name('git-hooked').description('Catch bad code before you push.').version(VERSION);
program.command('init').description('Configure Git Hooked in this repository').action(async () => initCommand());
program.command('check').description('Run checks for a Git hook').argument('<hook>', 'pre-commit or pre-push').argument('[remote-name]').argument('[remote-url]').action(async (hook: string, remoteName?: string) => {
  if (hook !== 'pre-commit' && hook !== 'pre-push') throw new Error('Hook must be pre-commit or pre-push.');
  process.exitCode = await checkCommand(hook, process.cwd(), remoteName, hook === 'pre-push' ? await readStdin() : '');
});
program.command('rule').description('Manage repository rules').command('add')
  .argument('<rule>')
  .option('--dry-run', 'plan and preview without changing .githooked configuration')
  .option('--yes', 'create the planned rule without interactive approval')
  .action(async (rule: string, options: AddRuleOptions) => { process.exitCode = await addRuleCommand(rule, options); });
program.command('doctor').description('Diagnose this repository and agent').option('--test-agent', 'run a basic read-only agent invocation').action(async (options: { testAgent?: boolean }) => { process.exitCode = await doctorCommand(Boolean(options.testAgent)); });
program.command('uninstall').description('Remove managed hook entries').option('--remove-config', 'also remove .githooked configuration').action(async (options: { removeConfig?: boolean }) => uninstallCommand(Boolean(options.removeConfig)));
program.command('fix').description('Explicitly fix findings from the most recent review').action(async () => { process.exitCode = await fixCommand(); });
program.command('trust').description('Trust the current repository command checks').option('--yes', 'trust without an interactive confirmation').action(async (options: { yes?: boolean }) => { process.exitCode = await trustCommand(Boolean(options.yes)); });
program.command('setup').description('Propose repository-specific setup').command('security')
  .description('Inspect this repository and propose semantic security checks')
  .option('--dry-run', 'show proposals without changing .githooked configuration')
  .option('--non-interactive', 'review proposals without prompting or changing .githooked configuration')
  .option('--output <path>', 'write the structured proposal report as JSON')
  .option('--focus <areas>', 'comma-separated focus areas such as auth,database')
  .option('--max-proposals <count>', 'maximum proposals from 1 to 20', '5')
  .action(async (options: SetupSecurityOptions) => { process.exitCode = await setupSecurityCommand(options); });
const guide = program.command('guide').description('Manage curated local guide packs');
guide.command('list').description('List available guide packs').action(async () => { process.exitCode = await guideListCommand(); });
guide.command('inspect').description('Inspect a guide pack').argument('<id>').action(async (id: string) => { process.exitCode = await guideInspectCommand(id); });
guide.command('add').description('Install a guide pack').argument('<id>').option('--yes', 'install without an interactive confirmation').action(async (id: string, options: { yes?: boolean }) => { process.exitCode = await guideAddCommand(id, Boolean(options.yes)); });
guide.command('remove').description('Remove an unmodified installed guide pack').argument('<id>').option('--yes', 'remove without an interactive confirmation').action(async (id: string, options: { yes?: boolean }) => { process.exitCode = await guideRemoveCommand(id, Boolean(options.yes)); });
program.parseAsync().catch((error: unknown) => { console.error(`✗ ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
