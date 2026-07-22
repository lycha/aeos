// Infrastructure — SQLite connection and migration helper
//
// Design decision: single global DB at ~/.aeos/state.db.
// All projects share this database, isolated by project_id composite keys.
// This simplifies cross-project queries (dashboard, costs) and avoids
// per-project DB lifecycle management. See ADR in code-review/REVIEW-20260407-M1-milestone.md.
//
// Migration strategy:
// - schema_version table tracks the current version number
// - MIGRATIONS array contains ordered, idempotent migration functions
// - On startup, initSchema() runs all migrations above the current version
// - Migrations run inside a transaction for atomicity

import Database from 'better-sqlite3';
import type BetterSqlite3 from 'better-sqlite3';
import { aeosDbPath } from '../../shared/config.js';

let instance: BetterSqlite3.Database | null = null;
let schemaApplied = false;

// ── Migration definitions ─────────────────────────────────────────
// Each migration has a version number and an apply function.
// Migrations MUST be idempotent and ordered by version.
// Never modify an existing migration — always append a new one.

interface Migration {
  readonly version: number;
  readonly description: string;
  readonly apply: (db: BetterSqlite3.Database) => void;
}

/** Migrations must be idempotent; ALTER TABLE ADD COLUMN is not, so guard with this. */
function hasColumn(db: BetterSqlite3.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    description: 'Initial schema: tickets, transitions, cost_records',
    apply: (db) => {
      db.exec(`
CREATE TABLE IF NOT EXISTS tickets (
  id          TEXT NOT NULL,
  project_id  TEXT NOT NULL,
  title       TEXT NOT NULL,
  "column"    TEXT NOT NULL DEFAULT 'BACKLOG',
  sub_state   TEXT DEFAULT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (project_id, id)
);

CREATE TABLE IF NOT EXISTS transitions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id      TEXT NOT NULL,
  project_id     TEXT NOT NULL,
  from_column    TEXT,
  to_column      TEXT NOT NULL,
  from_sub_state TEXT,
  to_sub_state   TEXT,
  comment        TEXT,
  at             TEXT NOT NULL,
  FOREIGN KEY (project_id, ticket_id) REFERENCES tickets(project_id, id)
);

CREATE TABLE IF NOT EXISTS cost_records (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id     TEXT NOT NULL,
  project_id    TEXT NOT NULL,
  "column"      TEXT NOT NULL,
  agent         TEXT NOT NULL,
  executor      TEXT NOT NULL DEFAULT 'claude-code-cli',
  model         TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd      REAL NOT NULL DEFAULT 0.0,
  recorded_at   TEXT NOT NULL,
  FOREIGN KEY (project_id, ticket_id) REFERENCES tickets(project_id, id)
);
      `);
    },
  },
  {
    version: 2,
    description: 'Add epic/task hierarchy; retire ARCH_SPIKE column',
    apply: (db) => {
      // ALTER TABLE ADD COLUMN throws if the column already exists, so guard it —
      // a legacy DB stamped at version 1 can re-enter this migration with the
      // columns already present.
      // Every pre-existing ticket is an epic: tasks did not exist before this.
      if (!hasColumn(db, 'tickets', 'kind')) {
        db.exec(`ALTER TABLE tickets ADD COLUMN kind TEXT NOT NULL DEFAULT 'EPIC'`);
      }
      if (!hasColumn(db, 'tickets', 'parent_id')) {
        db.exec(`ALTER TABLE tickets ADD COLUMN parent_id TEXT DEFAULT NULL`);
      }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_tickets_parent ON tickets(project_id, parent_id)`);

      // ARCH_SPIKE folded into TECH_SPEC — the architect now produces the spec
      // and the implementation plan in one column. Tickets parked there move
      // forward rather than becoming unroutable.
      db.exec(`UPDATE tickets SET "column" = 'TECH_SPEC' WHERE "column" = 'ARCH_SPIKE'`);

      // The transitions table is an append-only audit log; historical rows
      // naming ARCH_SPIKE are left intact on purpose.
    },
  },
  {
    version: 3,
    description: 'Add orchestrator_state for autonomous epic runs',
    apply: (db) => {
      db.exec(`
CREATE TABLE IF NOT EXISTS orchestrator_state (
  project_id  TEXT NOT NULL,
  epic_id     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'IDLE',
  halt_reason TEXT,
  message     TEXT,
  budget_usd  REAL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (project_id, epic_id)
);
      `);
    },
  },
  {
    version: 4,
    description: 'Add task_key for stable decomposition idempotency',
    apply: (db) => {
      if (!hasColumn(db, 'tickets', 'task_key')) {
        db.exec(`ALTER TABLE tickets ADD COLUMN task_key TEXT DEFAULT NULL`);
      }
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_tickets_task_key
         ON tickets(project_id, parent_id, task_key)`,
      );
    },
  },
  {
    version: 5,
    description: 'Persist escalation reason/message/artifact on tickets',
    apply: (db) => {
      // Why the reason lives on the ticket rather than only in the run event:
      // the run emits the escalation once, live, then ends. An operator asking
      // "why did this stall?" days later needs it queryable. These columns are
      // cleared when the ticket leaves ESCALATED/BLOCKED (see updateSubState).
      if (!hasColumn(db, 'tickets', 'escalation_reason')) {
        db.exec(`ALTER TABLE tickets ADD COLUMN escalation_reason TEXT DEFAULT NULL`);
      }
      if (!hasColumn(db, 'tickets', 'escalation_message')) {
        db.exec(`ALTER TABLE tickets ADD COLUMN escalation_message TEXT DEFAULT NULL`);
      }
      if (!hasColumn(db, 'tickets', 'escalation_artifact')) {
        db.exec(`ALTER TABLE tickets ADD COLUMN escalation_artifact TEXT DEFAULT NULL`);
      }
    },
  },
  // ── Future migrations go here ──────────────────────────────────
];

