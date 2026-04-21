// Driving port — TicketSignOff use case interface (human manual sign-off)

import type { SubStateOrNull } from '../../model/sub-state.js';

export interface TicketSignOffInput {
  projectId: string;
  projectPath: string;
  ticketId: string;
}

export type TicketSignOffResult =
  | {
      status: 'signed_off';
      ticketId: string;
      previousSubState: SubStateOrNull;
    }
  | { status: 'error'; ticketId: string; error: string };

export interface TicketSignOffPort {
  execute(input: TicketSignOffInput): TicketSignOffResult;
}
