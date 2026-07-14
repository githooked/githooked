import type { CommandRunner } from '../core/process.js';
import { CodexAdapter } from './codex.js';
import type { AgentAdapter } from './types.js';

export function createAgentRegistry(cwd: string, run?: CommandRunner): AgentAdapter[] {
  return [new CodexAdapter(run, cwd)];
}

export function resolveAgent(provider: 'auto' | 'codex', cwd: string, run?: CommandRunner): AgentAdapter {
  const agents = createAgentRegistry(cwd, run);
  const agent = provider === 'auto' ? agents[0] : agents.find((candidate) => candidate.id === provider);
  if (!agent) throw new Error(`Configured agent provider is unavailable: ${provider}`);
  return agent;
}