// ── Schema version tracking ──────────────────────────────────────

function ensureVersionTable(db: BetterSqlite3.Database): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS schema_version (
  version     INTEGER NOT NULL,
  description TEXT NOT NULL,
  applied_at  TEXT NOT NULL
);
  `);
}

function getCurrentVersion(db: BetterSqlite3.Database): number {
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as
    | { v: number | null }
    | undefined;
  return row?.v ?? 0;
}

function recordVersion(db: BetterSqlite3.Database, migration: Migration): void {
  db.prepare('INSERT INTO schema_version (version, description, applied_at) VALUES (?, ?, ?)').run(
    migration.version,
    migration.description,
    new Date().toISOString(),
  );
}

/** Detects pre-migration databases (tables exist but no schema_version) */
function detectLegacyDb(db: BetterSqlite3.Database): boolean {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tickets'")
    .all();
  const hasVersionTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
    .all();
  return tables.length > 0 && hasVersionTable.length === 0;
}

// ── Public API ────────────────────────────────────────────────────

export function initSchema(db: BetterSqlite3.Database): void {
  if (schemaApplied) return;

  db.pragma('journal_mode = WAL');

  ensureVersionTable(db);

  // Handle legacy databases created before the migration system existed.
  // These have tables but no schema_version — stamp them at version 1.
  if (detectLegacyDb(db)) {
    recordVersion(db, MIGRATIONS[0]);
  }

  const currentVersion = getCurrentVersion(db);

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) continue;

    const runMigration = db.transaction(() => {
      migration.apply(db);
      recordVersion(db, migration);
    });
    runMigration();
  }

  schemaApplied = true;
}

/** Returns a singleton Database connection to ~/.aeos/state.db */
export function getDb(): BetterSqlite3.Database {
  if (instance) return instance;

  const dbPath = aeosDbPath();
  instance = new Database(dbPath);
  initSchema(instance);
  return instance;
}

/** For testing — resets the singleton so a fresh DB can be created */
export function resetDb(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
  schemaApplied = false;
}

/** Exported for testing only */
export const _testing = { MIGRATIONS, getCurrentVersion, detectLegacyDb };
