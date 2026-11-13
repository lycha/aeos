// Driving port — TicketShow use case interface

import type { Column } from '../../model/column.js';
import type { GateRecord } from '../../model/gate-record.js';
import type { RunRecord } from '../../model/run-record.js';
import type { SpecPin } from '../../model/spec-pin.js';
import type { Ticket } from '../../model/ticket.js';

export interface TicketShowInput {
  projectId: string;
  ticketId: string;
  projectPath: string;
}

export interface TicketExecutionInfo {
  executor: string;
  model: string;
  agent: string;
  column: string;
  recordedAt: string;
  /** Null when the executor did not report a cost. */
  costUsd: number | null;
}

/**
 * A decision form a ticket's current facts allow (AC-9/AC-22). Mirrors
 * `application/services/ticket-actions.ts`'s `AvailableActionId` field for
 * field — domain ports do not import the application layer.
 */
export type AvailableActionId =
  | 'ticketAnswer'
  | 'ticketResolve'
  | 'ticketApprove'
  | 'ticketDodApprove'
  | 'ticketSignOff'
  | 'ticketReady'
  | 'ticketRepin'
  | 'ticketMove';

export type TicketShowResult =
  | {
      ok: true;
      ticket: Ticket;
      artifacts: string[];
      executions: TicketExecutionInfo[];
      /** Ids of the run records under the ticket's `runs/`, oldest first. */
      runs: string[];
      /** The same run records in full, oldest first — AC-8. */
      runRecords: RunRecord[];
      /** Child tasks, when the ticket is an epic. Empty otherwise. */
      children: Ticket[];
      /** Parent epic, when the ticket is a task. Null otherwise. */
      parent: Ticket | null;
      /** The ticket's spec pin: its own, or its parent epic's. */
      specPin: SpecPin | null;
      /** True when the feature has commits after the pinned one. */
      specMoved: boolean;
      /** `Name <email>` a decision recorded here would carry — AC-15. Null without a git identity. */
      gitIdentity: string | null;
      /** The decision forms this ticket's current facts allow — AC-9. */
      availableActions: AvailableActionId[];
      /** Columns of the ticket's own pipeline it may be moved to, current column excluded — AC-22. */
      availableColumns: Column[];
      /** True only when the ticket has a spec pin with an unapproved amendment — AC-9's BLOCKED branch. */
      pendingAmendment: boolean;
      /** Gate records of this ticket, in file order — AC-8. */
      gateRecords: GateRecord[];
    }
  | { ok: false; reason: 'NOT_FOUND' };

export interface TicketShowPort {
  execute(input: TicketShowInput): TicketShowResult;
}
