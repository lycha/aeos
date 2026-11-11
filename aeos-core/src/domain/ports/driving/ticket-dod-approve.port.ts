// Driving port — TicketDodApprove use case interface (final human gate → DONE)

import type { ConformanceReport } from '../../model/conformance-report.js';

/** What the person is shown before deciding. */
export interface DodReview {
  /**
   * The conformance report as it will be committed on a yes, agent verdicts
   * and vouched criteria included. Null for a ticket with no spec.
   */
  readonly report: ConformanceReport | null;
  readonly prUrl: string | null;
}

export type TicketDodApproveResult =
  | {
      status: 'approved';
      ticketId: string;
      totalCostUsd: number | null;
      gateRecordId: string;
      /** The decision stands, and something after it did not work. */
      warning?: string;
    }
  | { status: 'cancelled'; ticketId: string; gateRecordId: string }
  | { status: 'error'; ticketId: string; error: string };

export interface TicketDodApprovePort {
  /**
   * Why this ticket cannot be decided here (it does not exist, or is not at
   * the final gate), or null. Reviews and records nothing.
   */
  refusal(projectId: string, projectPath: string, ticketId: string): string | null;

  /**
   * Rebuilds the conformance report of a spec-backed ticket at the gate, so it
   * describes the code being approved. `verified` are criteria the person
   * vouches for; each gains a human instrument.
   */
  review(
    projectId: string,
    projectPath: string,
    ticketId: string,
    verified?: readonly string[],
  ): Promise<{ ok: true; review: DodReview } | { ok: false; error: string }>;

  execute(
    projectId: string,
    projectPath: string,
    ticketId: string,
    approved: boolean,
    /**
     * Why. Required on a no, and on a yes while a criterion is failed or
     * unverified. Recorded with the gate; at least ten characters.
     */
    reason?: string,
    /** What `review` returned. A spec-backed ticket is not decided without it. */
    review?: DodReview,
  ): TicketDodApproveResult;
}
