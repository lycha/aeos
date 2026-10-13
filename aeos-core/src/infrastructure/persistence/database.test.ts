import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { getDb, resetDb, initSchema, _testing } from './database.js';

let tmpDir: string;
let originalAeosHome: string | undefined;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-db-test-'));
  originalAeosHome = process.env.AEOS_HOME;
  process.env.AEOS_HOME = tmpDir;
});

afterEach(() => {
  resetDb();
  if (originalAeosHome === undefined) {
    delete process.env.AEOS_HOME;
  } else {
    process.env.AEOS_HOME = originalAeosHome;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('database', () => {
  describe('getDb', () => {
    it('should create state.db when ~/.aeos/ exists', () => {
      const db = getDb();
      expect(db).toBeDefined();
      const dbPath = path.join(tmpDir, 'state.db');
      expect(fs.existsSync(dbPath)).toBe(true);
    });

    it('should return the same instance on subsequent calls (singleton)', () => {
      const db1 = getDb();
      const db2 = getDb();
      expect(db1).toBe(db2);
    });

    it('should return a fresh instance after resetDb()', () => {
      const db1 = getDb();
      resetDb();
      const db2 = getDb();
      expect(db1).not.toBe(db2);
    });
  });

  describe('initSchema', () => {
    it('should create tickets, transitions, cost_records, and schema_version tables', () => {
      const db = getDb();
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];
      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain('tickets');
      expect(tableNames).toContain('transitions');
      expect(tableNames).toContain('cost_records');
      expect(tableNames).toContain('schema_version');
    });

    it('should enable WAL journal mode', () => {
      const db = getDb();
      const result = db.pragma('journal_mode') as { journal_mode: string }[];
      expect(result[0].journal_mode).toBe('wal');
    });

    it('should be idempotent — calling initSchema twice does not throw', () => {
      const db = getDb();
      expect(() => initSchema(db)).not.toThrow();
    });
  });

  describe('tickets table', () => {
    it('should accept a row with sub_state = NULL', () => {
      const db = getDb();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO tickets (id, project_id, title, "column", sub_state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run('AEOS-1', 'startup-a', 'Test ticket', 'BACKLOG', null, now, now);

      const row = db
        .prepare('SELECT * FROM tickets WHERE id = ? AND project_id = ?')
        .get('AEOS-1', 'startup-a') as Record<string, unknown>;

      expect(row.id).toBe('AEOS-1');
      expect(row.project_id).toBe('startup-a');
      expect(row.title).toBe('Test ticket');
      expect(row.column).toBe('BACKLOG');
      expect(row.sub_state).toBeNull();
    });

    it('should enforce composite primary key (project_id, id)', () => {
      const db = getDb();
      const now = new Date().toISOString();
      const stmt = db.prepare(
        `INSERT INTO tickets (id, project_id, title, "column", created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      stmt.run('T-1', 'proj-a', 'Ticket A', 'BACKLOG', now, now);
      // Same id, different project — should succeed
      stmt.run('T-1', 'proj-b', 'Ticket B', 'BACKLOG', now, now);
      // Same id, same project — should fail
      expect(() => stmt.run('T-1', 'proj-a', 'Duplicate', 'BACKLOG', now, now)).toThrow();
    });
  });

  describe('transitions table', () => {
    it('should insert and query a transition record', () => {
      const db = getDb();
      const now = new Date().toISOString();
      // Insert parent ticket first
      db.prepare(
        `INSERT INTO tickets (id, project_id, title, "column", created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('T-1', 'proj-a', 'Ticket', 'BACKLOG', now, now);

      db.prepare(
        `INSERT INTO transitions (ticket_id, project_id, from_column, to_column, from_sub_state, to_sub_state, comment, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('T-1', 'proj-a', null, 'BACKLOG', null, null, 'Initial creation', now);

      const row = db
        .prepare('SELECT * FROM transitions WHERE ticket_id = ? AND project_id = ?')
        .get('T-1', 'proj-a') as Record<string, unknown>;

      expect(row.ticket_id).toBe('T-1');
      expect(row.to_column).toBe('BACKLOG');
      expect(row.comment).toBe('Initial creation');
      expect(row.id).toBeGreaterThan(0);
    });
  });

  describe('migrations', () => {
    it('should track schema version after migrations run', () => {
      const db = getDb();
      const version = _testing.getCurrentVersion(db);
      expect(version).toBe(_testing.MIGRATIONS.length);
    });

    it('should record each migration with description and timestamp', () => {
      const db = getDb();
      const rows = db
        .prepare('SELECT version, description, applied_at FROM schema_version ORDER BY version')
        .all() as { version: number; description: string; applied_at: string }[];
      expect(rows.length).toBe(_testing.MIGRATIONS.length);
      expect(rows[0].version).toBe(1);
      expect(rows[0].description).toBe('Initial schema: tickets, transitions, cost_records');
      expect(rows[0].applied_at).toBeTruthy();
    });

    it('should detect legacy databases without schema_version table', () => {
      const db = getDb();
      // After initSchema, schema_version exists so detectLegacyDb should be false
      expect(_testing.detectLegacyDb(db)).toBe(false);
    });

    it('should handle legacy database upgrade — stamp at version 1', () => {
      // Simulate a legacy DB: create tables without schema_version
      const db = getDb();
      db.exec('DROP TABLE IF EXISTS schema_version');
      // Now detectLegacyDb should return true (tickets exists, schema_version does not)
      expect(_testing.detectLegacyDb(db)).toBe(true);
      // Re-run initSchema — should stamp version 1 without re-creating tables
      resetDb();
      process.env.AEOS_HOME = tmpDir;
      const db2 = getDb();
      const version = _testing.getCurrentVersion(db2);
      expect(version).toBeGreaterThanOrEqual(1);
    });
  });

  describe('cost_records table', () => {
    it('should insert and query a cost record with agent and executor', () => {
      const db = getDb();
      const now = new Date().toISOString();
      // Insert parent ticket first
      db.prepare(
        `INSERT INTO tickets (id, project_id, title, "column", created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('T-1', 'proj-a', 'Ticket', 'BACKLOG', now, now);

      db.prepare(
        `INSERT INTO cost_records (ticket_id, project_id, "column", agent, executor, model, input_tokens, output_tokens, cost_usd, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        'T-1',
        'proj-a',
        'PLANNING',
        'pm-agent',
        'claude-code-cli',
        'claude-opus-4-6',
        1000,
        500,
        0.05,
        now,
      );

      const row = db
        .prepare('SELECT * FROM cost_records WHERE ticket_id = ? AND project_id = ?')
        .get('T-1', 'proj-a') as Record<string, unknown>;

      expect(row.agent).toBe('pm-agent');
      expect(row.executor).toBe('claude-code-cli');
      expect(row.model).toBe('claude-opus-4-6');
      expect(row.input_tokens).toBe(1000);
      expect(row.output_tokens).toBe(500);
      expect(row.cost_usd).toBeCloseTo(0.05);
    });
  });
});
