// Adapter — SQLite implementation of OrchestratorStateRepository port

import type BetterSqlite3 from 'better-sqlite3';
import type {
  OrchestratorState,
  OrchestratorStatus,
} from '../../domain/model/orchestrator-state.js';
import type { HaltReason } from '../../domain/services/orchestrator-policy.js';
import type { OrchestratorStateRepository } from '../../domain/ports/driven/orchestrator-state-repository.port.js';

interface StateRow {
  project_id: string;
  epic_id: string;
  status: OrchestratorStatus;
  halt_reason: string | null;
  message: string | null;
  budget_usd: number | null;
  updated_at: string;
}

const COLUMNS = 'project_id, epic_id, status, halt_reason, message, budget_usd, updated_at';

export class SqliteOrchestratorStateRepository implements OrchestratorStateRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  private map(row: StateRow): OrchestratorState {
    return {
      projectId: row.project_id,
      epicId: row.epic_id,
      status: row.status,
      haltReason: (row.halt_reason as HaltReason | null) ?? null,
      message: row.message ?? null,
      budgetUsd: row.budget_usd ?? null,
      updatedAt: row.updated_at,
    };
  }

  find(projectId: string, epicId: string): OrchestratorState | null {
    const row = this.db
      .prepare(
        `SELECT ${COLUMNS} FROM orchestrator_state
         WHERE project_id = ? AND UPPER(epic_id) = UPPER(?)`,
      )
      .get(projectId, epicId) as StateRow | undefined;
    return row ? this.map(row) : null;
  }

  upsert(state: OrchestratorState): void {
    this.db
      .prepare(
        `INSERT INTO orchestrator_state (${COLUMNS})
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(project_id, epic_id) DO UPDATE SET
           status = excluded.status,
           halt_reason = excluded.halt_reason,
           message = excluded.message,
           budget_usd = excluded.budget_usd,
           updated_at = excluded.updated_at`,
      )
      .run(
        state.projectId,
        state.epicId,
        state.status,
        state.haltReason,
        state.message,
        state.budgetUsd,
        state.updatedAt,
      );
  }

  touch(projectId: string, epicId: string, at: string): void {
    this.db
      .prepare(
        `UPDATE orchestrator_state SET updated_at = ?
         WHERE project_id = ? AND UPPER(epic_id) = UPPER(?)`,
      )
      .run(at, projectId, epicId);
  }

  findByProject(projectId: string): OrchestratorState[] {
    const rows = this.db
      .prepare(
        `SELECT ${COLUMNS} FROM orchestrator_state
         WHERE project_id = ?
         ORDER BY CAST(SUBSTR(epic_id, INSTR(epic_id, '-') + 1) AS INTEGER)`,
      )
      .all(projectId) as StateRow[];
    return rows.map((row) => this.map(row));
  }
}
