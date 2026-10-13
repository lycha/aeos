# Code & Architecture Review: Milestone 1 Implementation

**Date:** 2026-04-07
**Reviewer:** Augment Agent
**Scope:** All M1 source code — domain, application, infrastructure, CLI layers
**Source lines:** ~2,287 (source), ~1,589 (tests)

---

## Overall Assessment

Strong M1 delivery. The hexagonal architecture is correctly implemented with clean layer separation. The domain is pure (zero `node:` imports, zero `any` usage). The state machine is well-tested (400-line test file with 20+ test cases). Use cases follow a consistent pattern. The biggest gap is a design deviation in the state machine transition rules and several infrastructure concerns.

**Verdict:** Approve with changes — 0 Critical, 4 Major, 7 Minor

---

## Architecture Compliance

- [x] Dependency direction: `cli → application → domain ← infrastructure`
- [x] Domain layer purity: no I/O, no framework imports in `src/domain/`
- [x] Barrel exports updated for all modules
- [x] Composition root (`container.ts`) wires adapters to ports via lazy getters
- [ ] **See M2**: State machine service takes repository ports but domain service has no DB awareness — ✓ correct

---

## Critical Issues

### ~~C1. State machine allows backward transitions~~ — RESOLVED: docs already reflect this design

**File:** `src/domain/services/state-machine.ts`, line 30–42

**Problem:**
The task spec M1-008 states: *"Legal transitions: target must be exactly the **next** column in COLUMN_ORDER (forward-only, no skipping). Exception: any column → BACKLOG is allowed (reset/unblock flow)."*

The implementation allows **any backward transition** (not just BACKLOG reset):
```typescript
// Backward moves are always allowed (rework / reset).
if (targetIdx < currentIdx) { ... }
```

Tests confirm this: `TECH_SPEC → ARCH_SPIKE`, `CODE_REVIEW → PRODUCT_SCOPING`, `DONE → PRODUCT_SCOPING` all pass.

**Impact:** The pipeline's forward-only guarantee is broken. Tickets can move arbitrarily backward, defeating the purpose of the gate model. M2's `aeos ticket approve` relies on forward-only transitions.

**Recommendation:**
Decide on the intended behaviour:
- **Option A (match spec):** only allow forward +1 and BACKLOG reset. Remove the general backward logic.
- **Option B (keep current):** update the task spec M1-008 to reflect the intentional design change.

If Option A, the transition logic should be:
```typescript
if (targetColumn === Column.BACKLOG) { /* always allowed */ }
else if (targetIdx === currentIdx + 1) { /* forward +1 allowed */ }
else { return { ok: false, reason: `Cannot transition from ${current} to ${target}` }; }
```

---

## Major Issues

### M1. `database.ts` hardcodes DB path resolution — no project isolation

**File:** `src/infrastructure/persistence/database.ts`, lines 47–55

**Problem:**
`getDb()` resolves `~/.aeos/state.db` using `aeosHome()` which always returns the global `~/.aeos/` path. This means all projects share a single database file at the global location, not per-project.

The task spec M1-006 states the DB should be at `.aeos/state.db` *within each project*. The `aeosDir()` / project root resolution should be used, not `aeosHome()`.

The `SqliteTicketRepository` uses `projectId` as a composite key, so data is isolated at the row level — but a single corrupted `~/.aeos/state.db` would take down all projects.

**Impact:** All projects share one DB file. If the design intent is per-project DBs, this is wrong. If global DB is intentional, the `projectId` composite key approach is correct but the task spec should be updated.

**Recommendation:** Clarify the design intent. If per-project: change `getDb()` to accept a project root path. If global: document the design decision.

### M2. `SqliteTicketRepository` — `create()` does not wrap `nextId + INSERT` in a transaction

**File:** `src/infrastructure/persistence/sqlite-ticket.repository.ts`, lines 37–58

**Problem:**
```typescript
nextId(projectId: string): number {
  const row = this.db.prepare(...)
    .get(projectId) as { next_num: number } | undefined;
  return row ? row.next_num : 1;
}

save(ticket: Ticket): void {
  this.db.prepare('INSERT OR REPLACE INTO tickets ...').run(...);
}
```
`nextId()` reads the max ticket number, then `save()` inserts. If two processes (or two auggie sessions) create tickets concurrently, they'll get the same `nextId` and the second `INSERT OR REPLACE` will silently overwrite the first ticket.

**Impact:** Duplicate ticket IDs under concurrent access. Silent data loss.

**Recommendation:** Wrap `nextId + INSERT` in a `db.transaction()` block, or use `AUTOINCREMENT` on an integer column and derive the ticket ID from it.

### M3. `GitGateway` port mismatch — `commit()` vs `commitFiles()`

**File:** `src/domain/ports/driven/git-gateway.port.ts` vs `src/infrastructure/git/simple-git-gateway.adapter.ts`

**Problem:**
The port defines:
```typescript
init(dir: string): void;
commit(dir: string, message: string): void;
commitFiles(dir: string, files: string[], message: string): Promise<void>;
```
But `commit()` is synchronous while `commitFiles()` is async (`Promise<void>`). The adapter implements both, but `commitFiles()` shells out via `execSync` — it's a lie that it's async (it blocks the event loop despite the `Promise` return type).

Meanwhile `commit()` also uses `execSync`. There are two methods doing nearly the same thing with different interfaces.

**Impact:** Misleading async contract; event loop blocked during git operations.

**Recommendation:** Consolidate to one method. Use `execFile` (promisified) for true async, or make both sync and drop the `Promise` return type.

### M4. `FsConfigStore` — `ensureGlobalGitignore()` not called during `install`

**File:** `src/application/install.use-case.ts`

