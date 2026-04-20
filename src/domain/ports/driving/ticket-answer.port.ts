// Driving port — TicketAnswer use case interface (unblock after preflight questions)

export interface TicketAnswerInput {
  projectId: string;
  projectPath: string;
  ticketId: string;
  confirmed?: boolean;
}

export type TicketAnswerResult =
  | { ok: true; ticketId: string; warnings?: string[] }
  | { ok: false; needsConfirmation: true; reason: string }
  | { ok: false; needsConfirmation?: false; error: string };

export interface TicketAnswerPort {
  execute(input: TicketAnswerInput): TicketAnswerResult;
}
