import { describe, expect, it, vi } from 'vitest';
import { PromptCliAdapter, promptCliSpecs } from '../src/agents/prompt-cli.js';
import { resolveAgent } from '../src/agents/registry.js';
import type { CommandRunner } from '../src/core/process.js';

const check = { id: 'security-review', name: 'Security review', category: 'security' as const, instructions: 'Review security.', files: ['a.ts'] };
const pass = { status: 'pass', summary: 'ok', findings: [] };

function output(id: string, value: unknown): string {
  const json = JSON.stringify(value);
  if (id === 'claude' || id === 'cursor') return JSON.stringify({ result: json });
  if (id === 'gemini') return JSON.stringify({ response: json, stats: {} });
  return json;
}

describe.each(promptCliSpecs)('$displayName adapter', (spec) => {
  it('detects the installed CLI', async () => {
    const run: CommandRunner = vi.fn().mockResolvedValue({ stdout: '1.0.0', stderr: '', exitCode: 0 });
    await expect(new PromptCliAdapter(spec, run).detect()).resolves.toMatchObject({ available: true, version: '1.0.0' });
    expect(run).toHaveBeenCalledWith(spec.command, spec.versionArgs, expect.objectContaining({ timeout: 10_000 }));
  });

  it('runs structured reviews outside the repository and validates the result', async () => {
    const run: CommandRunner = vi.fn().mockResolvedValue({ stdout: output(spec.id, pass), stderr: '', exitCode: 0 });
    const result = await new PromptCliAdapter(spec, run, '/repository').review({ diff: 'diff', files: ['a.ts'], checks: [check], partial: false, timeoutMs: 1_000 });
    expect(result.status).toBe('pass');
    expect(run).toHaveBeenCalledWith(spec.command, expect.any(Array), expect.objectContaining({ cwd: expect.stringContaining('git-hooked-agent-'), timeout: 1_000 }));
    const args = vi.mocked(run).mock.calls[0]![1];
    expect(args.join(' ')).toContain('Required JSON schema');
    expect(args.join(' ')).toContain('diff');
  });

  it('never treats malformed model output as success', async () => {
    const malformed = spec.id === 'claude' || spec.id === 'cursor' ? JSON.stringify({ result: 'nope' }) : spec.id === 'gemini' ? JSON.stringify({ response: 'nope' }) : 'nope';
    const run: CommandRunner = vi.fn().mockResolvedValue({ stdout: malformed, stderr: '', exitCode: 0 });
    await expect(new PromptCliAdapter(spec, run).review({ diff: 'x', files: [], checks: [], partial: false, timeoutMs: 1_000 })).rejects.toThrow('malformed JSON');
  });

  it('uses an explicit modification-enabled command only for fix mode', async () => {
    const run: CommandRunner = vi.fn().mockResolvedValue({ stdout: 'fixed', stderr: '', exitCode: 0 });
    await expect(new PromptCliAdapter(spec, run, '/repository').fix({ findings: { status: 'fail', summary: '', findings: [] }, timeoutMs: 1_000 })).resolves.toMatchObject({ success: true });
    expect(run).toHaveBeenCalledWith(spec.command, spec.args('fix', expect.any(String) as unknown as string), expect.objectContaining({ cwd: '/repository', env: expect.objectContaining({ GIT_HOOKED_FIX: '1' }) }));
  });
});

it('auto-selects the first available supported CLI', async () => {
  const run: CommandRunner = vi.fn(async (command, args) => {
    if (args.includes('--version')) return { stdout: command === 'claude' ? 'Claude 1.0' : '', stderr: '', exitCode: command === 'claude' ? 0 : 1 };
    return { stdout: JSON.stringify({ result: JSON.stringify(pass) }), stderr: '', exitCode: 0 };
  });
  const agent = resolveAgent('auto', '/repository', run);
  await expect(agent.review({ diff: 'diff', files: ['a.ts'], checks: [check], partial: false, timeoutMs: 1_000 })).resolves.toMatchObject({ status: 'pass' });
  expect(run).toHaveBeenCalledWith('claude', expect.any(Array), expect.any(Object));
});
