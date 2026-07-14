export const builtinChecks = {
  'env-files': { kind: 'deterministic' },
  secrets: { kind: 'deterministic' },
  'conflict-markers': { kind: 'deterministic' },
  'security-review': { kind: 'semantic' },
  'missing-tests': { kind: 'semantic' },
  'breaking-changes': { kind: 'semantic' },
} as const;

export type BuiltinCheckId = keyof typeof builtinChecks;
export function isBuiltinCheckId(value: string): value is BuiltinCheckId { return value in builtinChecks; }
export function builtinKind(id: BuiltinCheckId): 'deterministic' | 'semantic' { return builtinChecks[id].kind; }
