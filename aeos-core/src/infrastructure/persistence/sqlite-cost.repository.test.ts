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

  describe('findByFilters', () => {
    let repo: SqliteCostRepository;

    const ticket = (projectId: string, id: string, parentId: string | null = null): void => {
      db.prepare(
        `INSERT INTO tickets (id, project_id, title, "column", parent_id, created_at, updated_at)
         VALUES (?, ?, 'T', 'TECH_SPEC', ?, 'x', 'x')`,
      ).run(id, projectId, parentId);
    };
    const spend = (projectId: string, ticketId: string, recordedAt: string): void =>
      repo.record({ ...cost(0.1), projectId, ticketId, recordedAt });
    const found = (filters: Parameters<SqliteCostRepository['findByFilters']>[0]): string[] =>
      repo.findByFilters(filters).map((r) => `${r.projectId}/${r.ticketId}`);

    beforeEach(() => {
      initSchema(db);
      repo = new SqliteCostRepository(db);
      ticket('p', 'AEOS-1');
      ticket('p', 'AEOS-2', 'AEOS-1');
      ticket('p', 'AEOS-3', 'AEOS-1');
      ticket('p', 'AEOS-4');
      ticket('q', 'QQ-1');
      spend('p', 'AEOS-1', '2026-10-30T10:00:00.000Z');
      spend('p', 'AEOS-2', '2026-11-01T00:00:00.000Z');
      spend('p', 'AEOS-3', '2026-11-02T10:00:00.000Z');
      spend('p', 'AEOS-4', '2026-11-03T10:00:00.000Z');
      spend('q', 'QQ-1', '2026-11-04T10:00:00.000Z');
    });

    it('returns every record of every project without filters', () => {
      expect(found({})).toEqual(['p/AEOS-1', 'p/AEOS-2', 'p/AEOS-3', 'p/AEOS-4', 'q/QQ-1']);
    });

    it('filters by project and by ticket', () => {
      expect(found({ projectId: 'q' })).toEqual(['q/QQ-1']);
      expect(found({ ticketId: 'AEOS-4' })).toEqual(['p/AEOS-4']);
    });

    it('returns an epic with its child tasks and nothing else', () => {
      expect(found({ epicId: 'AEOS-1' })).toEqual(['p/AEOS-1', 'p/AEOS-2', 'p/AEOS-3']);
    });

    it('excludes records from before the since date', () => {
      expect(found({ since: '2026-11-01' })).toEqual([
        'p/AEOS-2',
        'p/AEOS-3',
        'p/AEOS-4',
        'q/QQ-1',
      ]);
    });

    it('combines filters', () => {
      expect(found({ epicId: 'AEOS-1', since: '2026-11-02' })).toEqual(['p/AEOS-3']);
    });
  });

  it('round-trips the role, and reads a row without one as having none', () => {
    initSchema(db);
    insertTicket(db);
    const repo = new SqliteCostRepository(db);

    repo.record({ ...cost(0.1), role: 'reviewer' });
    repo.record(cost(0.1));

    expect(repo.findByFilters({}).map((r) => r.role)).toEqual(['reviewer', undefined]);
  });
});
