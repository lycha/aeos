// Driving port — TicketCreate use case interface

import type { TicketKind } from '../../model/ticket-kind.js';

export interface TicketCreateInput {
  title: string;
  projectId: string;
  projectKey: string;
  projectPath: string;
  /**
   * Parent epic ID. Supplying one creates a TASK; omitting it creates an EPIC.
   * A task inherits its specification from the parent's tech spec and task
   * breakdown, so it skips scoping and goes straight to the build pipeline.
   */
  parentId?: string;
}

export interface TicketCreateResult {
  ticketId: string;
  title: string;
  kind: TicketKind;
  parentId: string | null;
}

export interface TicketCreatePort {
  execute(input: TicketCreateInput): TicketCreateResult;
}
