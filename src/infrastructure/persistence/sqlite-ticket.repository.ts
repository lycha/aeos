// Adapter — SQLite implementation of TicketRepository port

import type BetterSqlite3 from 'better-sqlite3';
import type { Column } from '../../domain/model/column.js';
import type { Ticket } from '../../domain/model/ticket.js';
import type { SubStateOrNull } from '../../domain/model/sub-state.js';
import type { TicketRepository } from '../../domain/ports/driven/ticket-repository.port.js';

interface TicketRow {
  id: string;
  project_id: string;
  title: string;
  column: Column;
  sub_state: string | null;
  created_at: string;
  updated_at: string;
}

export class SqliteTicketRepository implements TicketRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  private mapRowToTicket(row: TicketRow): Ticket {
    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      column: row.column,
      subState: (row.sub_state as SubStateOrNull) ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

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

  findById(projectId: string, ticketId: string): Ticket | null {
    const row = this.db
      .prepare(
        `SELECT id, project_id, title, "column", sub_state, created_at, updated_at
         FROM tickets WHERE project_id = ? AND UPPER(id) = UPPER(?)`,
      )
      .get(projectId, ticketId) as TicketRow | undefined;

    if (!row) return null;

    return this.mapRowToTicket(row);
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

    const rows = this.db.prepare(sql).all(...params) as TicketRow[];

    return rows.map((row) => this.mapRowToTicket(row));
  }

  updateColumn(projectId: string, ticketId: string, column: Column): void {
    this.db
      .prepare(`UPDATE tickets SET "column" = ?, updated_at = ? WHERE project_id = ? AND id = ?`)
      .run(column, new Date().toISOString(), projectId, ticketId);
  }

  updateSubState(projectId: string, ticketId: string, subState: SubStateOrNull): void {
    this.db
      .prepare(`UPDATE tickets SET sub_state = ?, updated_at = ? WHERE project_id = ? AND id = ?`)
      .run(subState, new Date().toISOString(), projectId, ticketId);
  }
}
