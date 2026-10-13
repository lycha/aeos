// Driving port — TicketApprove use case interface (advance column)

import type { Column } from '../../model/column.js';

export type TicketApproveResult =
  | { status: 'advanced'; ticketId: string; fromColumn: Column; toColumn: Column }
  | { status: 'already_done'; ticketId: string }
  | { status: 'error'; ticketId: string; error: string };

export interface TicketApprovePort {
  execute(projectId: string, projectPath: string, ticketId: string): TicketApproveResult;
}
