// Adapter — SQLite implementation of TicketRepository port

import type BetterSqlite3 from 'better-sqlite3';
import type { Column } from '../../domain/model/column.js';
import type { Ticket } from '../../domain/model/ticket.js';
import type { SubStateOrNull } from '../../domain/model/sub-state.js';
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

  findByProject(projectId: string, columnFilter?: Column): Ticket[] {
    let sql =
      'SELECT id, project_id, title, "column", sub_state, created_at, updated_at FROM tickets WHERE project_id = ?';
    const params: string[] = [projectId];

    if (columnFilter) {
      sql += ' AND "column" = ?';
      params.push(columnFilter);
    }

    sql += " ORDER BY CAST(SUBSTR(id, INSTR(id, '-') + 1) AS INTEGER)";

    const rows = this.db.prepare(sql).all(...params) as Array<{
      id: string;
      project_id: string;
      title: string;
      column: Column;
      sub_state: string | null;
      created_at: string;
      updated_at: string;
    }>;

    // Map DB rows to domain Ticket objects
    const tickets: Ticket[] = rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      column: row.column,
      subState: (row.sub_state as SubStateOrNull) ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return tickets;
  }
}
