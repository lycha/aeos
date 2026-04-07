// Infrastructure — SQLite connection and migration helper
//
// Design decision: single global DB at ~/.aeos/state.db.
// All projects share this database, isolated by project_id composite keys.
// This simplifies cross-project queries (dashboard, costs) and avoids
// per-project DB lifecycle management. See ADR in code-review/REVIEW-20260407-M1-milestone.md.

import Database from 'better-sqlite3';
import type BetterSqlite3 from 'better-sqlite3';
import { aeosDbPath } from '../../shared/config.js';

let instance: BetterSqlite3.Database | null = null;
let schemaApplied = false;

const DDL = `
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
`;

export function initSchema(db: BetterSqlite3.Database): void {
  if (schemaApplied) return;
  db.pragma('journal_mode = WAL');
  db.exec(DDL);
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
