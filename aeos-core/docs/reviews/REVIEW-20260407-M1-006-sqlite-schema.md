# Code Review: M1-006 — SQLite Schema via `better-sqlite3`

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Task specification document — `docs/tasks/M1-006-sqlite-schema.md`

---

## Overall Assessment

The task correctly identifies `better-sqlite3` as the persistence layer and defines a reasonable three-table schema for tickets, transitions, and cost records. The singleton connection pattern, `CREATE TABLE IF NOT EXISTS` idiom, and synchronous API choice are all sound for a single-user CLI tool.

However, there are two Major issues: the schema places `state.db` per-project in `.aeos/state.db`, but the system design doc specifies a *global* `~/.aeos/state.db` that holds tickets across all projects (enabling `aeos dashboard` and cross-project commands from any directory); and `sub_state` is `NOT NULL DEFAULT 'BLOCKED'`, which contradicts the M1-003 review fix requiring `sub_state` to be nullable for BACKLOG tickets. Three Minor issues address missing columns on `cost_records` and `transitions` relative to the system design, a missing WAL mode pragma, and a missing `tickets/` directory creation step.

**Verdict:** Approve with changes

---

## Major Issues

### M1. DB location: per-project `.aeos/state.db` vs global `~/.aeos/state.db`

**File:** `docs/tasks/M1-006-sqlite-schema.md` — "What needs to be done"

**Problem:**
The task says "opens (or creates) `.aeos/state.db`" — a per-project database. The system design doc (Section 3.2) specifies:

```
~/.aeos/
  state.db    ← SQLite: pipeline state for all tickets across all projects
  costs.db    ← SQLite: all cost records across all projects
```

And: "`state.db` and `costs.db` are the source of truth for `aeos dashboard`, `aeos project list`, and all cost commands."

Section 7.6 further specifies: "The `~/.aeos/state.db` handles concurrent writes from multiple project processes via SQLite's WAL mode."

A per-project DB would mean `aeos dashboard` and `aeos cost` (workspace-level) can't function without iterating every project's `.aeos/` directory and opening separate DB connections. The system design explicitly avoids this by centralising state globally.

**Impact:**
Every command that operates across projects (`dashboard`, `cost`, `project list`) would need a fundamentally different implementation than the system design intends. This is an architectural mismatch that would cascade through M2+ milestones.

**Recommendation:**
Change to: "opens (or creates) `~/.aeos/state.db`" using `aeosHomePath('state.db')` from M1-011. The `getDb()` function should not take `projectRoot` as a parameter — it resolves the global home path internally. Add `project_id TEXT NOT NULL` to the `tickets` and `cost_records` tables to associate rows with their project.

Additionally, the system design separates state and costs into two databases (`state.db` and `costs.db`). For v1 simplicity, a single `state.db` containing all three tables is acceptable, but document this as a deviation.

---

### M2. `sub_state` must be nullable for BACKLOG tickets

**File:** `docs/tasks/M1-006-sqlite-schema.md` — DDL, `tickets` table

**Problem:**
The schema defines `sub_state TEXT NOT NULL DEFAULT 'BLOCKED'`. The M1-003 review fix (already applied) changed ticket creation to insert `subState: null` for BACKLOG tickets, with the note: "Requires `sub_state` to be nullable in the DB schema (coordinate with M1-006)."

BACKLOG is a human-only holding column — no agent has run, no pre-flight has occurred. `BLOCKED` is semantically wrong (it means "pre-flight found open questions"). The current `NOT NULL` constraint will reject the `null` insert from M1-003.

**Impact:**
`aeos ticket create` will throw a SQLite constraint violation on every ticket creation. M1-003, M1-004, and M1-005 all assume `sub_state` can be `null`.

**Recommendation:**
Change to: `sub_state TEXT DEFAULT NULL`. Remove the `DEFAULT 'BLOCKED'` — the caller (M1-003 for BACKLOG, M1-008/M1-009 for other columns) is responsible for setting the correct value.

---

## Minor Issues

### m1. `cost_records` table missing `agent`, `executor`, and `project` columns from system design

**File:** `docs/tasks/M1-006-sqlite-schema.md` — DDL, `cost_records` table

