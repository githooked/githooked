import { describe, expect, it, vi } from 'vitest';
import { runDeterministicChecks } from '../src/checks/deterministic.js';
import type { CommandRunner } from '../src/core/process.js';

describe('deterministic checks', () => {
  it('checks added diff content rather than the working tree', async () => {
    const result = await runDeterministicChecks('/repo', { content: '+<<<<<<< HEAD\n+bad\n', files: ['a.ts'], partial: false }, ['conflict-markers']);
    expect(result.findings[0]?.id).toBe('conflict-marker');
  });
  it('does not flag deleted env files excluded from the diff file set', async () => {
    await expect(runDeterministicChecks('/repo', { content: '', files: [], partial: false }, ['env-files'])).resolves.toEqual({ findings: [], notices: [] });
  });
  it('turns redacted Gitleaks output into a critical finding', async () => {
    const run: CommandRunner = vi.fn().mockResolvedValue({ stdout: 'Finding: REDACTED', stderr: '', exitCode: 1 });
    const result = await runDeterministicChecks('/repo', { content: 'diff', files: ['a.ts'], partial: false }, ['secrets'], run);
    expect(result.findings[0]).toMatchObject({ id: 'gitleaks', severity: 'critical' });
  });
  it('visibly reports when Gitleaks is unavailable', async () => {
    const run: CommandRunner = vi.fn().mockRejectedValue(new Error('ENOENT'));
    const result = await runDeterministicChecks('/repo', { content: '', files: [], partial: false }, ['secrets'], run);
    expect(result.notices[0]).toContain('not installed');
  });
  it('treats a missing executable from the real process runner as unavailable', async () => {
    const result = await runDeterministicChecks('/repo', { content: '', files: [], partial: false }, ['secrets']);
    expect(result.findings).toEqual([]);
    expect(result.notices[0]).toContain('not installed');
  });
});
