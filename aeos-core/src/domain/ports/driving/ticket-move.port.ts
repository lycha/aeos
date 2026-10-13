// Driving port — TicketMove use case interface (human override to any workflow column)

import type { Column } from '../../model/column.js';

export interface TicketMoveInput {
  projectId: string;
  projectPath: string;
  ticketId: string;
  targetColumn: Column;
}

export type TicketMoveResult =
  | { status: 'moved'; ticketId: string; fromColumn: Column; toColumn: Column }
  | { status: 'error'; ticketId: string; error: string };

export interface TicketMovePort {
  execute(input: TicketMoveInput): TicketMoveResult;
}
