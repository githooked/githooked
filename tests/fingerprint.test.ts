import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverRepository } from '../src/setup/fingerprint.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('repository security fingerprint', () => {
  it('detects repository technology while keeping context bounded and excluding sensitive files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'git-hooked-fingerprint-')); roots.push(root);
    await mkdir(join(root, 'src', 'routes'), { recursive: true });
    await mkdir(join(root, 'node_modules', 'ignored'), { recursive: true });
    await mkdir(join(root, '.githooked', 'hooks'), { recursive: true });
    await mkdir(join(root, 'many'), { recursive: true });
    await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { express: '1', '@prisma/client': '1', passport: '1' }, devDependencies: { vitest: '1' } }));
    await writeFile(join(root, 'package-lock.json'), '{}');
    await writeFile(join(root, 'src', 'routes', 'accounts.ts'), 'export const route = true;\n');
    await writeFile(join(root, '.githooked', 'hooks', 'pre-push.yml'), 'checks: []\n');
    await writeFile(join(root, '.env'), 'TOKEN=do-not-send\n');
    await writeFile(join(root, 'private.pem'), 'do-not-send\n');
    await writeFile(join(root, 'node_modules', 'ignored', 'index.js'), 'ignored\n');
    await Promise.all(Array.from({ length: 410 }, (_, index) => writeFile(join(root, 'many', `${String(index).padStart(3, '0')}.txt`), 'bounded\n')));
    if (process.platform !== 'win32') await symlink(join(root, '.env'), join(root, 'linked-secret'));

    const result = await discoverRepository(root);
    expect(result.fingerprint).toMatchObject({
      frameworks: ['Express'], packageManagers: ['npm'], databaseClients: ['Prisma'], authenticationLibraries: ['Passport'], testTools: ['Vitest'],
    });
    expect(result.fingerprint.languages).toContainEqual({ name: 'TypeScript', files: 1 });
    expect(result.fingerprint.apiEntryPoints).toContain('src/routes/accounts.ts');
    expect(result.repositoryMap.files).toContain('package.json');
    expect(result.repositoryMap.files.length).toBeLessThanOrEqual(400);
    expect(result.repositoryMap.truncated).toBe(true);
    expect(result.repositoryMap.files).not.toEqual(expect.arrayContaining(['.env', 'private.pem', 'node_modules/ignored/index.js', 'linked-secret']));
    expect(result.selectedFiles.find((file) => file.path === 'src/routes/accounts.ts')?.content).toContain('route');
    expect(JSON.stringify(result)).not.toContain('do-not-send');
  });
});
