import { z } from 'zod';
import { severitySchema } from '../config/schema.js';

const relativeResourceSchema = z.string().min(1).max(300).refine(
  (value) => !value.startsWith('/') && !value.startsWith('\\') && !/^[a-z]:[/\\]/i.test(value) && !value.split(/[/\\]/).includes('..'),
  'Guide resources must stay within the pack directory.',
);
const repositoryGlobSchema = z.string().min(1).max(500).refine(
  (value) => !value.startsWith('/') && !value.startsWith('\\') && !/^[a-z]:[/\\]/i.test(value) && !value.split(/[/\\]/).includes('..'),
  'Guide globs must be repository-relative.',
);

export const guideCheckSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).max(80),
  name: z.string().min(3).max(160),
  category: z.enum(['security', 'correctness', 'testing', 'breaking-change', 'repository-rule']),
  severity: severitySchema,
  applies_to: z.array(repositoryGlobSchema).min(1).max(20),
  instructions: relativeResourceSchema,
}).strict();

export const guidePackSchema = z.object({
  schema_version: z.literal(1),
  version: z.number().int().positive(),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(3).max(160),
  description: z.string().min(10).max(1_000),
  compatible_config_versions: z.array(z.number().int().positive()).min(1),
  default_hook: z.enum(['pre-commit', 'pre-push']),
  applicability: z.object({
    frameworks: z.array(z.string()).optional(),
    database_clients: z.array(z.string()).optional(),
    authentication_libraries: z.array(z.string()).optional(),
    files: z.array(repositoryGlobSchema).optional(),
  }).strict().optional(),
  checks: z.array(guideCheckSchema).min(1).max(20),
}).strict().superRefine((value, context) => {
  const ids = value.checks.map((check) => check.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['checks'], message: 'Guide check ids must be unique.' });
});

export const guideReceiptSchema = z.object({
  version: z.literal(1),
  pack: z.string(),
  pack_version: z.number().int().positive(),
  hook: z.enum(['pre-commit', 'pre-push']),
  checks: z.array(z.object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    manifest_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    instructions_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  }).strict()),
}).strict();

export type GuideCheck = z.infer<typeof guideCheckSchema>;
export type GuidePack = z.infer<typeof guidePackSchema>;
export type GuideReceipt = z.infer<typeof guideReceiptSchema>;
