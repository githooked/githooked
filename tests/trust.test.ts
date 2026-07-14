import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { commandChecksTrusted, configurationTrustHash, writeTrustedHash } from '../src/checks/trust.js';
import { defaultConfig } from '../src/config/schema.js';
import { writeConfig } from '../src/config/write.js';

const execute = promisify(execFile); const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('command trust', () => {
  it('is invalidated whenever .githooked content changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'git-hooked-trust-')); roots.push(root); await execute('git', ['init', '-q'], { cwd: root }); await writeConfig(root, defaultConfig);
    const directory = join(root, '.githooked', 'checks', 'script'); await mkdir(directory);
    await writeFile(join(directory, 'run.mjs'), 'process.exit(0);\n');
    const hash = await configurationTrustHash(root); await writeTrustedHash(root, hash);
    await expect(commandChecksTrusted(root)).resolves.toBe(true);
    await writeFile(join(directory, 'run.mjs'), 'process.exit(1);\n');
    await expect(commandChecksTrusted(root)).resolves.toBe(false);
  });
});
