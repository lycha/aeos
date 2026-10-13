// Driving port — TicketResolve use case interface
//
// Resolves an ESCALATED ticket from the operator's response in
// `<ticketId>-escalation.md`: injects the response as context and returns the
// ticket to READY so the next run resumes with the human's guidance.

export interface TicketResolveInput {
  projectId: string;
  projectPath: string;
  ticketId: string;
  /** Skip the "escalation file not modified since it was written" guard. */
  confirmed?: boolean;
}

export type TicketResolveResult =
  | { ok: true; ticketId: string }
  | { ok: false; needsConfirmation: true; reason: string }
  | { ok: false; error: string };

export interface TicketResolvePort {
  execute(input: TicketResolveInput): TicketResolveResult;
}
