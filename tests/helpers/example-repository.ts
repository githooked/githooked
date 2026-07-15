import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import YAML from 'yaml';
import { z } from 'zod';
import { runCommand, type CommandResult } from '../../src/core/process.js';

const require = createRequire(import.meta.url);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cliSource = join(projectRoot, 'src', 'cli', 'index.ts');
const tsxImport = pathToFileURL(require.resolve('tsx')).href;
const fixturesRoot = join(projectRoot, 'examples', 'fixtures');
const artifactsRoot = join(projectRoot, 'test-results', 'examples');

const manifestSchema = z.object({
  name: z.string().min(1),
  hook: z.enum(['pre-commit', 'pre-push']),
  push: z.enum(['upstream', 'new-branch']).optional(),
  response: z.string().optional(),
  checks: z.array(z.string()).optional(),
  agent_error: z.enum(['warn', 'block']).default('block'),
  gitleaks: z.enum(['pass', 'leak']).default('pass'),
  remove: z.array(z.string()).default([]),
  generate: z.array(z.object({ path: z.string().min(1), bytes: z.number().int().positive() })).default([]),
  expected: z.object({
    exit_code: z.number().int().nonnegative(),
    agent_invoked: z.boolean(),
    output_includes: z.array(z.string()).default([]),
    prompt_includes: z.array(z.string()).default([]),
    prompt_excludes: z.array(z.string()).default([]),
  }),
}).strict();

export type ExampleManifest = z.infer<typeof manifestSchema>;

export interface ExampleRun {
  manifest: ExampleManifest;
  exitCode: number;
  output: string;
  prompt: string;
}

function shellQuote(path: string): string {
  return `'${path.replaceAll('\\', '/').replaceAll("'", "'\\''")}'`;
}

async function executable(path: string, content: string): Promise<void> {
  await writeFile(path, content, 'utf8');
  if (process.platform !== 'win32') await chmod(path, 0o755);
}

export async function createProcessShims(bin: string): Promise<void> {
  await mkdir(bin, { recursive: true });
  await executable(join(bin, 'git-hooked'), `#!/bin/sh
${shellQuote(process.execPath)} --import ${shellQuote(tsxImport)} ${shellQuote(cliSource)} "$@" > "$GIT_HOOKED_CAPTURE_OUTPUT" 2>&1
status=$?
cat "$GIT_HOOKED_CAPTURE_OUTPUT"
exit $status
`);
  await executable(join(bin, 'codex'), `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "codex-cli recorded"
  exit 0
fi
cat > "$GIT_HOOKED_CAPTURE_PROMPT"
cat "$GIT_HOOKED_RECORDED_RESPONSE"
exit "\${GIT_HOOKED_RECORDED_EXIT:-0}"
`);
  await writeFile(join(bin, 'codex.cmd'), `@echo off\r
if "%~1"=="--version" (\r
  echo codex-cli recorded\r
  exit /b 0\r
)\r
more > "%GIT_HOOKED_CAPTURE_PROMPT%"\r
type "%GIT_HOOKED_RECORDED_RESPONSE%"\r
exit /b %GIT_HOOKED_RECORDED_EXIT%\r
`, 'utf8');
  await executable(join(bin, 'gitleaks'), `#!/bin/sh
if [ "$GIT_HOOKED_GITLEAKS" = "leak" ]; then
  echo "Finding: REDACTED"
  exit 1
fi
exit 0
`);
  await writeFile(join(bin, 'gitleaks.cmd'), `@echo off\r
if "%GIT_HOOKED_GITLEAKS%"=="leak" (\r
  echo Finding: REDACTED\r
  exit /b 1\r
)\r
exit /b 0\r
`, 'utf8');
}

function commandOutput(result: CommandResult): string {
  return [result.stdout, result.stderr].filter(Boolean).join('\n');
}

