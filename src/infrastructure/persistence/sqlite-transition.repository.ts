// Adapter — SQLite implementation of TransitionRepository port

import type BetterSqlite3 from 'better-sqlite3';
import type {
  TransitionRecord,
  TransitionRepository,
} from '../../domain/ports/driven/transition-repository.port.js';

export class SqliteTransitionRepository implements TransitionRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  record(transition: TransitionRecord): void {
    this.db
      .prepare(
        `INSERT INTO transitions (ticket_id, project_id, from_column, to_column, from_sub_state, to_sub_state, comment, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        transition.ticketId,
        transition.projectId,
        transition.fromColumn,
        transition.toColumn,
        transition.fromSubState,
        transition.toSubState,
        transition.comment,
        transition.at,
      );
  }

  findByTicket(projectId: string, ticketId: string): TransitionRecord[] {
    const rows = this.db
      .prepare(
        `SELECT ticket_id, project_id, from_column, to_column, from_sub_state, to_sub_state, comment, at
         FROM transitions WHERE project_id = ? AND ticket_id = ? ORDER BY at ASC`,
      )
      .all(projectId, ticketId) as Array<{
      ticket_id: string;
      project_id: string;
      from_column: string;
      to_column: string;
      from_sub_state: string | null;
      to_sub_state: string | null;
      comment: string | null;
      at: string;
    }>;

    return rows.map((r) => ({
      ticketId: r.ticket_id,
      projectId: r.project_id,
      fromColumn: r.from_column as TransitionRecord['fromColumn'],
      toColumn: r.to_column as TransitionRecord['toColumn'],
      fromSubState: r.from_sub_state as TransitionRecord['fromSubState'],
      toSubState: r.to_sub_state as TransitionRecord['toSubState'],
      comment: r.comment,
      at: r.at,
    }));
  }
}
