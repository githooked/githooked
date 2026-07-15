import { describe, expect, it } from 'vitest';
import { configSchema } from '../src/config/schema.js';

describe('config schema', () => {
  it('applies safe defaults', () => {
    const config = configSchema.parse({ version: 1 });
    expect(config.agent.provider).toBe('auto');
    expect(config.behaviour.agent_error).toBe('warn');
    expect(config.blocking.severities).toEqual(['critical', 'high']);
  });
  it('reports an offending path', () => {
    const result = configSchema.safeParse({ version: 1, agent: { provider: 'bogus' } });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['agent', 'provider']);
  });
  it.each(['codex', 'claude', 'gemini', 'copilot', 'cursor'])('accepts the implemented %s provider', (provider) => expect(configSchema.safeParse({ version: 1, agent: { provider } }).success).toBe(true));
});
