import type { ReviewResult } from '../review/result.js';
import type { SecurityProposalInput, SecurityProposalResult } from '../setup/proposal.js';

export interface AgentDetectionResult { available: boolean; version?: string; error?: string }
export interface SemanticCheckInput {
  id: string; name: string; instructions: string; category: 'security' | 'correctness' | 'testing' | 'breaking-change' | 'repository-rule';
  severity?: 'info' | 'low' | 'medium' | 'high' | 'critical'; files: string[];
}
export interface ReviewInput { diff: string; files: string[]; checks: SemanticCheckInput[]; partial: boolean; timeoutMs: number }
export interface FixInput { findings: ReviewResult; timeoutMs: number }
export interface FixResult { success: boolean; summary: string }
export interface AgentAdapter {
  id: string; displayName: string;
  detect(): Promise<AgentDetectionResult>;
  review(input: ReviewInput): Promise<ReviewResult>;
  proposeSecurity(input: SecurityProposalInput): Promise<SecurityProposalResult>;
  fix(input: FixInput): Promise<FixResult>;
}
