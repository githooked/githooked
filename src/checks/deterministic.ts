import type { CommandRunner } from '../core/process.js';
import { runCommand } from '../core/process.js';
import type { CollectedDiff } from '../git/diff.js';
import type { Finding } from '../review/result.js';

export interface DeterministicResult { findings: Finding[]; notices: string[] }

export async function runDeterministicChecks(root: string, diff: CollectedDiff, checks: string[], run: CommandRunner = runCommand): Promise<DeterministicResult> {
  const findings: Finding[] = []; const notices: string[] = [];
  if (checks.includes('env-files')) {
    for (const file of diff.files.filter((name) => /(^|\/)\.env($|\.)/.test(name) && !name.endsWith('.example'))) {
      findings.push({ id: `env-file:${file}`, severity: 'high', category: 'security', title: 'Environment file staged', explanation: 'Environment files commonly contain credentials and should not be committed.', file });
    }
  }
  if (checks.includes('conflict-markers') && /^\+(?!\+\+\+)(?:<{7}|={7}|>{7})/m.test(diff.content)) {
    findings.push({ id: 'conflict-marker', severity: 'high', category: 'correctness', title: 'Merge-conflict marker added', explanation: 'Resolve added merge-conflict markers before committing.' });
  }
  if (checks.includes('secrets')) {
    try {
      const result = await run('gitleaks', ['git', '--pre-commit', '--redact', '--staged', '--no-banner'], { cwd: root, timeout: 60_000 });
      if (result.exitCode === 1) findings.push({ id: 'gitleaks', severity: 'critical', category: 'security', title: 'Gitleaks detected a potential secret', explanation: (result.stderr || result.stdout).trim().slice(-2_000) });
      else if (result.exitCode !== 0) notices.push(`Gitleaks could not complete (exit ${result.exitCode}).`);
    } catch { notices.push('Gitleaks is not installed; built-in filename checks still ran.'); }
  }
  return { findings, notices };
}
