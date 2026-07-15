import { describe, expect, it, vi } from 'vitest';
import { validateGeneratedRuleScript } from '../src/rules/validate.js';
import type { CommandRunner } from '../src/core/process.js';
import type { RuleImplementation } from '../src/rules/plan.js';

const command: RuleImplementation = {
  id: 'generated-check', name: 'Generated check', kind: 'command',
  rule: 'Generated rules must contain valid JavaScript.',
  rationale: 'Syntax validation prevents installing a command that can never run.',
  evidence: [], severity: 'high', hook: 'pre-commit', applies_to: ['**/*'], confidence: 1,
  command: { script: { filename: 'check.mjs', source: 'process.exit(0); // valid generated script' }, timeout_ms: 1_000 },
};

describe('generated rule validation', () => {
  it('syntax-checks generated scripts without executing them', async () => {
    const run: CommandRunner = vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    await validateGeneratedRuleScript(command, run);
    expect(run).toHaveBeenCalledWith(process.execPath, expect.arrayContaining(['--check']), expect.objectContaining({ timeout: 10_000 }));
  });

  it('rejects invalid generated JavaScript', async () => {
    const run: CommandRunner = vi.fn().mockResolvedValue({ stdout: '', stderr: 'SyntaxError: Unexpected token', exitCode: 1 });
    await expect(validateGeneratedRuleScript(command, run)).rejects.toThrow('not valid JavaScript');
  });
});
