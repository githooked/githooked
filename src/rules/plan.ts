import { z } from 'zod';
import { severitySchema } from '../config/schema.js';
import type { RepositoryProposalContext } from '../setup/proposal.js';

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

const repositoryRelativeSchema = z.string().min(1).max(500).refine(
  (value) => !value.startsWith('/') && !value.startsWith('\\') && !/^[a-z]:[/\\]/i.test(value) && !value.split(/[/\\]/).includes('..') && !containsControlCharacter(value),
  'Paths and globs must stay within the repository.',
);

const evidenceSchema = z.object({
  path: repositoryRelativeSchema,
  detail: z.string().min(3).max(500),
}).strict();

export const ruleClarificationQuestionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/).max(80),
  question: z.string().min(5).max(500),
  reason: z.string().min(5).max(500),
}).strict();

const commonImplementationShape = {
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).max(80),
  name: z.string().min(3).max(160),
  rule: z.string().min(3).max(4_000),
  rationale: z.string().min(10).max(2_000),
  evidence: z.array(evidenceSchema).max(10),
  severity: severitySchema,
  hook: z.enum(['pre-commit', 'pre-push']),
  applies_to: z.array(repositoryRelativeSchema).min(1).max(20),
  confidence: z.number().min(0).max(1),
};

const semanticDetailsSchema = z.object({
  instructions: z.string().min(10).max(16_000),
}).strict();

const commandDetailsSchema = z.object({
  script: z.object({
    filename: z.literal('check.mjs'),
    source: z.string().min(20).max(64 * 1024).refine((value) => !value.includes('\0'), 'Generated scripts cannot contain NUL bytes.'),
  }).strict(),
  timeout_ms: z.number().int().positive().max(600_000),
}).strict();

export const ruleImplementationSchema = z.discriminatedUnion('kind', [
  z.object({ ...commonImplementationShape, kind: z.literal('semantic'), semantic: semanticDetailsSchema }).strict(),
  z.object({ ...commonImplementationShape, kind: z.literal('command'), command: commandDetailsSchema }).strict(),
  z.object({
    ...commonImplementationShape,
    kind: z.literal('hybrid'),
    semantic: semanticDetailsSchema,
    command: commandDetailsSchema,
  }).strict(),
]);

const clarificationResultSchema = z.object({
  status: z.literal('needs_clarification'),
  summary: z.string().min(1).max(2_000),
  questions: z.array(ruleClarificationQuestionSchema).min(1).max(3),
}).strict().superRefine((value, context) => {
  const ids = value.questions.map((question) => question.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['questions'], message: 'Clarification question ids must be unique.' });
});

const coveredResultSchema = z.object({
  status: z.literal('already_covered'),
  summary: z.string().min(1).max(2_000),
  existing_check_id: z.string().min(1).max(100),
  reason: z.string().min(5).max(2_000),
}).strict();

const readyResultSchema = z.object({
  status: z.literal('ready'),
  summary: z.string().min(1).max(2_000),
  implementation: ruleImplementationSchema,
}).strict();

export const rulePlanDecisionSchema = z.union([
  clarificationResultSchema,
  coveredResultSchema,
  readyResultSchema,
]);

export const rulePlanResultSchema = z.object({
  result: rulePlanDecisionSchema,
}).strict();

export interface ExistingRuleSummary {
  id: string;
  name: string;
  kind: 'deterministic' | 'semantic' | 'command';
  description: string;
  hooks: Array<'pre-commit' | 'pre-push'>;
}

export interface RuleClarificationAnswer { id: string; answer: string }

export interface RulePlanInput {
  request: string;
  context: RepositoryProposalContext;
  existingChecks: ExistingRuleSummary[];
  answers: RuleClarificationAnswer[];
  timeoutMs: number;
}

export type RuleClarificationQuestion = z.infer<typeof ruleClarificationQuestionSchema>;
export type RuleImplementation = z.infer<typeof ruleImplementationSchema>;
export type RulePlanResult = z.infer<typeof rulePlanDecisionSchema>;
export type ReadyRulePlan = Extract<RulePlanResult, { status: 'ready' }>;
