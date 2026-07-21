// Value Object — ReviewVerdict (machine-readable outcome of a reviewer run)
//
// Reviewers emit a prose review for humans AND a structured trailer for the
// orchestrator. The trailer is authoritative: loop control reads only this,
// never the prose. Substring-matching the prose is what the old implementation
// did, and it misfires on the reviewer's own output-format template.

export const Verdict = {
  APPROVED: 'APPROVED',
  APPROVED_WITH_WARNINGS: 'APPROVED_WITH_WARNINGS',
  REJECTED: 'REJECTED',
} as const;

export type Verdict = (typeof Verdict)[keyof typeof Verdict];

const VERDICT_VALUES: ReadonlySet<string> = new Set(Object.values(Verdict));

/** Type guard — narrows an arbitrary string to `Verdict`. */
export function isValidVerdict(value: string): value is Verdict {
  return VERDICT_VALUES.has(value);
}

export interface ReviewVerdict {
  readonly verdict: Verdict;
  readonly blockers: number;
  readonly warnings: number;
  readonly info: number;
  /**
   * Stable kebab-case topic slugs, one per BLOCKER finding.
   *
   * Used for convergence detection: if a retry produces a blocker set that is
   * a subset of the previous attempt's, the loop is not making progress and
   * should escalate rather than burn its remaining iterations.
   */
  readonly blockerTopics: readonly string[];
}

/** Only BLOCKER findings gate advancement. WARNING/INFO are recorded, not blocking. */
export function isBlocking(verdict: ReviewVerdict): boolean {
  return verdict.verdict === Verdict.REJECTED;
}
