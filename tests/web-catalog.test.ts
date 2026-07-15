import { describe, expect, it } from 'vitest';
import { builtinChecks as runtimeBuiltins } from '../src/checks/registry.js';
import { defaultHooks } from '../src/config/schema.js';
import { guidePackIds, loadGuidePack } from '../src/guides/registry.js';
import { builtinChecks as catalogBuiltins, guidePacks as catalogPacks } from '../web/src/catalog.js';

describe('web check catalog', () => {
  it('matches the runtime built-ins and default hooks', () => {
    expect(Object.fromEntries(catalogBuiltins.map((check) => [check.id, { kind: check.kind }]))).toEqual(runtimeBuiltins);
    expect({
      'pre-commit': { checks: catalogBuiltins.filter((check) => check.defaultHook === 'pre-commit').map((check) => `builtin:${check.id}`) },
      'pre-push': { checks: catalogBuiltins.filter((check) => check.defaultHook === 'pre-push').map((check) => `builtin:${check.id}`) },
    }).toEqual(defaultHooks);
  });

  it('matches the curated guide-pack manifests', async () => {
    expect(catalogPacks.map((pack) => pack.id)).toEqual(guidePackIds);
    for (const id of guidePackIds) {
      const runtime = await loadGuidePack(id);
      const catalog = catalogPacks.find((pack) => pack.id === id);
      expect(catalog).toMatchObject({
        id: runtime.id,
        name: runtime.name,
        description: runtime.description,
        defaultHook: runtime.default_hook,
        checks: runtime.checks.map(({ id: checkId, name, category, severity }) => ({ id: checkId, name, category, severity })),
      });
    }
  });
});
