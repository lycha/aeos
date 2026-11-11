// Domain service — decides what happens after a reviewer returns a verdict.
//
// This is the termination logic for the revision loop. "Iterate until the
// reviewer approves without changes" does not terminate on its own: reviewers
// essentially always find something, and two models will disagree on style
// indefinitely. Four independent guards make it finite:
//
//   1. Severity gate      — only REJECTED blocks; warnings are recorded, not gating
//   2. Iteration ceiling  — a hard cap on attempts
//   3. Convergence        — stop early when a retry stops making progress
//   4. Budget ceiling     — owned by the orchestrator, not this function
//
// Pure: no I/O, no clock, no randomness. Everything it needs is in its input.

import { Verdict, type ReviewVerdict } from '../model/review-verdict.js';
import { EscalationReason, type Escalation } from '../model/escalation.js';

export interface LoopConfig {
  /** When false, a rejection ends the run immediately — no revision attempts. */
  readonly enabled: boolean;
  /** Hard ceiling on attempts, including the first. Ignored when `enabled` is false. */
  readonly maxIterations: number;
  /** What an exhausted loop does: hand to a human, or accept the artifact as-is. */
  readonly escalation: 'escalate_to_human' | 'mark_done';
}

export type LoopDecision =
  | { readonly action: 'advance'; readonly reason: string }
  | { readonly action: 'retry'; readonly nextAttempt: number; readonly reason: string }
  | { readonly action: 'escalate'; readonly escalation: Escalation };

/** The blocker topic of a failed check, for convergence detection. */
export function checkBlockerTopic(checkName: string): string {
  return `check:${checkName}`;
}

/**
 * What the attempt ended with: a reviewer verdict, or the name of the check
 * that failed before the reviewer was asked. A failed check is a rejection.
 */
export type LoopDecisionInput = LoopDecisionBase &
  ({ readonly verdict: ReviewVerdict } | { readonly failedCheck: string });

interface LoopDecisionBase {
  /** 1-based number of the attempt that just completed. */
  readonly attempt: number;
  readonly config: LoopConfig;
  /**
   * Blocker topics from every prior attempt, oldest first, excluding the
   * attempt being decided. Used to detect a stalled loop.
   */
  readonly previousBlockerTopics: readonly (readonly string[])[];
  readonly reviewPath?: string;
}

/**
 * True when this attempt's blockers are wholly contained in the previous
 * attempt's — the revision cleared nothing new, so further attempts are
 * unlikely to converge.
 *
 * Requires topics on both sides: a reviewer that omits them leaves us unable
 * to judge progress, and guessing "stalled" would cut the loop short unfairly.
 */
function hasStalled(current: readonly string[], previous: readonly (readonly string[])[]): boolean {
  const lastAttempt = previous[previous.length - 1];
  if (!lastAttempt || lastAttempt.length === 0 || current.length === 0) {
    return false;
  }
  const previousTopics = new Set(lastAttempt);
  return current.every((topic) => previousTopics.has(topic));
}

export function decideNextAttempt(input: LoopDecisionInput): LoopDecision {
  const { attempt, config, previousBlockerTopics, reviewPath } = input;
  const failedCheck = 'failedCheck' in input ? input.failedCheck : undefined;
  const verdict: ReviewVerdict =
    'verdict' in input
      ? input.verdict
      : {
          verdict: Verdict.REJECTED,
          blockers: 1,
          warnings: 0,
          info: 0,
          blockerTopics: [checkBlockerTopic(input.failedCheck)],
        };
  const reported =
    failedCheck === undefined
      ? `Reviewer reported ${verdict.blockers} blocker(s)`
      : `Check '${failedCheck}' failed`;

  // Guard 1 — severity gate. Only a rejection blocks. APPROVED_WITH_WARNINGS
  // advances by design: warnings are recorded on the artifact for a human,
  // and gating on them is what makes the loop non-terminating.
  if (verdict.verdict !== Verdict.REJECTED) {
    return {
      action: 'advance',
      reason:
        verdict.verdict === Verdict.APPROVED
          ? 'Reviewer approved with no findings.'
          : `Reviewer approved with ${verdict.warnings} warning(s); recorded but non-blocking.`,
    };
  }

  // A disabled loop behaves as a one-attempt loop.
  const effectiveMax = config.enabled ? Math.max(1, config.maxIterations) : 1;

  // Guard 3 — convergence. Checked before the ceiling so a stalled loop stops
  // at the point it stalls rather than burning its remaining attempts.
  if (config.enabled && hasStalled(verdict.blockerTopics, previousBlockerTopics)) {
    return {
      action: 'escalate',
      escalation: {
        reason: EscalationReason.NOT_CONVERGING,
        message: `Attempt ${attempt} reproduced the same blockers as attempt ${attempt - 1} (${verdict.blockerTopics.join(', ')}). Further attempts are unlikely to converge.`,
        attempt,
        artifactPath: reviewPath,
      },
    };
  }

  // Guard 2 — iteration ceiling.
  if (attempt >= effectiveMax) {
    // A red check is never marked done: nothing was reviewed, and the checks
    // stage is the evidence the build works.
    if (config.escalation === 'mark_done' && failedCheck === undefined) {
      return {
        action: 'advance',
        reason: `Iteration limit (${effectiveMax}) reached with ${verdict.blockers} unresolved blocker(s); column escalation policy is 'mark_done', advancing anyway.`,
      };
    }
    return {
      action: 'escalate',
      escalation: {
        reason: EscalationReason.ITERATIONS_EXHAUSTED,
        message: !config.enabled
          ? `${reported} and the revision loop is disabled.`
          : failedCheck === undefined
            ? `Reviewer still reports ${verdict.blockers} blocker(s) after ${attempt} attempt(s) (limit ${effectiveMax}).`
            : `Check '${failedCheck}' still fails after ${attempt} attempt(s) (limit ${effectiveMax}).`,
        attempt,
        artifactPath: reviewPath,
      },
    };
  }

  return {
    action: 'retry',
    nextAttempt: attempt + 1,
    reason: `${reported}; starting attempt ${attempt + 1} of ${effectiveMax}.`,
  };
}
