import { describe, expect, it } from 'vitest';
import { isBlocking, reviewResultSchema } from '../src/review/result.js';

const finding = { id: 'one', severity: 'high' as const, category: 'security' as const, title: 'Issue', explanation: 'Why' };
describe('review results', () => {
  it('blocks configured severities', () => expect(isBlocking({ status: 'fail', summary: '', findings: [finding] }, ['critical', 'high'])).toBe(true));
  it('rejects malformed responses', () => expect(reviewResultSchema.safeParse({ status: 'pass', summary: '', findings: [{ nope: true }] }).success).toBe(false));
});
