// Driving port — TicketDodApprove use case interface (final human gate → DONE)

export type TicketDodApproveResult =
  | { status: 'approved'; ticketId: string; totalCostUsd: number }
  | { status: 'cancelled'; ticketId: string }
  | { status: 'error'; ticketId: string; error: string };

export interface TicketDodApprovePort {
  execute(
    projectId: string,
    projectPath: string,
    ticketId: string,
    approved: boolean,
  ): TicketDodApproveResult;
}
