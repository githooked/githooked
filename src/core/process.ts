import { execa, type Options } from 'execa';

export interface CommandResult { stdout: string; stderr: string; exitCode: number }
export type CommandRunner = (command: string, args: readonly string[], options?: Options) => Promise<CommandResult>;

export const runCommand: CommandRunner = async (command, args, options = {}) => {
  const result = await execa(command, args, { reject: false, maxBuffer: 2_000_000, ...options });
  const output = (value: unknown): string => typeof value === 'string' ? value : value == null ? '' : String(value);
  return { stdout: output(result.stdout), stderr: output(result.stderr), exitCode: result.exitCode ?? 1 };
};
