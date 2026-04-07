// Driving port — TicketCreate use case interface

export interface TicketCreateInput {
  title: string;
  projectId: string;
  projectKey: string;
  projectPath: string;
}

export interface TicketCreateResult {
  ticketId: string;
  title: string;
}

export interface TicketCreatePort {
  execute(input: TicketCreateInput): TicketCreateResult;
}
