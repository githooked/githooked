import { describe, expect, it } from 'vitest';
import { CodexAdapter } from '../src/agents/codex.js';
import { validateGeneratedRuleScript } from '../src/rules/validate.js';

describe('live Codex rule planning', () => {
  it.skipIf(process.env.GIT_HOOKED_CODEX_INTEGRATION !== '1')('plans a clear deterministic repository rule in isolated read-only mode', async () => {
    const result = await new CodexAdapter(undefined, process.cwd()).planRule({
      request: 'Reject any changed TypeScript file under src/ that contains the exact JavaScript debugger statement. Use pre-commit, high severity, and allow no exceptions.',
      context: {
        fingerprint: {
          languages: [{ name: 'TypeScript', files: 1 }], frameworks: [], packageManagers: ['npm'], databaseClients: [], authenticationLibraries: [], testTools: ['Vitest'], apiEntryPoints: [],
        },
        repositoryMap: { files: ['src/example.ts'], scannedFiles: 1, truncated: false },
        selectedFiles: [{ path: 'src/example.ts', content: 'export const example = true;\n', truncated: false }],
      },
      existingChecks: [], answers: [], timeoutMs: 120_000,
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.implementation.hook).toBe('pre-commit');
    expect(result.implementation.severity).toBe('high');
    expect(result.implementation.kind).toMatch(/command|hybrid/);
    await validateGeneratedRuleScript(result.implementation);
  }, 150_000);

  it.skipIf(process.env.GIT_HOOKED_CODEX_INTEGRATION !== '1')('recognizes a clear rule already enforced by an enabled built-in', async () => {
    const result = await new CodexAdapter(undefined, process.cwd()).planRule({
      request: 'Never allow a staged .env file to be committed.',
      context: {
        fingerprint: { languages: [], frameworks: [], packageManagers: ['npm'], databaseClients: [], authenticationLibraries: [], testTools: [], apiEntryPoints: [] },
        repositoryMap: { files: ['package.json'], scannedFiles: 1, truncated: false },
        selectedFiles: [{ path: 'package.json', content: '{"name":"example"}', truncated: false }],
      },
      existingChecks: [{
        id: 'builtin:env-files', name: 'Env Files', kind: 'deterministic',
        description: 'Blocks staged .env and .env.* files, except files ending in .example.', hooks: ['pre-commit'],
      }],
      answers: [], timeoutMs: 120_000,
    });
    expect(result).toMatchObject({ status: 'already_covered', existing_check_id: 'builtin:env-files' });
  }, 150_000);

  it.skipIf(process.env.GIT_HOOKED_CODEX_INTEGRATION !== '1')('plans contextual API response protection as semantic or hybrid pre-push review', async () => {
    const result = await new CodexAdapter(undefined, process.cwd()).planRule({
      request: 'Public Express API responses must never expose passwordHash or accessToken. Internal database reads are allowed. Enforce this at pre-push with high severity.',
      context: {
        fingerprint: {
          languages: [{ name: 'TypeScript', files: 1 }], frameworks: ['Express'], packageManagers: ['npm'], databaseClients: [], authenticationLibraries: [], testTools: ['Vitest'], apiEntryPoints: ['src/routes/account.ts'],
        },
        repositoryMap: { files: ['package.json', 'src/routes/account.ts'], scannedFiles: 2, truncated: false },
        selectedFiles: [{
          path: 'src/routes/account.ts',
          content: "app.get('/account', async (_request, response) => response.json(await loadAccount()));\n",
          truncated: false,
        }],
      },
      existingChecks: [], answers: [], timeoutMs: 120_000,
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.implementation.hook).toBe('pre-push');
    expect(result.implementation.severity).toBe('high');
    expect(result.implementation.kind).toMatch(/semantic|hybrid/);
    expect(result.implementation.applies_to.some((glob) => glob.includes('routes'))).toBe(true);
    if (result.implementation.kind === 'hybrid') await validateGeneratedRuleScript(result.implementation);
  }, 150_000);
});
