import chalk from 'chalk';
import type { ReviewResult } from './result.js';

export type SemanticReviewState = 'complete' | 'not-configured' | 'no-changes' | 'error';

export function report(result: ReviewResult, fileCount: number, blocking: boolean, semanticState: SemanticReviewState, note?: string): void {
  console.log(`\n☕ Hooky checked ${fileCount} changed ${fileCount === 1 ? 'file' : 'files'}.\n`);
  if (note) console.log(`${chalk.yellow('ℹ')} ${note}\n`);
  for (const finding of result.findings) {
    console.log(`${chalk.bold(finding.severity.toUpperCase())}  ${finding.title}`);
    if (finding.file) console.log(`${finding.file}${finding.line ? `:${finding.line}` : ''}`);
    console.log(`\n${finding.explanation}\n`);
    if (finding.rule) console.log(`Check: ${finding.rule}\n`);
  }
  if (semanticState === 'error') console.log(chalk.yellow('⚠ Semantic review did not complete'));
  else if (semanticState === 'complete') console.log(chalk.green('✓ Semantic review completed'));
  console.log(blocking ? chalk.red('Operation blocked.') : semanticState === 'error' ? chalk.green('✓ Deterministic checks found no blocking issues') : chalk.green('✓ No blocking issues found'));
}
