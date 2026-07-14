import { describe, expect, it, vi } from 'vitest';
import { report } from '../src/review/reporter.js';

describe('reporter', () => {
  it('does not describe an agent error as a successful semantic review', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    report({ status: 'pass', summary: '', findings: [] }, 1, false, 'error');
    const output = log.mock.calls.flat().join('\n');
    expect(output).toContain('Semantic review did not complete');
    expect(output).not.toContain('Semantic review completed');
    log.mockRestore();
  });
});
