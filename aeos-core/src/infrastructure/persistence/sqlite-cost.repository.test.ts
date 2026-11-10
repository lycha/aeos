import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import type BetterSqlite3 from 'better-sqlite3';

import { initSchema, resetDb, _testing } from './database.js';
import { SqliteCostRepository } from './sqlite-cost.repository.js';
import type { CostRecord } from '../../domain/model/cost-record.js';

function cost(costUsd: number | null): CostRecord {
  return {
    ticketId: 'AEOS-1',
    projectId: 'p',
    column: 'TECH_SPEC',
    agent: 'architect-agent',
    executor: 'claude-cli',
    model: 'm',
    inputTokens: 10,
    outputTokens: 20,
    costUsd,
    recordedAt: '2026-11-10T00:00:00.000Z',
  };
}

function insertTicket(db: BetterSqlite3.Database): void {
  db.prepare(
    `INSERT INTO tickets (id, project_id, title, "column", created_at, updated_at)
     VALUES ('AEOS-1', 'p', 'Epic', 'TECH_SPEC', 'x', 'x')`,
  ).run();
}

describe('SqliteCostRepository', () => {
  let db: BetterSqlite3.Database;

  beforeEach(() => {
    resetDb();
    db = new Database(':memory:');
  });

  it('reads an unknown cost back as null and a known cost as its number', () => {
    initSchema(db);
    insertTicket(db);
    const repo = new SqliteCostRepository(db);

    repo.record(cost(null));
    repo.record(cost(0));
    repo.record(cost(0.25));

    expect(repo.findByTicket('p', 'AEOS-1').map((r) => r.costUsd)).toEqual([null, 0, 0.25]);
    expect(repo.findByProject('p').map((r) => r.costUsd)).toEqual([null, 0, 0.25]);
  });

  it('reads rows written before the cost_known migration as unknown', () => {
    // Build a database at version 5, as main had it.
    db.exec(
      'CREATE TABLE schema_version (version INTEGER NOT NULL, description TEXT NOT NULL, applied_at TEXT NOT NULL)',
    );
    for (const migration of _testing.MIGRATIONS.filter((m) => m.version <= 5)) {
      migration.apply(db);
      db.prepare('INSERT INTO schema_version VALUES (?, ?, ?)').run(
        migration.version,
        migration.description,
        'x',
      );
    }
    insertTicket(db);
    db.prepare(
      `INSERT INTO cost_records (ticket_id, project_id, "column", agent, executor, model, cost_usd, recorded_at)
       VALUES ('AEOS-1', 'p', 'TECH_SPEC', 'a', 'claude-cli', 'm', 0.0, 'x')`,
    ).run();

    initSchema(db);

    expect(_testing.getCurrentVersion(db)).toBe(_testing.MIGRATIONS.length);
    const records = new SqliteCostRepository(db).findByTicket('p', 'AEOS-1');
    expect(records).toHaveLength(1);
    expect(records[0].costUsd).toBeNull();
  });
});
