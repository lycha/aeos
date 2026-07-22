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
  /**
   * Stable decomposition key (e.g. "T-001"). When present, idempotency keys on
   * (parent, taskKey) instead of the title, so a review-loop retry that
   * rephrases a task's title still matches the existing ticket. Ignored without
   * a parent.
   */
  taskKey?: string;
  /**
   * Markdown body for the ticket's Description — the task's full breakdown
   * (description, acceptance criteria, touches, out-of-scope) when a decomposed
   * task is created. Omitted for a hand-created ticket, which gets editable
   * placeholders instead.
   */
  body?: string;
}

export interface TicketCreateResult {
  ticketId: string;
  title: string;
  kind: TicketKind;
  parentId: string | null;
  taskKey: string | null;
  /** True when a matching child (by key, else title) already existed under the parent. */
  alreadyExisted: boolean;
}

export interface TicketCreatePort {
  execute(input: TicketCreateInput): TicketCreateResult;
}
