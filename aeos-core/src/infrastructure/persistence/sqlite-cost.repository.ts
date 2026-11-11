// Adapter — SQLite implementation of CostRepository port

import type BetterSqlite3 from 'better-sqlite3';
import type {
  CostFilters,
  CostRepository,
} from '../../domain/ports/driven/cost-repository.port.js';
import type { CostRecord, CostRole } from '../../domain/model/cost-record.js';

const COLUMNS = `c.ticket_id, c.project_id, c."column", c.agent, c.executor, c.model, c.input_tokens, c.output_tokens, c.cost_usd, c.cost_known, c.recorded_at, c.role`;

export class SqliteCostRepository implements CostRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  record(cost: CostRecord): void {
    this.db
      .prepare(
        `INSERT INTO cost_records (ticket_id, project_id, "column", agent, executor, model, input_tokens, output_tokens, cost_usd, cost_known, recorded_at, role)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        cost.ticketId,
        cost.projectId,
        cost.column,
        cost.agent,
        cost.executor,
        cost.model,
        cost.inputTokens,
        cost.outputTokens,
        cost.costUsd ?? 0,
        cost.costUsd === null ? 0 : 1,
        cost.recordedAt,
        cost.role ?? null,
      );
  }

  findByProject(projectId: string): CostRecord[] {
    return this.mapRows(
      this.db
        .prepare(
          `SELECT ${COLUMNS} FROM cost_records c WHERE c.project_id = ? ORDER BY c.recorded_at ASC`,
        )
        .all(projectId),
    );
  }

  findByTicket(projectId: string, ticketId: string): CostRecord[] {
    return this.mapRows(
      this.db
        .prepare(
          `SELECT ${COLUMNS} FROM cost_records c
           WHERE c.project_id = ? AND c.ticket_id = ? ORDER BY c.recorded_at ASC`,
        )
        .all(projectId, ticketId),
    );
  }

  findByFilters(filters: CostFilters): CostRecord[] {
    const where: string[] = [];
    const params: string[] = [];
    if (filters.projectId) {
      where.push('c.project_id = ?');
      params.push(filters.projectId);
    }
    if (filters.ticketId) {
      where.push('c.ticket_id = ?');
      params.push(filters.ticketId);
    }
    if (filters.epicId) {
      where.push(
        `(c.ticket_id = ? OR c.ticket_id IN
           (SELECT t.id FROM tickets t WHERE t.project_id = c.project_id AND t.parent_id = ?))`,
      );
      params.push(filters.epicId, filters.epicId);
    }
    if (filters.since) {
      // recorded_at is an ISO timestamp, so a YYYY-MM-DD prefix compares correctly.
      where.push('c.recorded_at >= ?');
      params.push(filters.since);
    }
    return this.mapRows(
      this.db
        .prepare(
          `SELECT ${COLUMNS} FROM cost_records c
           ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
           ORDER BY c.project_id ASC, c.recorded_at ASC, c.id ASC`,
        )
        .all(...params),
    );
  }

  private mapRows(rows: unknown[]): CostRecord[] {
    return (rows as Array<Record<string, unknown>>).map((r) => ({
      ticketId: r.ticket_id as string,
      projectId: r.project_id as string,
      column: r.column as string,
      agent: r.agent as string,
      executor: r.executor as string,
      model: r.model as string,
      inputTokens: r.input_tokens as number,
      outputTokens: r.output_tokens as number,
      costUsd: r.cost_known ? (r.cost_usd as number) : null,
      recordedAt: r.recorded_at as string,
      ...(r.role ? { role: r.role as CostRole } : {}),
    }));
  }
}
