import type { CommandRunner } from '../core/process.js';
import { runCommand } from '../core/process.js';
import { buildReviewPrompt } from '../review/prompt.js';
import { reviewResultSchema, type ReviewResult } from '../review/result.js';
import type { AgentAdapter, AgentDetectionResult, FixInput, FixResult, ReviewInput } from './types.js';

const schema = JSON.stringify(zodToJsonSchema(reviewResultSchema, { $refStrategy: 'none', target: 'openApi3' }));

export class CodexAdapter implements AgentAdapter {
  readonly id = 'codex'; readonly displayName = 'Codex';
  constructor(private readonly run: CommandRunner = runCommand, private readonly cwd = process.cwd()) {}
  async detect(): Promise<AgentDetectionResult> {
    try {
      const result = await this.run('codex', ['--version'], { timeout: 10_000 });
      return result.exitCode === 0 ? { available: true, version: result.stdout.trim() } : { available: false, error: result.stderr.trim() };
    } catch { return { available: false, error: 'Codex CLI is not installed or is not on PATH.' }; }
  }
  async review(input: ReviewInput): Promise<ReviewResult> {
    const directory = await mkdtemp(join(tmpdir(), 'git-hooked-'));
    const schemaPath = join(directory, 'review-schema.json');
    try {
      await writeFile(schemaPath, schema, { encoding: 'utf8', mode: 0o600 });
      const result = await this.run('codex', ['exec', '--ephemeral', '--sandbox', 'read-only', '--output-schema', schemaPath, '-'], {
        cwd: this.cwd, input: buildReviewPrompt(input), timeout: input.timeoutMs, env: { ...process.env, GIT_HOOKED_REVIEW: '1' },
      });
      if (result.exitCode !== 0) throw new Error(`Codex review failed (exit ${result.exitCode}): ${result.stderr.trim().slice(0, 500)}`);
      let parsed: unknown;
      try { parsed = JSON.parse(result.stdout); } catch { throw new Error('Codex returned malformed JSON; review was not considered successful.'); }
      return reviewResultSchema.parse(parsed);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
  async fix(input: FixInput): Promise<FixResult> { void input; return { success: false, summary: 'Fix mode is scheduled for Phase 2.' }; }
}
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zodToJsonSchema } from 'zod-to-json-schema';
