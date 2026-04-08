// Adapter — SQLite implementation of CostRepository port

import type BetterSqlite3 from 'better-sqlite3';
import type { CostRepository } from '../../domain/ports/driven/cost-repository.port.js';
import type { CostRecord } from '../../domain/model/cost-record.js';

export class SqliteCostRepository implements CostRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  record(cost: CostRecord): void {
    this.db
      .prepare(
        `INSERT INTO cost_records (ticket_id, project_id, "column", model, input_tokens, output_tokens, cost_usd, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        cost.ticketId,
        cost.projectId,
        cost.column,
        cost.model,
        cost.inputTokens,
        cost.outputTokens,
        cost.costUsd,
        cost.recordedAt,
      );
  }

  findByProject(projectId: string): CostRecord[] {
    return this.mapRows(
      this.db
        .prepare(
          `SELECT ticket_id, project_id, "column", model, input_tokens, output_tokens, cost_usd, recorded_at
           FROM cost_records WHERE project_id = ? ORDER BY recorded_at ASC`,
        )
        .all(projectId),
    );
  }

  findByTicket(projectId: string, ticketId: string): CostRecord[] {
    return this.mapRows(
      this.db
        .prepare(
          `SELECT ticket_id, project_id, "column", model, input_tokens, output_tokens, cost_usd, recorded_at
           FROM cost_records WHERE project_id = ? AND ticket_id = ? ORDER BY recorded_at ASC`,
        )
        .all(projectId, ticketId),
    );
  }

  private mapRows(rows: unknown[]): CostRecord[] {
    return (rows as Array<Record<string, unknown>>).map((r) => ({
      ticketId: r.ticket_id as string,
      projectId: r.project_id as string,
      column: r.column as string,
      model: r.model as string,
      inputTokens: r.input_tokens as number,
      outputTokens: r.output_tokens as number,
      costUsd: r.cost_usd as number,
      recordedAt: r.recorded_at as string,
    }));
  }
}
