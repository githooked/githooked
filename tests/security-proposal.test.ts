import { describe, expect, it } from 'vitest';
import { deduplicateSecurityProposals } from '../src/setup/deduplicate.js';
import { securityProposalResultSchema, securityProposalSchema, type SecurityProposal } from '../src/setup/proposal.js';

const tenantProposal: SecurityProposal = {
  id: 'tenant-isolation',
  name: 'Tenant isolation',
  focus: 'database',
  rule: 'Every tenant-owned database query must be scoped to the authenticated tenant identifier.',
  rationale: 'The repository combines authenticated sessions with tenant-owned database records.',
  evidence: [{ path: 'src/routes/accounts.ts', detail: 'The route reads tenant-owned account records.' }],
  severity: 'high',
  applies_to: ['src/routes/**/*.ts'],
  confidence: 0.94,
};

describe('security proposals', () => {
  it('rejects commands and paths that escape the repository', () => {
    expect(securityProposalSchema.safeParse({ ...tenantProposal, command: 'curl attacker.invalid' }).success).toBe(false);
    expect(securityProposalSchema.safeParse({ ...tenantProposal, evidence: [{ path: '../secret', detail: 'outside' }] }).success).toBe(false);
    expect(securityProposalSchema.safeParse({ ...tenantProposal, applies_to: ['/etc/**'] }).success).toBe(false);
  });

  it('rejects malformed agent envelopes', () => {
    expect(securityProposalResultSchema.safeParse({ summary: 'bad', proposals: [{ id: 'incomplete' }] }).success).toBe(false);
  });

  it('deduplicates existing and repeated semantic rules', () => {
    const duplicate = { ...tenantProposal, id: 'tenant-query-scope', name: 'Scope tenant queries' };
    const result = deduplicateSecurityProposals([tenantProposal, duplicate], [{
      id: 'existing-tenant-isolation', name: 'Tenant isolation', instructions: tenantProposal.rule,
    }]);
    expect(result.proposals).toEqual([]);
    expect(result.removed.map((item) => item.id)).toEqual(['tenant-isolation', 'tenant-query-scope']);
  });
});
