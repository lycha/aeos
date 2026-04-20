// Driving port — TicketShow use case interface

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
}

export type TicketShowResult =
  | { ok: true; ticket: Ticket; artifacts: string[]; executions: TicketExecutionInfo[] }
  | { ok: false; reason: 'NOT_FOUND' };

export interface TicketShowPort {
  execute(input: TicketShowInput): TicketShowResult;
}
