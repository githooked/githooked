import { z } from 'zod';
import { severitySchema } from '../config/schema.js';

export const securityFocusSchema = z.enum(['auth', 'database', 'api', 'secrets', 'dependencies', 'testing', 'general']);

const evidencePathSchema = z.string().min(1).max(500).refine(
  (value) => !value.startsWith('/') && !value.startsWith('\\') && !/^[a-z]:[/\\]/i.test(value) && !value.split(/[/\\]/).includes('..'),
  'Evidence paths must stay within the repository.',
);

const appliesToSchema = z.string().min(1).max(500).refine(
  (value) => !value.startsWith('/') && !value.startsWith('\\') && !/^[a-z]:[/\\]/i.test(value) && !value.split(/[/\\]/).includes('..'),
  'Applicability globs must be repository-relative.',
);

export const securityProposalSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).max(80),
  name: z.string().min(3).max(160),
  focus: securityFocusSchema,
  rule: z.string().min(10).max(2_000),
  rationale: z.string().min(10).max(2_000),
  evidence: z.array(z.object({
    path: evidencePathSchema,
    detail: z.string().min(3).max(500),
  }).strict()).min(1).max(10),
  severity: severitySchema,
  applies_to: z.array(appliesToSchema).min(1).max(20),
  confidence: z.number().min(0).max(1),
}).strict();

export const securityProposalResultSchema = z.object({
  summary: z.string().max(2_000),
  proposals: z.array(securityProposalSchema).max(20),
}).strict();

export type SecurityFocus = z.infer<typeof securityFocusSchema>;
export type SecurityProposal = z.infer<typeof securityProposalSchema>;
export type SecurityProposalResult = z.infer<typeof securityProposalResultSchema>;

export interface DetectedLanguage { name: string; files: number }
export interface SelectedRepositoryFile { path: string; content: string; truncated: boolean }
export interface RepositoryFingerprint {
  languages: DetectedLanguage[];
  frameworks: string[];
  packageManagers: string[];
  databaseClients: string[];
  authenticationLibraries: string[];
  testTools: string[];
  apiEntryPoints: string[];
}
export interface RepositoryProposalContext {
  fingerprint: RepositoryFingerprint;
  repositoryMap: { files: string[]; scannedFiles: number; truncated: boolean };
  selectedFiles: SelectedRepositoryFile[];
}
export interface ExistingSemanticCheck {
  id: string;
  name: string;
  instructions: string;
}
export interface SecurityProposalInput {
  context: RepositoryProposalContext;
  existingChecks: ExistingSemanticCheck[];
  focus: SecurityFocus[];
  maxProposals: number;
  timeoutMs: number;
}
