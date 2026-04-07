# Task: Implement SQLite Schema via `better-sqlite3`

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** database-architect
**Method:** Manual (bootstrapping)

## Context
Defines the persistence layer for the state machine. All ticket CLI commands and the state machine read/write through this schema. Must be initialised when `aeos project init` runs. Requires M1-002 (project init) to establish where `.aeos/` lives.

## What needs to be done
- Install: `npm install better-sqlite3` and `npm install -D @types/better-sqlite3`
- Create `src/db/schema.ts` that opens (or creates) `.aeos/state.db` and runs the following DDL:

```sql
CREATE TABLE IF NOT EXISTS tickets (
  id         TEXT PRIMARY KEY,          -- e.g. "AEOS-1"
  title      TEXT NOT NULL,
  column     TEXT NOT NULL DEFAULT 'BACKLOG',
  sub_state  TEXT NOT NULL DEFAULT 'BLOCKED',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transitions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id   TEXT NOT NULL REFERENCES tickets(id),
  from_column TEXT,
  to_column   TEXT NOT NULL,
  at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cost_records (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id   TEXT NOT NULL REFERENCES tickets(id),
  column      TEXT NOT NULL,
  model       TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd    REAL NOT NULL DEFAULT 0.0,
  recorded_at TEXT NOT NULL
);
```

- Export a `getDb(projectRoot: string): Database` function that returns a singleton connection
- Call `initSchema(db)` on first connection to ensure tables exist

## Acceptance Criteria
- [ ] Given a project root, when calling `getDb()`, then `.aeos/state.db` is created if it does not exist
- [ ] Given a fresh DB, when inspecting `.tables`, then `tickets`, `transitions`, and `cost_records` all exist
- [ ] Given calling `getDb()` twice, when comparing references, then the same connection instance is returned (singleton)
- [ ] Given `cost_records`, when inserting a row, then all required columns accept the correct types

## Out of Scope
- Migration tooling (v1 has no migrations — schema is created fresh per project)
- Query helper functions (used directly by state machine functions)

## Technical Notes / Hints
- `better-sqlite3` is synchronous — no `await` needed, which simplifies state machine code significantly
- Store ISO 8601 strings for all date columns (`new Date().toISOString()`)

## Dependencies
- M1-002: `aeos project init` establishes `.aeos/`

## Definition of Done
- [ ] Schema initialised correctly on fresh project
- [ ] Unit tests: table existence, singleton connection, insert/query round trip for each table
- [ ] Code reviewed and approved
