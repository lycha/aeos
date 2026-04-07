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
}
