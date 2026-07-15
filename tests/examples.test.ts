import { describe, expect, it } from 'vitest';
import { exampleFixtureNames, runExampleFixture } from './helpers/example-repository.js';

describe.sequential('example project workflows', () => {
  for (const name of exampleFixtureNames) {
    it(name, async () => {
      const result = await runExampleFixture(name);
      expect(result.exitCode).toBe(result.manifest.expected.exit_code);
      for (const text of result.manifest.expected.output_includes) expect(result.output).toContain(text);
      expect(result.prompt.length > 0).toBe(result.manifest.expected.agent_invoked);
      for (const text of result.manifest.expected.prompt_includes) expect(result.prompt).toContain(text);
      for (const text of result.manifest.expected.prompt_excludes) expect(result.prompt).not.toContain(text);
    }, 120_000);
  }
});
