import type { CollectedDiff } from '../git/diff.js';
import type { Finding } from '../review/result.js';

export async function runDeterministicChecks(
  diff: CollectedDiff,
  checks: string[],
): Promise<Finding[]> {
  const findings: Finding[] = [];
  if (checks.includes('env-files')) {
    for (const file of diff.files.filter((name) => /(^|\/)\.env($|\.)/.test(name) && !name.endsWith('.example'))) {
      findings.push({ id: `env-file:${file}`, severity: 'high', category: 'security', title: 'Environment file staged', explanation: 'Environment files commonly contain credentials and should not be committed.', file });
    }
  }
  if (checks.includes('conflict-markers') && /^\+(?!\+\+\+)(?:<{7}|={7}|>{7})/m.test(diff.content)) {
    findings.push({ id: 'conflict-marker', severity: 'high', category: 'correctness', title: 'Merge-conflict marker added', explanation: 'Resolve added merge-conflict markers before committing.' });
  }
  return findings;
}
