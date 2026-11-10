// Adapter — SQLite implementation of PipelineStateRepository port

import type BetterSqlite3 from 'better-sqlite3';
import type { Column } from '../../domain/model/column.js';
import type { TicketKind } from '../../domain/model/ticket-kind.js';
import type { PipelineStateRepository } from '../../domain/ports/driven/pipeline-state-repository.port.js';

export class SqlitePipelineStateRepository implements PipelineStateRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  find(projectId: string, kind: TicketKind): readonly Column[] | null {
    const row = this.db
      .prepare('SELECT columns_json FROM pipeline_state WHERE project_id = ? AND kind = ?')
      .get(projectId, kind) as { columns_json: string } | undefined;
    return row ? (JSON.parse(row.columns_json) as Column[]) : null;
  }

  save(projectId: string, kind: TicketKind, columns: readonly Column[], acceptedAt: string): void {
    this.db
      .prepare(
        `INSERT INTO pipeline_state (project_id, kind, columns_json, accepted_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (project_id, kind)
         DO UPDATE SET columns_json = excluded.columns_json, accepted_at = excluded.accepted_at`,
      )
      .run(projectId, kind, JSON.stringify(columns), acceptedAt);
  }
}