**Problem:**
The install use case calls:
```typescript
this.configStore.ensureHomeDir();
this.configStore.writeConfigIfNotExists();
this.configStore.writeRegistryIfNotExists();
```
But it does NOT call `ensureGlobalGitignore()`. Task M1-001 states that `aeos install` should configure the global gitignore. The method exists on `ConfigStore` but is never invoked from the use case.

**Impact:** `.aeos/` is not added to the global gitignore during `aeos install`. The user must configure it manually (or it was done by our M0-006 shell script, but that's not the application's responsibility).

**Recommendation:** Add `this.configStore.ensureGlobalGitignore();` to `InstallUseCase.execute()`.

---

## Minor Issues

### m1. `console.log` / `console.error` used directly in CLI commands

**Files:** All `src/cli/commands/*.ts`

**Problem:** CLI commands use `console.log()` and `console.error()` directly. This makes testing output difficult and violates the principle of structured output. Errors should go to `process.stderr.write()` explicitly.

**Recommendation:** For v1 this is acceptable, but consider introducing a `Logger` port for v2.

### m2. `process.exitCode = 1` used inconsistently

**Files:** CLI command files

**Problem:** Some error paths set `process.exitCode = 1` and return, while others just return. The `install.command.ts` sets exit code on error but doesn't print a message. Inconsistent UX.

**Recommendation:** Audit all error paths. Every `process.exitCode = 1` should be preceded by a `console.error()` with an actionable message.

### m3. `Project.uuid` field is manually generated UUID — consider `crypto.randomUUID()`

**File:** `src/application/project-init.use-case.ts`

**Problem:** The project uses a manually imported UUID generation. Node 22 has built-in `crypto.randomUUID()`.

**Recommendation:** Use `crypto.randomUUID()` from `node:crypto` — zero dependency, guaranteed uniqueness.

### m4. `TicketCreateUseCase` — ticket file not committed to `.aeos/.git`

**File:** `src/application/ticket-create.use-case.ts`

**Problem:** The use case creates the ticket markdown file via `artifactStore.writeTicketFile()` but does not call `gitGateway.commit()` to commit it to `.aeos/.git`. Task M1-003 does not explicitly require this, but M2-011 (`aeos ticket run`) expects artifacts to be committed. If the file isn't committed at creation time, `git log` won't show ticket creation.

**Recommendation:** Add `gitGateway.commit()` after writing the ticket file.

### m5. Placeholder files — 30+ empty barrel/stub files

**File:** Many files across all layers

**Problem:** The scaffold created ~30 placeholder files with only `// CLI command — aeos ticket run` style comments. These pass typecheck but add noise to `git status` and line counts.

**Recommendation:** This is fine for M1 (scaffold was intentional). Clean up in M2 as files get real implementations.

### m6. `TransitionRepository` — no `findByTicket()` query

**File:** `src/domain/ports/driven/transition-repository.port.ts`

**Problem:** The port only has `record()`. There's no way to query transition history for a ticket. `aeos ticket show` should display transition history (task M1-005), but there's no read path.

**Recommendation:** Add `findByTicket(projectId: string, ticketId: string): TransitionRecord[]` to the port and implement it.

### m7. `database.ts` — `db.exec(DDL)` runs on every `getDb()` call

**File:** `src/infrastructure/persistence/database.ts`, line 52

**Problem:** The DDL includes `CREATE TABLE IF NOT EXISTS` so it's safe, but executing the full DDL string on every connection is wasteful. The singleton pattern means this only happens once per process, but it's still an antipattern.

**Recommendation:** Guard with a flag or use a dedicated `migrate()` function called once during setup.

---

## Positive Observations

1. **Domain purity** — zero `node:` imports, zero `any`, zero thrown exceptions in domain layer. Exemplary.
2. **State machine tests** — 400 lines, 20+ test cases covering forward/backward transitions, sub-state lifecycle, cross-project isolation, audit trail. Best test coverage in the codebase.
3. **Typed results** — `{ ok: true } | { ok: false; reason: string }` pattern used consistently across domain and application layers. No thrown exceptions for expected failures.
4. **Lazy container** — `get` accessors in `container.ts` correctly defer DB initialization. Clean fix for the startup ordering issue.
5. **Idempotent `project init`** — correctly detects existing project and returns without modification. Registry dedup logic is correct.
6. **ESM compliance** — all imports use `.js` extensions. No CommonJS patterns.
7. **Port/adapter separation** — tests use in-memory stubs (no SQLite dependency). Infrastructure adapters are never imported in domain tests.

---

## Verification Notes

- `npm run typecheck` — PASS (0 errors)
- `npm run lint` — PASS (0 violations)
- `npm test` — PASS (49 tests, 49 passing)

---

## Draft PR Summary

**M1 Implementation — CLI Foundation & State Machine**

Summary:
- Domain model: Column (9-stage enum), SubState (6-state enum), Ticket, Project, Transition, CostRecord
- State machine: `transition()` (column moves) and `setSubState()` with typed result pattern
- 9 driven ports: TicketRepository, TransitionRepository, ProjectRepository, ConfigStore, ArtifactStore, GitGateway, plus 3 M2 stubs
- 5 driving ports: Install, ProjectInit, TicketCreate, TicketList, TicketShow
- Infrastructure: SQLite persistence, filesystem config/artifact stores, simple-git gateway
- CLI: 5 commands registered (install, project init, ticket create, ticket list, ticket show)
- Lazy container wiring to support pre-DB commands (install, project init)

Testing:
- 49 tests passing across domain services, use cases, and CLI commands
- State machine: 20+ test cases (forward, backward, illegal, sub-state, audit, isolation)
- Use cases: mock-based port testing with operation order verification