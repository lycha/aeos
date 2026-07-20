// Value Object — Escalation (a run stopped and needs a human, but did not fail)
//
// Escalation is deliberately distinct from FAILED. A failure means something
// broke — the executor crashed, validation rejected the output, the state
// machine refused a transition. An escalation means the pipeline worked
// correctly and reached a point where only a human can decide.
//
// Keeping them separate is what lets an operator answer "why did this stall?"
// from the transition log, and is a precondition for the orchestrator: it must
// pause an epic on escalation rather than treating it as an error to retry.

export const EscalationReason = {
  /** Preflight found blocking questions; answered via `aeos ticket answer`. */
  PREFLIGHT_BLOCKERS: 'PREFLIGHT_BLOCKERS',
  /** The review loop used its full iteration budget without clearing blockers. */
  ITERATIONS_EXHAUSTED: 'ITERATIONS_EXHAUSTED',
  /** Successive attempts produced the same blockers — retrying will not help. */
  NOT_CONVERGING: 'NOT_CONVERGING',
  /** The reviewer emitted no parseable verdict, so the loop cannot decide. */
  UNPARSEABLE_VERDICT: 'UNPARSEABLE_VERDICT',
  /**
   * The epic exceeded its configured spend ceiling.
   *
   * Defined here so the escalation surface is complete and stable; raised only
   * once the orchestrator owns budget accounting.
   */
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
} as const;

export type EscalationReason = (typeof EscalationReason)[keyof typeof EscalationReason];

export interface Escalation {
  readonly reason: EscalationReason;
  /** Operator-facing explanation — shown by `aeos ticket show`. */
  readonly message: string;
  /** Attempt number at which the run stopped, when the loop was involved. */
  readonly attempt?: number;
  /** Artifact the operator should read first (questions, review, etc.). */
  readonly artifactPath?: string;
}

const REASON_VALUES: ReadonlySet<string> = new Set(Object.values(EscalationReason));

export function isValidEscalationReason(value: string): value is EscalationReason {
  return REASON_VALUES.has(value);
}
