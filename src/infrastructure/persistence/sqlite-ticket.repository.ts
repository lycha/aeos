// Adapter — SQLite implementation of TicketRepository port

import type BetterSqlite3 from 'better-sqlite3';
import type { Ticket } from '../../domain/model/ticket.js';
import type { TicketRepository } from '../../domain/ports/driven/ticket-repository.port.js';

export class SqliteTicketRepository implements TicketRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  nextId(projectId: string): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(MAX(CAST(SUBSTR(id, INSTR(id, '-') + 1) AS INTEGER)), 0) + 1 AS next_num
         FROM tickets WHERE project_id = ?`,
      )
      .get(projectId) as { next_num: number } | undefined;
    return row?.next_num ?? 1;
  }

  save(ticket: Ticket): void {
    this.db
      .prepare(
        `INSERT INTO tickets (id, project_id, title, "column", sub_state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        ticket.id,
        ticket.projectId,
        ticket.title,
        ticket.column,
        ticket.subState,
        ticket.createdAt,
        ticket.updatedAt,
      );
  }

  deleteById(projectId: string, ticketId: string): void {
    this.db.prepare('DELETE FROM tickets WHERE project_id = ? AND id = ?').run(projectId, ticketId);
  }
}
