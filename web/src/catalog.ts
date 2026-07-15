export type BuiltinKind = 'deterministic' | 'semantic';
export type CatalogCategory = 'security' | 'correctness' | 'testing' | 'breaking-change';

export interface BuiltinCheck {
  id: string;
  name: string;
  description: string;
  kind: BuiltinKind;
  category: CatalogCategory;
  severity: 'high' | 'critical' | 'agent-assessed';
  defaultHook?: 'pre-commit' | 'pre-push';
}

export interface GuideCheck {
  id: string;
  name: string;
  category: CatalogCategory;
  severity: 'high' | 'critical';
}

export interface GuidePack {
  id: string;
  name: string;
  description: string;
  family: 'security' | 'quality';
  defaultHook: 'pre-push';
  checks: GuideCheck[];
}

export const builtinChecks: BuiltinCheck[] = [
  {
    id: 'secrets',
    name: 'Secret scanning',
    description: 'Runs Gitleaks against staged changes with secret redaction when Gitleaks is installed.',
    kind: 'deterministic',
    category: 'security',
    severity: 'critical',
    defaultHook: 'pre-commit',
  },
  {
    id: 'env-files',
    name: 'Environment files',
    description: 'Stops staged .env files while allowing documented .env.example templates.',
    kind: 'deterministic',
    category: 'security',
    severity: 'high',
    defaultHook: 'pre-commit',
  },
  {
    id: 'conflict-markers',
    name: 'Conflict markers',
    description: 'Detects newly added merge-conflict markers before they reach repository history.',
    kind: 'deterministic',
    category: 'correctness',
    severity: 'high',
    defaultHook: 'pre-commit',
  },
  {
    id: 'security-review',
    name: 'Security review',
    description: 'Asks Codex to find exploitable security problems introduced by the outgoing diff.',
    kind: 'semantic',
    category: 'security',
    severity: 'agent-assessed',
    defaultHook: 'pre-push',
  },
  {
    id: 'missing-tests',
    name: 'Missing tests',
    description: 'Finds changed behavior that lacks relevant automated test coverage.',
    kind: 'semantic',
    category: 'testing',
    severity: 'agent-assessed',
    defaultHook: 'pre-push',
  },
  {
    id: 'breaking-changes',
    name: 'Breaking changes',
    description: 'Finds backward-incompatible API or contract changes introduced by the diff.',
    kind: 'semantic',
    category: 'breaking-change',
    severity: 'agent-assessed',
  },
];

export const guidePacks: GuidePack[] = [
  {
    id: 'security/web-api',
    name: 'Web API security',
    description: 'Authentication, authorization, input validation, secret handling, and redirect safety for web APIs.',
    family: 'security',
    defaultHook: 'pre-push',
    checks: [
      { id: 'web-api-authentication', name: 'Web API authentication', category: 'security', severity: 'critical' },
      { id: 'web-api-authorization', name: 'Web API authorization', category: 'security', severity: 'critical' },
      { id: 'web-api-input-validation', name: 'Web API input validation', category: 'security', severity: 'high' },
      { id: 'web-api-secret-exposure', name: 'Web API secret exposure', category: 'security', severity: 'critical' },
      { id: 'web-api-redirect-safety', name: 'Web API redirect safety', category: 'security', severity: 'high' },
    ],
  },
  {
    id: 'security/multi-tenant',
    name: 'Multi-tenant security',
    description: 'Tenant-aware authorization, query scoping, cache isolation, and cross-tenant access prevention.',
    family: 'security',
    defaultHook: 'pre-push',
    checks: [
      { id: 'multi-tenant-query-scoping', name: 'Multi-tenant query scoping', category: 'security', severity: 'critical' },
      { id: 'multi-tenant-object-authorization', name: 'Multi-tenant object authorization', category: 'security', severity: 'critical' },
      { id: 'multi-tenant-cache-isolation', name: 'Multi-tenant cache isolation', category: 'security', severity: 'high' },
    ],
  },
  {
    id: 'security/payments',
    name: 'Payments security',
    description: 'Idempotency, amount integrity, authorization, and durable auditability for payment workflows.',
    family: 'security',
    defaultHook: 'pre-push',
    checks: [
      { id: 'payments-idempotency', name: 'Payment idempotency', category: 'correctness', severity: 'critical' },
      { id: 'payments-amount-integrity', name: 'Payment amount integrity', category: 'security', severity: 'critical' },
      { id: 'payments-authorization', name: 'Payment authorization', category: 'security', severity: 'critical' },
      { id: 'payments-audit-trail', name: 'Payment audit trail', category: 'correctness', severity: 'high' },
    ],
  },
  {
    id: 'quality/api',
    name: 'API quality',
    description: 'Public contract compatibility and focused regression-test expectations for API changes.',
    family: 'quality',
    defaultHook: 'pre-push',
    checks: [
      { id: 'api-contract-compatibility', name: 'API contract compatibility', category: 'breaking-change', severity: 'high' },
      { id: 'api-behavior-tests', name: 'API behavior tests', category: 'testing', severity: 'high' },
    ],
  },
  {
    id: 'quality/database',
    name: 'Database quality',
    description: 'Migration safety, transaction boundaries, and correctness of persistent-data queries.',
    family: 'quality',
    defaultHook: 'pre-push',
    checks: [
      { id: 'database-migration-safety', name: 'Database migration safety', category: 'correctness', severity: 'high' },
      { id: 'database-transaction-boundaries', name: 'Database transaction boundaries', category: 'correctness', severity: 'high' },
      { id: 'database-query-correctness', name: 'Database query correctness', category: 'correctness', severity: 'high' },
    ],
  },
];
