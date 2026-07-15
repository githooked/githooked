import type { ExistingSemanticCheck, SecurityProposal } from './proposal.js';

const stopWords = new Set(['a', 'an', 'and', 'are', 'be', 'by', 'every', 'for', 'from', 'in', 'is', 'must', 'of', 'on', 'or', 'repository', 'the', 'to', 'with']);

function canonical(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function tokens(value: string): Set<string> {
  return new Set(canonical(value).split(' ').filter((token) => token.length > 1 && !stopWords.has(token)));
}

function dice(left: string, right: string): number {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

function similar(left: string, right: string): boolean {
  const a = canonical(left);
  const b = canonical(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.min(a.length, b.length) >= 16 && (a.includes(b) || b.includes(a))) return true;
  return dice(a, b) >= 0.72;
}

function duplicateOf(proposal: SecurityProposal, check: ExistingSemanticCheck): boolean {
  return proposal.id === check.id || similar(proposal.name, check.name) || similar(proposal.rule, check.instructions);
}

export interface DeduplicatedProposals {
  proposals: SecurityProposal[];
  removed: Array<{ id: string; duplicateOf: string }>;
}

export function deduplicateSecurityProposals(
  proposals: readonly SecurityProposal[],
  existingChecks: readonly ExistingSemanticCheck[],
): DeduplicatedProposals {
  const accepted: SecurityProposal[] = [];
  const removed: Array<{ id: string; duplicateOf: string }> = [];
  for (const proposal of proposals) {
    const existing = existingChecks.find((check) => duplicateOf(proposal, check));
    if (existing) { removed.push({ id: proposal.id, duplicateOf: existing.id }); continue; }
    const earlier = accepted.find((candidate) => duplicateOf(proposal, { id: candidate.id, name: candidate.name, instructions: candidate.rule }));
    if (earlier) { removed.push({ id: proposal.id, duplicateOf: earlier.id }); continue; }
    accepted.push(proposal);
  }
  return { proposals: accepted, removed };
}
