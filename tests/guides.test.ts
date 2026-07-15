import { execFile } from 'node:child_process';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { guideAddCommand, guideRemoveCommand } from '../src/cli/commands/guide.js';
import { configurationTrustHash } from '../src/checks/trust.js';
import { loadProjectConfig } from '../src/config/load.js';
import { defaultConfig } from '../src/config/schema.js';
import { writeConfig, writeSemanticCheck } from '../src/config/write.js';
import { listGuidePacks, loadGuidePack } from '../src/guides/registry.js';
import { guidePackSchema } from '../src/guides/schema.js';

const execute = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'git-hooked-guides-')); roots.push(root);
  await execute('git', ['init', '-q'], { cwd: root });
  await writeConfig(root, defaultConfig);
  return root;
}

describe('curated guide packs', () => {
  it('matches the reviewed local registry snapshot', async () => {
    const packs = await listGuidePacks();
    expect(packs.map((pack) => ({ id: pack.id, version: pack.version, hook: pack.default_hook, checks: pack.checks.map((check) => check.id) }))).toMatchInlineSnapshot(`
      [
        {
          "checks": [
            "web-api-authentication",
            "web-api-authorization",
            "web-api-input-validation",
            "web-api-secret-exposure",
            "web-api-redirect-safety",
          ],
          "hook": "pre-push",
          "id": "security/web-api",
          "version": 1,
        },
        {
          "checks": [
            "multi-tenant-query-scoping",
            "multi-tenant-object-authorization",
            "multi-tenant-cache-isolation",
          ],
          "hook": "pre-push",
          "id": "security/multi-tenant",
          "version": 1,
        },
        {
          "checks": [
            "payments-idempotency",
            "payments-amount-integrity",
            "payments-authorization",
            "payments-audit-trail",
          ],
          "hook": "pre-push",
          "id": "security/payments",
          "version": 1,
        },
        {
          "checks": [
            "api-contract-compatibility",
            "api-behavior-tests",
          ],
          "hook": "pre-push",
          "id": "quality/api",
          "version": 1,
        },
        {
          "checks": [
            "database-migration-safety",
            "database-transaction-boundaries",
            "database-query-correctness",
          ],
          "hook": "pre-push",
          "id": "quality/database",
          "version": 1,
        },
      ]
    `);
    expect(packs.every((pack) => pack.checks.every((check) => check.instructionsText.trim().length > 40))).toBe(true);
  });

  it('rejects executable fields in pack manifests', () => {
    expect(guidePackSchema.safeParse({
      schema_version: 1, version: 1, id: 'security/example', name: 'Example guide', description: 'An example security guide.', compatible_config_versions: [1], default_hook: 'pre-push',
      checks: [{ id: 'example-check', name: 'Example check', category: 'security', severity: 'high', applies_to: ['**/*'], instructions: 'instructions.md', command: 'curl invalid' }],
    }).success).toBe(false);
  });

  it('installs idempotently with a complete preview and valid check files', async () => {
    const root = await repository();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await expect(guideAddCommand('security/multi-tenant', true, root)).resolves.toBe(0);
    const afterFirst = await configurationTrustHash(root);
    await expect(guideAddCommand('security/multi-tenant', true, root)).resolves.toBe(0);
    expect(await configurationTrustHash(root)).toBe(afterFirst);
    const project = await loadProjectConfig(root);
    expect(project.hooks['pre-push'].checks).toEqual(expect.arrayContaining([
      'check:multi-tenant-query-scoping', 'check:multi-tenant-object-authorization', 'check:multi-tenant-cache-isolation',
    ]));
    expect(project.checks.get('multi-tenant-query-scoping')?.type).toBe('semantic');
    const output = log.mock.calls.flat().join('\n');
    expect(output).toContain('CREATE .githooked/checks/multi-tenant-query-scoping/check.yml');
    expect(output).toContain('UPDATE .githooked/hooks/pre-push.yml');
    expect(output).toContain('already installed');
    await expect(access(join(root, '.githooked', 'guides', 'security--multi-tenant.yml'))).resolves.toBeUndefined();
  });

  it('removes idempotently while preserving unrelated user checks', async () => {
    const root = await repository();
    await writeSemanticCheck(root, { id: 'user-owned', name: 'User owned', category: 'repository-rule', severity: 'high', appliesTo: ['**/*'], instructions: 'Preserve this user-owned rule.' });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await guideAddCommand('quality/api', true, root);
    await expect(guideRemoveCommand('quality/api', true, root)).resolves.toBe(0);
    await expect(guideRemoveCommand('quality/api', true, root)).resolves.toBe(0);
    const project = await loadProjectConfig(root);
    expect(project.checks.has('user-owned')).toBe(true);
    expect(project.hooks['pre-push'].checks).toContain('check:user-owned');
    expect(project.hooks['pre-push'].checks).not.toContain('check:api-contract-compatibility');
  });

  it('preserves locally modified installed checks during removal', async () => {
    const root = await repository();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await guideAddCommand('quality/database', true, root);
    const instructions = join(root, '.githooked', 'checks', 'database-query-correctness', 'instructions.md');
    await writeFile(instructions, `${await readFile(instructions, 'utf8')}User customization.\n`);
    await writeFile(join(root, '.githooked', 'checks', 'database-query-correctness', 'notes.md'), 'User-owned notes.\n');
    await expect(guideRemoveCommand('quality/database', true, root)).rejects.toThrow('local changes and was preserved');
    await expect(access(instructions)).resolves.toBeUndefined();
    expect((await loadProjectConfig(root)).hooks['pre-push'].checks).toContain('check:database-query-correctness');
  });

  it('does not overwrite an unowned check with a colliding pack id', async () => {
    const root = await repository();
    const pack = await loadGuidePack('security/web-api');
    const collision = join(root, '.githooked', 'checks', pack.checks[0]!.id);
    await mkdir(collision);
    await writeFile(join(collision, 'owner.txt'), 'user-owned\n');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await expect(guideAddCommand('security/web-api', true, root)).rejects.toThrow('Check already exists');
    expect(await readFile(join(collision, 'owner.txt'), 'utf8')).toBe('user-owned\n');
    await expect(access(join(root, '.githooked', 'guides', 'security--web-api.yml'))).rejects.toThrow();
  });
});
