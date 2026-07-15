import { z } from 'zod';

export const severitySchema = z.enum(['info', 'low', 'medium', 'high', 'critical']);
export const providerSchema = z.enum(['auto', 'codex', 'claude', 'gemini', 'copilot', 'cursor']);
export const checkReferenceSchema = z.string().regex(/^(builtin|check):[a-z0-9][a-z0-9-]*$/, 'Use `builtin:<id>` or `check:<id>`.');
export const hookConfigSchema = z.object({ checks: z.array(checkReferenceSchema) }).strict();

const commandSchema = z.object({
  executable: z.string().min(1), args: z.array(z.string()).default([]), timeout_ms: z.number().int().positive().max(600_000).default(60_000),
}).strict();

export const repositoryCheckSchema = z.object({
  version: z.literal(1),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  type: z.enum(['semantic', 'command']),
  category: z.enum(['security', 'correctness', 'testing', 'breaking-change', 'repository-rule']).default('repository-rule'),
  severity: severitySchema.default('high'),
  applies_to: z.array(z.string().min(1)).default(['**/*']),
  instructions: z.string().min(1).optional(),
  command: commandSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.type === 'semantic' && !value.instructions) context.addIssue({ code: z.ZodIssueCode.custom, path: ['instructions'], message: 'Semantic checks require an instructions file.' });
  if (value.type === 'command' && !value.command) context.addIssue({ code: z.ZodIssueCode.custom, path: ['command'], message: 'Command checks require a command definition.' });
});

const sharedConfigShape = {
  version: z.literal(1),
  agent: z.object({ provider: providerSchema.default('auto'), timeout_ms: z.number().int().positive().max(600_000).default(120_000) }).default({ provider: 'auto', timeout_ms: 120_000 }),
  blocking: z.object({ severities: z.array(severitySchema).default(['critical', 'high']) }).default({ severities: ['critical', 'high'] }),
  behaviour: z.object({ agent_error: z.enum(['warn', 'block']).default('warn'), cache: z.boolean().default(true) }).default({ agent_error: 'warn', cache: true }),
};

export const configSchema = z.object(sharedConfigShape).strict();
export type GitHookedConfig = z.infer<typeof configSchema>;
export type HookConfig = z.infer<typeof hookConfigSchema>;
export type RepositoryCheck = z.infer<typeof repositoryCheckSchema>;

export const defaultConfig: GitHookedConfig = configSchema.parse({
  version: 1,
});

export const defaultHooks: Record<'pre-commit' | 'pre-push', HookConfig> = {
  'pre-commit': { checks: ['builtin:secrets', 'builtin:env-files', 'builtin:conflict-markers'] },
  'pre-push': { checks: ['builtin:security-review', 'builtin:missing-tests'] },
};