**Problem:**
The system design cost record (Section 9.1) includes:
```json
{
  "ticket_id": "ticket-042",
  "project": "startup-a",
  "agent": "architect-agent",
  "executor": "claude-code-cli",
  "model": "claude-opus-4-6",
  ...
}
```

The schema is missing `project` (needed for cross-project cost views if using a global DB), `agent` (needed for per-agent cost breakdowns), and `executor` (needed to distinguish executor types in v2).

**Recommendation:**
Add to the `cost_records` DDL:
```sql
project_id  TEXT NOT NULL,
agent       TEXT NOT NULL,
executor    TEXT NOT NULL DEFAULT 'claude-code-cli',
```

---

### m2. `transitions` table missing `comment` and `sub_state` columns

**File:** `docs/tasks/M1-006-sqlite-schema.md` — DDL, `transitions` table

**Problem:**
The system design (Section 5.9, FR-24) specifies that every card move presents a transition comment panel and the comment is committed. The `transitions` table has no `comment` column to store this. Additionally, there is no record of what `sub_state` the ticket was in at transition time, which is useful for debugging and the execution log.

Without a `project_id`, the global DB also can't associate transitions with a specific project.

**Recommendation:**
Add to the `transitions` DDL:
```sql
project_id  TEXT NOT NULL,
comment     TEXT,
from_sub_state TEXT,
to_sub_state   TEXT,
```

---

### m3. Missing WAL mode pragma for concurrent cross-project access

**File:** `docs/tasks/M1-006-sqlite-schema.md` — Technical Notes

**Problem:**
The system design (Section 7.6) explicitly states: "The `~/.aeos/state.db` handles concurrent writes from multiple project processes via SQLite's WAL mode." The task has no pragma to enable WAL mode. Without it, concurrent agent runs across different projects will encounter `SQLITE_BUSY` errors when writing to the global DB.

**Recommendation:**
Add to `initSchema()`: `db.pragma('journal_mode = WAL')` as the first operation after opening the connection. Add a Technical Note explaining WAL mode enables concurrent reads and writes from multiple processes.

---

## Positive Observations

1. **`CREATE TABLE IF NOT EXISTS`** — correct idiom for a schema that's applied on every startup; idempotent by design.
2. **Singleton connection pattern** — avoids opening multiple DB handles per CLI invocation, preventing file lock contention.
3. **Synchronous API choice** is well-reasoned — `better-sqlite3`'s sync API is simpler and correct for a single-user CLI tool.
4. **Out of Scope correctly defers migrations** — v1 creates fresh per project, no migration toolchain needed.

---

## Verification Notes

- After applying M1 (global DB): verify that `aeos ticket create` in project A and project B both write to the same `~/.aeos/state.db` and that `aeos ticket list` from either project shows only that project's tickets (filtered by `project_id`).
- After applying M2 (nullable sub_state): run `aeos ticket create "test"` and confirm the DB row has `sub_state = NULL`, not `BLOCKED`.
- After applying m3 (WAL mode): open two terminal sessions, run `aeos ticket create` simultaneously in two different projects, and confirm no `SQLITE_BUSY` errors.
- Run `PRAGMA journal_mode;` on the DB after init and confirm it returns `wal`.

---

## Draft PR Summary

**Scope:** M1-006 task specification document
**Changes needed before implementation:**

- **DB location:** Change from per-project `.aeos/state.db` to global `~/.aeos/state.db` using `aeosHomePath()` from M1-011. Change `getDb()` signature to take no arguments (resolves path internally).
- **`tickets` table:** Change `sub_state` from `TEXT NOT NULL DEFAULT 'BLOCKED'` to `TEXT DEFAULT NULL`. Add `project_id TEXT NOT NULL`.
- **`cost_records` table:** Add `project_id`, `agent`, `executor` columns per system design Section 9.1.
- **`transitions` table:** Add `project_id`, `comment`, `from_sub_state`, `to_sub_state` columns.
- **`initSchema()`:** Add `db.pragma('journal_mode = WAL')` for concurrent cross-project access.
- **Dependencies:** Add M1-011 (`aeosHomePath()`) for resolving the global DB path.

Please review this summary and confirm it matches the intended changes before updating the task document.
