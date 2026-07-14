import { z } from 'zod';
import { severitySchema } from '../config/schema.js';

export const findingSchema = z.object({
  id: z.string().min(1), severity: severitySchema,
  category: z.enum(['security', 'correctness', 'testing', 'breaking-change', 'repository-rule']),
  title: z.string().min(1), explanation: z.string().min(1), file: z.string().optional(),
  line: z.number().int().positive().optional(), rule: z.string().optional(), suggestedFix: z.string().optional(),
}).strict();
export const reviewResultSchema = z.object({
  status: z.enum(['pass', 'warn', 'fail']), summary: z.string(), findings: z.array(findingSchema),
}).strict();
export type Finding = z.infer<typeof findingSchema>;
export type ReviewResult = z.infer<typeof reviewResultSchema>;

export function isBlocking(result: ReviewResult, severities: readonly string[]): boolean {
  return result.findings.some((finding) => severities.includes(finding.severity));
}