async function successful(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<CommandResult> {
  const result = await runCommand(command, args, { cwd, env, timeout: 30_000 });
  if (result.exitCode !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.exitCode}):\n${commandOutput(result)}`);
  return result;
}

async function git(args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<CommandResult> {
  return successful('git', args, cwd, env);
}

async function copyDirectory(source: string, destination: string): Promise<void> {
  await cp(source, destination, { recursive: true, force: true });
}

async function loadManifest(name: string): Promise<{ directory: string; manifest: ExampleManifest }> {
  const directory = join(fixturesRoot, name);
  const raw: unknown = YAML.parse(await readFile(join(directory, 'expected.yml'), 'utf8'));
  const manifest = manifestSchema.parse(raw);
  if (manifest.name !== name) throw new Error(`Fixture directory ${name} declares name ${manifest.name}.`);
  return { directory, manifest };
}

async function writeProjectConfig(root: string, manifest: ExampleManifest): Promise<void> {
  await writeFile(join(root, '.githooked', 'config.yml'), YAML.stringify({
    version: 1,
    agent: { provider: 'codex', timeout_ms: 30_000 },
    blocking: { severities: ['critical', 'high'] },
    behaviour: { agent_error: manifest.agent_error, cache: false },
  }), 'utf8');
  if (manifest.checks) {
    await writeFile(join(root, '.githooked', 'hooks', 'pre-push.yml'), YAML.stringify({ checks: manifest.checks }), 'utf8');
  }
}

async function recordArtifact(name: string, value: object): Promise<void> {
  await mkdir(artifactsRoot, { recursive: true });
  await writeFile(join(artifactsRoot, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export const exampleFixtureNames = [
  'express-insecure-api',
  'express-secure-api',
  'typescript-library-breaking-change',
  'workspace-monorepo',
  'staged-secrets',
  'large-diff',
] as const;

export async function runExampleFixture(name: string): Promise<ExampleRun> {
  const { directory, manifest } = await loadManifest(name);
  const temporary = await mkdtemp(join(tmpdir(), `git-hooked-example-${name}-`));
  const root = join(temporary, 'repository');
  const remote = join(temporary, 'remote.git');
  const bin = join(temporary, 'bin');
  const promptPath = join(temporary, 'agent-prompt.txt');
  const hookOutputPath = join(temporary, 'hook-output.txt');
  const responsePath = manifest.response ? resolve(directory, manifest.response) : join(temporary, 'unused-response.json');
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
    GIT_HOOKED_CAPTURE_PROMPT: promptPath,
    GIT_HOOKED_CAPTURE_OUTPUT: hookOutputPath,
    GIT_HOOKED_RECORDED_RESPONSE: responsePath,
    GIT_HOOKED_RECORDED_EXIT: '0',
    GIT_HOOKED_GITLEAKS: manifest.gitleaks,
    GIT_CONFIG_NOSYSTEM: '1',
  };

  try {
    await Promise.all([mkdir(root, { recursive: true }), createProcessShims(bin)]);
    await git(['init', '-q', '--initial-branch=main'], root, env);
    await git(['config', 'user.name', 'Git Hooked Examples'], root, env);
    await git(['config', 'user.email', 'examples@githooked.invalid'], root, env);
    await git(['config', 'commit.gpgSign', 'false'], root, env);
    await successful(process.execPath, ['--import', tsxImport, cliSource, 'init'], root, env);
    await writeProjectConfig(root, manifest);
    await copyDirectory(join(directory, 'base'), root);
    await git(['add', '--all', '--force'], root, env);
    await git(['commit', '-q', '--no-verify', '-m', 'fixture baseline'], root, env);

    if (manifest.hook === 'pre-push') {
      await git(['init', '-q', '--bare', '--initial-branch=main', remote], root, env);
      await git(['remote', 'add', 'origin', remote], root, env);
      await successful('git', ['push', '-q', '--set-upstream', 'origin', 'main'], root, { ...env, GIT_HOOKED_SKIP: '1' });
      if (manifest.push === 'new-branch') await git(['switch', '-q', '-c', 'fixture-branch'], root, env);
    }

    await copyDirectory(join(directory, 'changes'), root);
    for (const path of manifest.remove) await rm(join(root, path), { recursive: true, force: true });
    for (const generated of manifest.generate) {
      const path = join(root, generated.path);
      await mkdir(dirname(path), { recursive: true });
      const prefix = '// generated fixture content\nexport const payload = `';
      const suffix = '`;\n';
      await writeFile(path, `${prefix}${'x'.repeat(Math.max(0, generated.bytes - prefix.length - suffix.length))}${suffix}`, 'utf8');
    }
    await git(['add', '--all', '--force'], root, env);

    let operation: CommandResult;
    if (manifest.hook === 'pre-commit') {
      operation = await runCommand('git', ['commit', '-m', `exercise ${name}`], { cwd: root, env, timeout: 60_000 });
    } else {
      await git(['commit', '-q', '-m', `exercise ${name}`], root, env);
      const pushArgs = manifest.push === 'new-branch'
        ? ['push', '--set-upstream', 'origin', 'fixture-branch']
        : ['push', 'origin', 'main'];
      operation = await runCommand('git', pushArgs, { cwd: root, env, timeout: 60_000 });
    }

    const hookOutput = await readFile(hookOutputPath, 'utf8').catch(() => '');
    const operationOutput = commandOutput(operation);
    const capturedHookOutput = hookOutput.trim();
    const output = capturedHookOutput && !operationOutput.includes(capturedHookOutput)
      ? [capturedHookOutput, operationOutput].filter(Boolean).join('\n')
      : operationOutput;
    const prompt = await readFile(promptPath, 'utf8').catch(() => '');
    const result = { manifest, exitCode: operation.exitCode, output, prompt };
    await recordArtifact(name, { exitCode: result.exitCode, output: result.output, promptBytes: Buffer.byteLength(result.prompt) });
    return result;
  } catch (error) {
    await recordArtifact(name, { harnessError: error instanceof Error ? error.stack ?? error.message : String(error) });
    throw error;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
