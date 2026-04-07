// Driven port — TicketRepository: CRUD for tickets (backed by SQLite)

import type { Column } from '../../model/column.js';
import type { Ticket } from '../../model/ticket.js';

export interface TicketRepository {
  /** Returns the next auto-incrementing ticket number for the given project */
  nextId(projectId: string): number;
  /** Persists a ticket row */
  save(ticket: Ticket): void;
  /** Deletes a ticket by project and ticket ID (used for compensating rollback) */
  deleteById(projectId: string, ticketId: string): void;
  /** Returns all tickets for a project, optionally filtered by column, sorted by numeric ticket number */
  findByProject(projectId: string, columnFilter?: Column): Ticket[];
}
