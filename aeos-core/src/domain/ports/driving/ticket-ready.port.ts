// Driving port — TicketReady use case interface (human reset to READY)

import type { SubStateOrNull } from '../../model/sub-state.js';

export interface TicketReadyInput {
  projectId: string;
  projectPath: string;
  ticketId: string;
}

export type TicketReadyResult =
  | { status: 'readied'; ticketId: string; previousSubState: SubStateOrNull }
  | { status: 'error'; ticketId: string; error: string };

export interface TicketReadyPort {
  execute(input: TicketReadyInput): TicketReadyResult;
}
