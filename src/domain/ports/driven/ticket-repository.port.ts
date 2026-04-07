// Driven port — TicketRepository: CRUD for tickets (backed by SQLite)

import type { Column } from '../../model/column.js';
import type { SubStateOrNull } from '../../model/sub-state.js';
import type { Ticket } from '../../model/ticket.js';

export interface TicketRepository {
  /** Returns the next auto-incrementing ticket number for the given project */
  nextId(projectId: string): number;
  /** Persists a ticket row */
  save(ticket: Ticket): void;
  /** Deletes a ticket by project and ticket ID (used for compensating rollback) */
  deleteById(projectId: string, ticketId: string): void;
  /** Returns a single ticket by project and ticket ID (case-insensitive), or null if not found */
  findById(projectId: string, ticketId: string): Ticket | null;
  /** Returns all tickets for a project, optionally filtered by column, sorted by numeric ticket number */
  findByProject(projectId: string, columnFilter?: Column): Ticket[];
  /** Updates a ticket's column and updated_at timestamp */
  updateColumn(projectId: string, ticketId: string, column: Column): void;
  /** Updates a ticket's sub-state and updated_at timestamp */
  updateSubState(projectId: string, ticketId: string, subState: SubStateOrNull): void;
}
