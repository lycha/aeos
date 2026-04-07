# Task: Implement SQLite Schema via `better-sqlite3`

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** database-architect
**Method:** Manual (bootstrapping)

## Context
Defines the persistence layer for the state machine. The database is **global** at `~/.aeos/state.db` — it holds pipeline state for all tickets across all projects. This enables `aeos dashboard`, `aeos cost`, and `aeos project list` to work from any directory without iterating per-project `.aeos/` directories. Must be initialised when `aeos install` runs (M1-001 creates `~/.aeos/`).

> **Note:** The system design (Section 3.2) specifies separate `state.db` and `costs.db`. For v1 simplicity, we use a single `state.db` containing all three tables. This is a documented deviation.

## What needs to be done
- Install: `npm install better-sqlite3` and `npm install -D @types/better-sqlite3`
- Create `src/infrastructure/persistence/database.ts` that opens (or creates) `~/.aeos/state.db` and runs the following DDL:

```sql
CREATE TABLE IF NOT EXISTS tickets (
  id          TEXT NOT NULL,              -- e.g. "AEOS-1"
  project_id  TEXT NOT NULL,              -- slug from project.json, e.g. "startup-a"
  title       TEXT NOT NULL,
  column      TEXT NOT NULL DEFAULT 'BACKLOG',
  sub_state   TEXT DEFAULT NULL,          -- NULL for BACKLOG; set by orchestrator for other columns
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
  comment        TEXT,                    -- operator transition comment (FR-24)
  at             TEXT NOT NULL,
  FOREIGN KEY (project_id, ticket_id) REFERENCES tickets(project_id, id)
);

CREATE TABLE IF NOT EXISTS cost_records (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id     TEXT NOT NULL,
  project_id    TEXT NOT NULL,
  column        TEXT NOT NULL,
  agent         TEXT NOT NULL,            -- e.g. "pm-agent", "architect-agent"
  executor      TEXT NOT NULL DEFAULT 'claude-code-cli',
  model         TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd      REAL NOT NULL DEFAULT 0.0,
  recorded_at   TEXT NOT NULL,
  FOREIGN KEY (project_id, ticket_id) REFERENCES tickets(project_id, id)
);
```

- Export a `getDb(): Database` function (no arguments) that resolves the DB path via `aeosDbPath()` from M1-011 and returns a singleton connection
- In `initSchema(db)`:
  1. Enable WAL mode: `db.pragma('journal_mode = WAL')` — required for concurrent cross-project access (system design Section 7.6)
  2. Run the DDL statements above

## Acceptance Criteria
- [ ] Given `~/.aeos/` exists, when calling `getDb()`, then `~/.aeos/state.db` is created if it does not exist
- [ ] Given a fresh DB, when inspecting `.tables`, then `tickets`, `transitions`, and `cost_records` all exist
- [ ] Given calling `getDb()` twice, when comparing references, then the same connection instance is returned (singleton)
- [ ] Given the DB after init, when running `PRAGMA journal_mode`, then it returns `wal`
- [ ] Given `tickets`, when inserting a row with `sub_state = NULL`, then the insert succeeds (nullable column)
- [ ] Given `cost_records`, when inserting a row with `agent` and `executor` values, then all columns accept the correct types

## Out of Scope
- Migration tooling (v1 has no migrations — schema is created fresh)
- Query helper functions (used directly by state machine functions)
- Separate `costs.db` (v1 uses single `state.db` for all tables)

## Technical Notes / Hints
- `better-sqlite3` is synchronous — no `await` needed, which simplifies state machine code significantly
- Store ISO 8601 strings for all date columns (`new Date().toISOString()`)
- WAL mode (`journal_mode = WAL`) enables concurrent reads and writes from multiple processes — essential because the operator may run agents on multiple projects simultaneously, all writing to the same global `state.db`
- The composite primary key `(project_id, id)` allows the same ticket ID (e.g. `SAAS-1`) to exist in different projects without collision

## Dependencies
- M1-001: `aeos install` creates `~/.aeos/`
- M1-011: `aeosHomePath()` for resolving global DB path

## Definition of Done
- [ ] Schema initialised correctly at `~/.aeos/state.db`
- [ ] WAL mode confirmed active after init
- [ ] `sub_state` accepts NULL values
- [ ] Unit tests: table existence, singleton connection, WAL mode, insert/query round trip for each table (including nullable sub_state)
- [ ] Code reviewed and approved
