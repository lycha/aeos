// Driving port — TicketRun use case interface (orchestration: preflight → executor → validate → review → sign-off)

export type TicketRunResult =
  | { status: 'success'; ticketId: string; artifactPath: string; reviewPath: string }
  | { status: 'failed'; ticketId: string; error: string }
  | { status: 'blocked'; ticketId: string; blockers: string[] };

export interface TicketRunPort {
  execute(projectId: string, projectPath: string, ticketId: string): Promise<TicketRunResult>;
}
