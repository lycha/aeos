// Driving port — TicketMove use case interface (human override to any workflow column)

import type { Column } from '../../model/column.js';

export interface TicketMoveInput {
  projectId: string;
  projectPath: string;
  ticketId: string;
  targetColumn: Column;
  /** Why the normal path is being bypassed. Recorded as a gate; at least ten characters. */
  reason: string;
}

export type TicketMoveResult =
  | {
      status: 'moved';
      ticketId: string;
      fromColumn: Column;
      toColumn: Column;
      gateRecordId: string;
    }
  | { status: 'error'; ticketId: string; error: string };

export interface TicketMovePort {
  execute(input: TicketMoveInput): TicketMoveResult;
}
