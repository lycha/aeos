// Driving port — TicketShow use case interface

import type { Ticket } from '../../model/ticket.js';

export interface TicketShowInput {
  projectId: string;
  ticketId: string;
  projectPath: string;
}

export type TicketShowResult =
  | { ok: true; ticket: Ticket; artifacts: string[] }
  | { ok: false; reason: 'NOT_FOUND' };

export interface TicketShowPort {
  execute(input: TicketShowInput): TicketShowResult;
}
