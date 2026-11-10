// Application service — the spec pin of a ticket.

import type { SpecPin } from '../../domain/model/spec-pin.js';
import type { Ticket } from '../../domain/model/ticket.js';
import type { TicketRepository } from '../../domain/ports/driven/ticket-repository.port.js';

/** A ticket's own pin, or its parent epic's: a task's pin is never copied. */
export function resolveSpecPin(ticketRepo: TicketRepository, ticket: Ticket): SpecPin | null {
  if (ticket.specPin) return ticket.specPin;
  if (!ticket.parentId) return null;
  return ticketRepo.findById(ticket.projectId, ticket.parentId)?.specPin ?? null;
}

/** `<repo>@<commit>`, as written in the `Spec:` commit trailer. */
export function formatSpecPin(pin: SpecPin): string {
  return `${pin.repo}@${pin.commit}`;
}
