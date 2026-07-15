import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodexAdapter } from '../src/agents/codex.js';
import { configurationTrustHash } from '../src/checks/trust.js';
import { setupSecurityCommand } from '../src/cli/commands/setup-security.js';
import { loadProjectConfig } from '../src/config/load.js';
import { defaultConfig } from '../src/config/schema.js';
import { writeConfig, writeSemanticCheck } from '../src/config/write.js';
import type { CommandRunner } from '../src/core/process.js';
import type { SecurityProposal, SecurityProposalResult } from '../src/setup/proposal.js';

const execute = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const tenantProposal: SecurityProposal = {
  id: 'tenant-isolation',
  name: 'Tenant isolation',
  focus: 'database',
  rule: 'Every tenant-owned database query must be scoped to the authenticated tenant identifier.',
  rationale: 'Authenticated tenant context and tenant-owned account records are both present.',
  evidence: [{ path: 'src/routes/accounts.ts', detail: 'The account route performs a database lookup.' }],
  severity: 'high',
  applies_to: ['src/routes/**/*.ts', 'src/db/**/*.ts'],
  confidence: 0.95,
};

const authProposal: SecurityProposal = {
  id: 'route-authentication',
  name: 'Route authentication',
  focus: 'auth',
  rule: 'Every account route must authenticate the caller before returning account data.',
  rationale: 'Account routes and an authentication library are present in the repository.',
  evidence: [{ path: 'src/routes/accounts.ts', detail: 'This module defines an account data route.' }],
  severity: 'critical',
  applies_to: ['src/routes/**/*.ts'],
  confidence: 0.9,
};

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'git-hooked-setup-')); roots.push(root);
  await execute('git', ['init', '-q'], { cwd: root });
  await writeConfig(root, defaultConfig);
  await mkdir(join(root, 'src', 'routes'), { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { express: '1', '@prisma/client': '1', passport: '1' } }));
  await writeFile(join(root, 'src', 'routes', 'accounts.ts'), 'export const accountRoute = true;\n');
  return root;
}

function recorded(...proposals: SecurityProposal[]): SecurityProposalResult {
  return { summary: 'Recorded repository security proposals.', proposals };
}

describe('setup security', () => {
  it('keeps .githooked unchanged in dry-run mode and sends bounded context', async () => {
    const root = await repository();
    const before = await configurationTrustHash(root);
    const response = await readFile(new URL('fixtures/security-proposals.json', import.meta.url), 'utf8');
    const run: CommandRunner = vi.fn().mockResolvedValue({ stdout: response, stderr: '', exitCode: 0 });
    const agent = new CodexAdapter(run, root);
    let selectedContent = '';
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await setupSecurityCommand({ dryRun: true, focus: 'database', maxProposals: 1 }, root, {
      propose: async (input) => {
        selectedContent = JSON.stringify(input.context);
        expect(input.focus).toEqual(['database']);
        expect(input.maxProposals).toBe(1);
        return agent.proposeSecurity(input);
      },
    });
    expect(selectedContent).toContain('src/routes/accounts.ts');
    expect(await configurationTrustHash(root)).toBe(before);
  });

  it('writes a review report without changing configuration in non-interactive mode', async () => {
    const root = await repository();
    const before = await configurationTrustHash(root);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await setupSecurityCommand({ nonInteractive: true, output: 'proposals.json' }, root, { propose: async () => recorded(tenantProposal) });
    const output = JSON.parse(await readFile(join(root, 'proposals.json'), 'utf8')) as { proposals: SecurityProposal[] };
    expect(output.proposals.map((proposal) => proposal.id)).toEqual(['tenant-isolation']);
    expect(await configurationTrustHash(root)).toBe(before);
  });

  it('deduplicates existing checks before presenting or exporting proposals', async () => {
    const root = await repository();
    await writeSemanticCheck(root, {
      id: 'existing-tenant-rule', name: 'Existing tenant rule', category: 'security', severity: 'high', appliesTo: ['src/**/*.ts'], instructions: tenantProposal.rule,
    });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await setupSecurityCommand({ dryRun: true, output: 'proposals.json' }, root, { propose: async () => recorded(tenantProposal, authProposal) });
    const output = JSON.parse(await readFile(join(root, 'proposals.json'), 'utf8')) as { proposals: SecurityProposal[] };
    expect(output.proposals.map((proposal) => proposal.id)).toEqual(['route-authentication']);
  });

  it('writes only individually approved proposals as valid semantic checks', async () => {
    const root = await repository();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await setupSecurityCommand({}, root, {
      propose: async () => recorded(tenantProposal, authProposal),
      confirm: async (proposal) => proposal.id === 'tenant-isolation',
    });
    const project = await loadProjectConfig(root);
    expect(project.hooks['pre-push'].checks).toContain('check:tenant-isolation');
    expect(project.hooks['pre-push'].checks).not.toContain('check:route-authentication');
    expect(project.checks.get('tenant-isolation')).toMatchObject({ type: 'semantic', severity: 'high', applies_to: tenantProposal.applies_to });
    expect(await readFile(join(root, '.githooked', 'checks', 'tenant-isolation', 'instructions.md'), 'utf8')).toContain(tenantProposal.rule);
  });

  it('rejects agent-suggested commands and never reaches approval or configuration writes', async () => {
    const root = await repository();
    const before = await configurationTrustHash(root);
    const confirm = vi.fn(async () => true);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const malicious = { ...tenantProposal, command: 'node steal-secrets.js' };
    await expect(setupSecurityCommand({}, root, {
      propose: async () => ({ summary: 'malicious', proposals: [malicious] } as unknown as SecurityProposalResult),
      confirm,
    })).rejects.toThrow();
    expect(confirm).not.toHaveBeenCalled();
    expect(await configurationTrustHash(root)).toBe(before);
  });

  it('rejects evidence that was not included in the bounded repository map', async () => {
    const root = await repository();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const invented = { ...tenantProposal, evidence: [{ path: 'src/does-not-exist.ts', detail: 'Invented evidence.' }] };
    await expect(setupSecurityCommand({ dryRun: true }, root, { propose: async () => recorded(invented) })).rejects.toThrow('outside the bounded repository map');
  });

  it('does not allow proposal reports to modify .githooked in review mode', async () => {
    const root = await repository();
    const propose = vi.fn(async () => recorded(tenantProposal));
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await expect(setupSecurityCommand({ nonInteractive: true, output: '.githooked/proposals.json' }, root, {
      propose,
    })).rejects.toThrow('must not write inside .githooked');
    expect(propose).not.toHaveBeenCalled();
  });
});
