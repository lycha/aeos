# Code Review: M1-003 — CLI Ticket Create

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Uncommitted changes — 18 files, ~740 lines added

---

## Overall Assessment

This changeset introduces the `aeos ticket create` CLI command end-to-end: domain model (`Ticket`), driving port (`TicketCreatePort`), driven ports (`TicketRepository`, `ArtifactStore` extensions, `GitGateway.commit`), use case, CLI command registration, SQLite persistence layer with schema DDL, and a comprehensive test suite. The architecture follows hexagonal conventions well — dependency direction is respected, ports are cleanly defined, and composition wiring is correct.

There are **no Critical issues**. Two Major issues and several Minor issues were found, primarily around data integrity (non-atomic multi-step write) and a race condition in ticket ID generation.

**Verdict:** Approve with changes

---

## Critical Issues

_None._

---

## Major Issues

### M1. Non-atomic ticket creation — partial state on failure

**File:** `src/application/ticket-create.use-case.ts` (`execute`)

**Problem:**
The use case performs three side-effecting steps sequentially (write artifact → save to DB → git commit) without any transactional boundary. If step 2 (`ticketRepo.save`) or step 3 (`gitGateway.commit`) throws, the artifact file is already written to disk, leaving the system in an inconsistent state: a markdown file exists but no DB row, or a DB row exists with no git commit.

**Impact:**
A retry of `ticket create` with the same title would generate the same ticket ID (since `nextId` is COUNT-based and no row was inserted), creating a second artifact file that overwrites the first — or the DB insert could fail with a PRIMARY KEY conflict if step 2 succeeded but step 3 failed.

**Recommendation:**
1. Wrap the DB save in a `db.transaction()` block (even for a single insert, this establishes the pattern for future multi-step writes).
2. Consider a compensating action: if `gitGateway.commit` throws, delete the artifact file and roll back the DB row, or document that partial state is acceptable and `ticket create` is re-entrant.
3. At minimum, move the DB insert *before* the artifact write so the "source of truth" (DB) is committed first, and a missing file is easier to detect and regenerate than a missing DB row.

### M2. Ticket ID generation via COUNT is not concurrency-safe

**File:** `src/infrastructure/persistence/sqlite-ticket.repository.ts` (`nextId`)

**Problem:**
`nextId` computes the next ticket number as `COUNT(*) + 1`. If a ticket is ever deleted, the count decreases and a previously-used ID will be reissued. Additionally, in any future concurrent scenario (multiple CLI invocations), two processes could read the same count and generate the same ticket ID, causing a PRIMARY KEY violation on insert.

**Impact:**
Ticket ID collisions or ID reuse after deletion — breaks the immutable identity assumption of tickets.

**Recommendation:**
Replace `COUNT(*)` with `MAX()` on a numeric suffix column, or use a dedicated `project_sequences` table with an auto-incrementing counter:
```sql
-- Option A: MAX-based (simple)
SELECT COALESCE(MAX(CAST(SUBSTR(id, INSTR(id, '-') + 1) AS INTEGER)), 0) + 1
FROM tickets WHERE project_id = ?

-- Option B: Sequence table (robust)
CREATE TABLE IF NOT EXISTS project_sequences (
  project_id TEXT PRIMARY KEY,
  next_ticket_num INTEGER NOT NULL DEFAULT 1
);
-- Then UPDATE ... SET next_ticket_num = next_ticket_num + 1 RETURNING next_ticket_num
```

---

## Minor Issues

### m1. `getDb()` called eagerly at container creation — side effect on import

**File:** `src/cli/container.ts` (line 29)

**Problem:**
`getDb()` opens a SQLite connection to `~/.aeos/state.db` and runs DDL every time `createContainer()` is called, including for commands that don't need the database (e.g., `aeos project init`, `aeos install`). This creates the `~/.aeos/` directory and `state.db` file as a side effect even before the user has initialized a project.

**Recommendation:**
Lazily initialize the DB connection — only construct `SqliteTicketRepository` when a ticket command is actually invoked, or use a lazy proxy/factory pattern in the container.

### m2. `column` is a SQLite reserved word used as column name

**File:** `src/infrastructure/persistence/database.ts` (DDL, line 15) and `sqlite-ticket.repository.ts` (line 20)

**Problem:**
The column name `column` in the `tickets` table is a SQL reserved word. The `save` method correctly quotes it (`"column"`), but the DDL does not. This works in SQLite (which is lenient with reserved words) but is fragile and may cause issues with SQL tooling, migration generators, or if the project ever moves to another database.

**Recommendation:**
Quote `"column"` in the DDL consistently, or rename to `pipeline_column` / `stage` to avoid the reserved-word issue entirely.

### m3. `FsArtifactStore.writeArtifact` does not validate path components

