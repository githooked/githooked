import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRuleCommand } from '../src/cli/commands/rule.js';
import { defaultConfig } from '../src/config/schema.js';
import { writeConfig } from '../src/config/write.js';

const execute = promisify(execFile);
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe('rule add', () => {
  it('scaffolds a semantic check and attaches it to pre-push once', async () => {
    const root = await mkdtemp(join(tmpdir(), 'git-hooked-rule-')); roots.push(root);
    await execute('git', ['init', '-q'], { cwd: root });
    await writeConfig(root, defaultConfig);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const rule = 'Every database query must include tenantId';
    await addRuleCommand(rule, root);
    await addRuleCommand(rule, root);
    const id = 'every-database-query-must-include-tenantid';
    expect(await readFile(join(root, '.githooked', 'checks', id, 'instructions.md'), 'utf8')).toBe(`${rule}\n`);
    const hook = await readFile(join(root, '.githooked', 'hooks', 'pre-push.yml'), 'utf8');
    expect(hook.match(new RegExp(`check:${id}`, 'g'))).toHaveLength(1);
  });
});
