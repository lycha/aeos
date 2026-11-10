// Driving port — TicketShow use case interface

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

export type TicketShowResult =
  | {
      ok: true;
      ticket: Ticket;
      artifacts: string[];
      executions: TicketExecutionInfo[];
      /** Ids of the run records under the ticket's `runs/`, oldest first. */
      runs: string[];
      /** Child tasks, when the ticket is an epic. Empty otherwise. */
      children: Ticket[];
      /** Parent epic, when the ticket is a task. Null otherwise. */
      parent: Ticket | null;
      /** The ticket's spec pin: its own, or its parent epic's. */
      specPin: SpecPin | null;
      /** True when the feature has commits after the pinned one. */
      specMoved: boolean;
    }
  | { ok: false; reason: 'NOT_FOUND' };

export interface TicketShowPort {
  execute(input: TicketShowInput): TicketShowResult;
}
