import { describe, expect, it } from 'vitest';
import { runDeterministicChecks } from '../src/checks/deterministic.js';

describe('deterministic checks', () => {
  it('checks added diff content rather than the working tree', async () => {
    const findings = await runDeterministicChecks({ content: '+<<<<<<< HEAD\n+bad\n', files: ['a.ts'], partial: false }, ['conflict-markers']);
    expect(findings[0]?.id).toBe('conflict-marker');
  });
  it('does not flag deleted env files excluded from the diff file set', async () => {
    await expect(runDeterministicChecks({ content: '', files: [], partial: false }, ['env-files'])).resolves.toEqual([]);
  });
});
