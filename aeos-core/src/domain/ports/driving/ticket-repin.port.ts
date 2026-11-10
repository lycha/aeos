// Driving port — TicketRepin use case interface (move a spec pin after an amendment)

export interface TicketRepinInput {
  projectId: string;
  projectPath: string;
  ticketId: string;
}

export type TicketRepinResult =
  | {
      ok: true;
      ticketId: string;
      /** The epic that carries the pin: the ticket itself, or its parent. */
      epicId: string;
      fromCommit: string;
      toCommit: string;
      gateRecordId: string;
    }
  | { ok: false; error: string };

export interface TicketRepinPort {
  execute(input: TicketRepinInput): TicketRepinResult;
}
