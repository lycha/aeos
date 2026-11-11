// Driving port — TicketApprove use case interface (advance column)

import type { Column } from '../../model/column.js';

export type TicketApproveResult =
  | {
      status: 'advanced';
      ticketId: string;
      fromColumn: Column;
      toColumn: Column;
      /** The ticket's pull request, when it has one. */
      pullRequestUrl: string | null;
      /** The gate record of the approval. Absent when the engine advanced the ticket. */
      gateRecordId?: string;
    }
  | { status: 'already_done'; ticketId: string }
  | { status: 'error'; ticketId: string; error: string };

export interface TicketApprovePort {
  /**
   * `byEngine`: the orchestrator advancing an `advanceMode: auto` column. That
   * is not a human decision, so no gate record is written for it.
   * `contract`: the person also approves the contract change the ticket
   * carries (`--contract`). The engine cannot.
   * `pullRequestHost`: asked once the approval is about to open a pull
   * request, and only then; false stops it, with the ticket left as it was.
   */
  execute(
    projectId: string,
    projectPath: string,
    ticketId: string,
    options?: { byEngine?: boolean; contract?: boolean; pullRequestHost?: () => boolean },
  ): TicketApproveResult;
}
