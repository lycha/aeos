# Code Review: M1-004 — CLI Ticket List

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Uncommitted changes — `ticket list` command (8 files, +177 lines)

---

## Overall Assessment

Clean, well-structured implementation of `aeos ticket list` following established patterns from `ticket-create`. The hexagonal architecture is respected throughout: a driving port defines the contract, the use case delegates to the repository port, the SQLite adapter implements the query, and the CLI command orchestrates presentation. Test coverage is solid with co-located unit tests for both the use case and the CLI command layer.

No Critical or Major issues found. Three Minor items are noted below — all are polish-level improvements that do not block merge.

**Verdict:** Approve

---

## Critical Issues

None.

---

## Major Issues

None.

---

## Minor Issues

### m1. Long titles break table column alignment

**File:** `src/cli/commands/ticket-list.command.ts` (table formatting, ~lines 65-82)

**Problem:**
`ticket.title.padEnd(COL_TITLE)` pads short titles but does not truncate long ones. A title longer than 32 characters pushes COLUMN and SUB-STATE rightward, breaking visual alignment.

**Recommendation:**
Truncate before padding:
```ts
const truncated = ticket.title.length > COL_TITLE
  ? ticket.title.substring(0, COL_TITLE - 1) + '…'
  : ticket.title;
const titleCell = truncated.padEnd(COL_TITLE);
```
Apply the same treatment to `ticket.id` and `ticket.column` for defensive consistency.

---

### m2. In-memory sort could be replaced with SQL ORDER BY

**File:** `src/infrastructure/persistence/sqlite-ticket.repository.ts` (lines 74-79)

**Problem:**
Tickets are sorted in JavaScript after the full result set is fetched. While correct and performant for the expected dataset size (local CLI), the same sort can be expressed in SQL, keeping data-ordering responsibility in the query layer.

**Recommendation:**
Append `ORDER BY CAST(SUBSTR(id, INSTR(id, '-') + 1) AS INTEGER)` to the SQL query and remove the in-memory `.sort()`. This keeps the repository as the single source of ordering logic and would remain correct if the result set grows.

---

### m3. Redundant local type annotation on `columnFilter`

**File:** `src/cli/commands/ticket-list.command.ts` (line 26)

**Problem:**
```ts
let columnFilter: (typeof Column)[keyof typeof Column] | undefined;
```
This is equivalent to `Column | undefined` and is verbose compared to the type alias already exported from the domain model.

**Recommendation:**
```ts
import type { Column } from '../../domain/model/column.js';
// …
let columnFilter: Column | undefined;
```
`Column` (the type) is already available via the existing import of `isValidColumn, Column`.

---

## Positive Observations

1. **Follows existing patterns faithfully.** The command registration, project-root resolution, try/catch + `process.exitCode` pattern, and `eslint-disable-next-line no-console` annotations all match `ticket-create.command.ts` exactly.
2. **Good CLI UX details.** Case-insensitive `--column` matching (uppercased before validation), a clear empty-state message pointing to `ticket create`, and em-dash (`—`) for null sub-state.
3. **Comprehensive test coverage.** Both `ticket-list.use-case.test.ts` and `ticket-list.command.test.ts` cover the happy path, empty state, column filtering, case-insensitive input, invalid column rejection, and "not in project" error.
4. **Parameterized SQL.** The optional column filter is appended with a `?` placeholder — no interpolation, no injection risk.
5. **Clean domain port.** `TicketListPort` and `TicketListInput` are minimal, import only domain types (`Column`, `Ticket`), and keep the domain layer pure.
6. **Existing test mock updated.** `ticket-create.use-case.test.ts` correctly adds the new `findByProject` stub to its mock, preventing breakage.

---

## Architecture Compliance

- [x] Dependency direction: `cli → application → domain ← infrastructure`
- [x] Domain layer purity: no I/O, no framework imports in `src/domain/`
- [x] Barrel exports updated (`src/cli/index.ts` re-exports the new command)
- [x] Composition root (`container.ts`) wires `TicketListUseCase` to `TicketListPort`

---

## Verification Notes

- `npm run typecheck` — **PASS** (0 errors)
- `npm run lint` — **PASS** (0 warnings on changed files)
- `npm test` — **UNABLE TO RUN** (Vitest requires `node:util.styleText` — Node 22+ / environment mismatch; not caused by this changeset)

---

## Draft PR Summary

**Summary:**
- Add `aeos ticket list` command with optional `--column <COLUMN>` filter
- Define `TicketListPort` driving port and `TicketListInput` DTO in domain layer
- Implement `TicketListUseCase` delegating to `TicketRepository.findByProject()`
- Add `findByProject(projectId, columnFilter?)` to `TicketRepository` port and SQLite adapter
- Register command in CLI container and barrel exports
- Add unit tests for use case and CLI command layers

**Testing:**
- `ticket-list.use-case.test.ts` — 5 tests (empty, populated, column filter, null subState, numeric sort order)
- `ticket-list.command.test.ts` — 7 tests (empty state, table output, em-dash, column filter, case-insensitive, invalid column, not-in-project error)

Please review this summary and confirm it matches the intended changes.