**File:** `src/infrastructure/filesystem/fs-artifact-store.adapter.ts` (`writeArtifact`)

**Problem:**
The `ticketId` and `filename` parameters are used directly in `path.join()` without any validation. A malicious or malformed ticket ID containing `../` could write files outside the `.aeos/tickets/` boundary.

**Recommendation:**
Validate that `ticketId` and `filename` do not contain path separators or `..` segments before constructing the path. Example: `if (ticketId.includes('..') || ticketId.includes(path.sep)) throw ...`

### m4. `projectRepo` exposed on Container interface — leaks driven port to CLI layer

**File:** `src/cli/container.ts` (line 21)

**Problem:**
The `Container` interface exposes `projectRepo: ProjectRepository` (a driven port) alongside use cases (driving ports). The CLI layer should only depend on driving ports; `findRoot` + `read` logic in `ticket-create.command.ts` is application-level orchestration that belongs in the use case.

**Recommendation:**
Move the `findRoot` + `read` logic into the `TicketCreateUseCase` (accept `cwd` as part of `TicketCreateInput` instead of `projectPath`/`projectId`/`projectKey`), and remove `projectRepo` from the Container interface. This keeps the CLI as a thin adapter.

### m5. Missing barrel exports for new ports

**File:** `src/domain/ports/driven/` and `src/domain/ports/driving/`

**Problem:**
The new port files (`ticket-repository.port.ts`, `artifact-store.port.ts`, `ticket-create.port.ts`) are not re-exported from `src/domain/ports/index.ts`.

**Recommendation:**
Add the new ports to `src/domain/ports/index.ts` to maintain the barrel export convention.

### m6. Hardcoded `/tmp/my-project` path in tests

**File:** `src/application/ticket-create.use-case.test.ts` (line 39)

**Problem:**
The test fixture uses a hardcoded `/tmp/my-project` path. While the test mocks all I/O so no actual filesystem access occurs, this deviates from the project test convention (per checklist: "Test fixtures use `os.tmpdir()` / `fs.mkdtempSync()` — no hardcoded paths").

**Recommendation:**
Use `path.join(os.tmpdir(), 'aeos-test-project')` for the project path constant.

---

## Positive Observations

1. **Clean hexagonal architecture** — domain layer has zero external imports; all `node:*` usage is confined to infrastructure adapters.
2. **Comprehensive test suite** — 9 well-structured unit tests covering happy path, ordering, auto-increment, and dual-execution scenarios with proper mock isolation.
3. **Good use of `execFileSync`** over `exec` in the git gateway — prevents shell injection.
4. **`findRoot` traversal** is well-implemented with proper termination at filesystem root.
5. **DDL includes forward-looking tables** (transitions, cost_records) showing good planning.
6. **Consistent ESM compliance** — all imports use `.js` extensions, no CommonJS patterns.
7. **TypeScript strict mode** passes cleanly — no `any` types, proper use of `type` imports.

---

## Architecture Compliance

- [x] Dependency direction: `cli → application → domain ← infrastructure`
- [x] Domain layer purity: no I/O, no framework imports in `src/domain/`
- [ ] Barrel exports updated for any new modules *(see m5)*
- [x] Composition root (`container.ts`) updated for new adapters/use cases

---

## Verification Notes

- `npx tsc --noEmit` — **PASS** (zero errors)
- `npx eslint src/` — **PASS** (zero warnings/errors)
- `npx vitest run` — **BLOCKED** (Node version incompatibility with Vitest 4 / rolldown; requires Node 22+ with `styleText` support)
- Manual inspection of all 18 changed files — complete

---

## Draft PR Summary

**Summary:**
- Add `aeos ticket create <title>` CLI command (M1-003)
- Define `Ticket` domain model with `Column` and `SubState` type references
- Add driving port `TicketCreatePort` with input/result types
- Add driven ports: `TicketRepository` (CRUD), `ArtifactStore.writeArtifact`, `GitGateway.commit`
- Implement `TicketCreateUseCase`: generates ticket ID, writes markdown artifact, persists to SQLite, commits to `.aeos/.git`
- Add `FsArtifactStore` adapter for filesystem artifact writes
- Add `SqliteTicketRepository` adapter with `better-sqlite3`
- Add SQLite schema DDL (tickets, transitions, cost_records tables) with WAL mode
- Add `FsProjectRepository.findRoot()` for project root discovery
- Add `SimpleGitGateway.commit()` for staging + committing changes
- Wire everything through `container.ts` and register CLI subcommand
- 9 unit tests for the use case with full mock isolation

**Testing:**
- TypeScript compilation: PASS
- ESLint: PASS
- Unit tests: 9 tests written (runtime blocked by Node/Vitest version mismatch)

Please review this summary and confirm it matches the intended changes.
