# Code Review: M1-005 — `aeos ticket show` CLI command

**Date:** 2026-04-07
**Reviewer:** Staff SWE (automated)
**Scope:** Uncommitted changes — 11 modified files, 2 untracked test files (+168 lines)

---

## Overall Assessment

Clean, well-structured implementation of the `ticket show` command across all hexagonal layers. The changeset adds a driving port, use case, CLI command, and the necessary driven-port extensions (`findById`, `listArtifacts`) with corresponding adapter implementations. Architecture compliance is excellent — dependency direction is correct, domain remains pure, and the composition root is properly updated. Test coverage is thorough at both use-case and CLI-command layers.

One Major issue: the use case throws an exception for an expected "not found" case instead of returning a typed result. Three Minor issues around code duplication, missing input validation, and error-message actionability.

**Verdict:** Approve with changes

---

## Critical Issues

None.

---

## Major Issues

### M1. Use case throws for expected "not found" instead of returning a typed result

**File:** `src/application/ticket-show.use-case.ts` (`execute`)

**Problem:**
When a ticket is not found, `execute()` throws `new Error(...)`. The verification checklist mandates: *"Error handling uses typed result objects (`{ ok: true } | { ok: false; reason }`) — not thrown exceptions for expected failures."* A missing ticket is an expected, routine failure — not an exceptional condition.

**Impact:**
Callers must use try/catch for flow control. The thrown error is untyped, so any catch block swallows it generically, losing the ability to distinguish "not found" from infrastructure failures. Future callers (API layer, TUI) would need to parse error message strings.

**Recommendation:**
Change the driving port and use case to return a discriminated union:

```ts
// ticket-show.port.ts
export type TicketShowResult =
  | { ok: true; ticket: Ticket; artifacts: string[] }
  | { ok: false; reason: 'NOT_FOUND' };

export interface TicketShowPort {
  execute(input: TicketShowInput): TicketShowResult;
}

// ticket-show.use-case.ts
execute(input: TicketShowInput): TicketShowResult {
  const ticket = this.ticketRepo.findById(input.projectId, input.ticketId);
  if (!ticket) return { ok: false, reason: 'NOT_FOUND' };
  const artifacts = this.artifactStore.listArtifacts(input.projectPath, ticket.id);
  return { ok: true, ticket, artifacts };
}
```

Update the CLI command to check `result.ok` instead of wrapping in try/catch.

---

## Minor Issues

### m1. Row-to-domain mapping duplicated in `SqliteTicketRepository`

**File:** `src/infrastructure/persistence/sqlite-ticket.repository.ts` (`findById`, `findByProject`)

**Problem:**
The row → `Ticket` mapping logic (property renaming, `sub_state` cast) is duplicated verbatim between `findById` (lines 63-71) and `findByProject` (lines 97-105).

**Recommendation:**
Extract a private `mapRowToTicket` helper:

```ts
private mapRowToTicket(row: TicketRow): Ticket { ... }
```

### m2. No ticket-ID format validation at CLI boundary

**File:** `src/cli/commands/ticket-show.command.ts` (`action`)

**Problem:**
The `<id>` argument is passed through to the use case without format validation. Malformed input (e.g., empty string, special characters) reaches the database layer.

**Recommendation:**
Add a lightweight regex check at the CLI boundary (e.g., `/^[A-Za-z]+-[0-9]+$/`) and fail fast with an actionable message before calling the use case.

### m3. Error message lacks actionable guidance

**File:** `src/application/ticket-show.use-case.ts` (line 19)

**Problem:**
`"Ticket 'AEOS-1' not found."` doesn't tell the user what to do next. Per the checklist: *"Error messages include: what failed, the ticket ID, and what the user should do next."*

**Recommendation:**
Improve to: `"Ticket 'AEOS-1' not found. Run 'aeos ticket list' to see available tickets."`
(This becomes the `reason` string if M1 is adopted.)

---

## Positive Observations

1. **Correct hexagonal layering** — driving port in `domain/ports/driving/`, use case in `application/`, CLI adapter in `cli/commands/`, driven adapters in `infrastructure/`. Zero layer violations.
2. **Thorough test coverage** — 6 use-case tests and 5 CLI-command tests cover happy path, not-found, null subState, empty artifacts, and case-insensitive lookup.
3. **Path traversal prevention** — `listArtifacts` calls `validatePathComponent(ticketId)` before constructing filesystem paths, consistent with existing security pattern.
4. **Case-insensitive lookup** — `UPPER(id) = UPPER(?)` in SQL is a good UX choice; the CLI passes the raw user input and lets the repository handle normalisation.
5. **Deterministic output** — `listArtifacts` sorts filenames, ensuring stable CLI output.
6. **Existing test mocks updated** — `ticket-create.use-case.test.ts` and `ticket-list.use-case.test.ts` correctly updated with `findById` and `listArtifacts` stubs to satisfy the expanded port interfaces.
7. **Barrel exports updated** — `src/cli/index.ts` re-exports the new command registration function.

---

## Architecture Compliance

- [x] Dependency direction: `cli → application → domain ← infrastructure`
- [x] Domain layer purity: no I/O, no framework imports in `src/domain/`
- [x] Barrel exports updated for new modules (`src/cli/index.ts`)
- [x] Composition root (`container.ts`) updated with `TicketShowUseCase` wiring

---

## Verification Notes

- `npx tsc --noEmit` — **PASS**
- `npx eslint` (changed files) — **PASS** (0 warnings, 0 errors)
- `npx vitest run` — **SKIP** (vitest/rolldown requires Node 22+ `styleText`; unrelated to this changeset)
- Manual path check: `listArtifacts` validates `ticketId` via `validatePathComponent` ✓

---

## Draft PR Summary

**Summary:**
- Add `aeos ticket show <id>` CLI command to display a single ticket's details and artifacts
- Add `TicketShowPort` driving port, `TicketShowUseCase` application service, and CLI command registration
- Extend `TicketRepository` with `findById(projectId, ticketId)` — case-insensitive lookup via `UPPER()`
- Extend `ArtifactStore` with `listArtifacts(projectPath, ticketId)` — returns sorted filenames
- Implement `findById` in `SqliteTicketRepository` and `listArtifacts` in `FsArtifactStore`
- Wire new use case in `container.ts` and register command in `buildProgram()`
- Update existing test mocks to satisfy expanded port interfaces
- Add co-located tests for use case (6 tests) and CLI command (5 tests)

**Testing:**
- Unit tests: `ticket-show.use-case.test.ts`, `ticket-show.command.test.ts`
- TypeScript compilation: PASS
- ESLint: PASS

Please review this summary and confirm it matches the intended changes.
