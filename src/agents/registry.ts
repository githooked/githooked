import type { CommandRunner } from '../core/process.js';
import { CodexAdapter } from './codex.js';
import { PromptCliAdapter, promptCliSpecs } from './prompt-cli.js';
import type { AgentAdapter, AgentDetectionResult, FixInput, FixResult, ReviewInput } from './types.js';
import type { ReviewResult } from '../review/result.js';
import type { RulePlanInput, RulePlanResult } from '../rules/plan.js';
import type { SecurityProposalInput, SecurityProposalResult } from '../setup/proposal.js';

export function createAgentRegistry(cwd: string, run?: CommandRunner): AgentAdapter[] {
  return [new CodexAdapter(run, cwd), ...promptCliSpecs.map((spec) => new PromptCliAdapter(spec, run, cwd))];
}

class AutoAgentAdapter implements AgentAdapter {
  readonly id = 'auto'; readonly displayName = 'Coding agent';
  private selected?: Promise<AgentAdapter>;
  constructor(private readonly agents: AgentAdapter[]) {}
  private choose(): Promise<AgentAdapter> {
    return this.selected ??= (async () => {
      for (const agent of this.agents) if ((await agent.detect()).available) return agent;
      throw new Error(`No supported coding-agent CLI detected. Install or configure one of: ${this.agents.map((agent) => agent.displayName).join(', ')}.`);
    })();
  }
  async detect(): Promise<AgentDetectionResult> {
    try { const agent = await this.choose(); const result = await agent.detect(); return { ...result, version: `${agent.displayName}${result.version ? ` ${result.version}` : ''}` }; }
    catch (error) { return { available: false, error: error instanceof Error ? error.message : String(error) }; }
  }
  async review(input: ReviewInput): Promise<ReviewResult> { return (await this.choose()).review(input); }
  async planRule(input: RulePlanInput): Promise<RulePlanResult> { return (await this.choose()).planRule(input); }
  async proposeSecurity(input: SecurityProposalInput): Promise<SecurityProposalResult> { return (await this.choose()).proposeSecurity(input); }
  async fix(input: FixInput): Promise<FixResult> { return (await this.choose()).fix(input); }
}

export function resolveAgent(provider: 'auto' | 'codex' | 'claude' | 'gemini' | 'copilot' | 'cursor', cwd: string, run?: CommandRunner): AgentAdapter {
  const agents = createAgentRegistry(cwd, run);
  const agent = provider === 'auto' ? new AutoAgentAdapter(agents) : agents.find((candidate) => candidate.id === provider);
  if (!agent) throw new Error(`Configured agent provider is unavailable: ${provider}`);
  return agent;
}
