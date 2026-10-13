# Code Review: M1-008 — `transition(ticketId, targetColumn)` State Machine Function

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Uncommitted changes implementing M1-008 transition function
**Files changed:** 8 modified, 1 new (154 insertions, 6 deletions)

---

## Overall Assessment

The implementation correctly enforces forward-adjacent-only and backward-any column transitions, records audit trail rows via `TransitionRepository`, resets sub-state on BACKLOG entry, and uses constructor-injected ports with zero infrastructure imports in the domain layer. The hexagonal architecture is well respected. Tests are thorough with good coverage of edge cases.

Two Minor issues and one Nit were found. No Critical or Major issues.

**Verdict:** ✅ Approve with suggestions

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0     |
| Major    | 0     |
| Minor    | 2     |
| Nit      | 1     |

---

## Findings

### m1. `new Date().toISOString()` called in domain service — impure, untestable timestamp

**Severity:** Minor
**File:** `src/domain/services/state-machine.ts` — line 76
**Function:** `StateMachineService.transition()`

**Problem:**
The `at` field of the transition record is set via `new Date().toISOString()` directly inside the domain service. This makes the timestamp non-deterministic and impossible to assert in tests. The test file does not assert the `at` field at all, confirming the gap. Additionally, `SqliteTicketRepository.updateColumn()` and `updateSubState()` each call `new Date().toISOString()` independently (lines 98, 104), producing slightly different timestamps for what should be a single atomic operation.

**Impact:**
- Tests cannot verify the exact timestamp recorded in the transition row.
- The ticket's `updated_at` and the transition's `at` may differ by milliseconds.
- Future audit/reporting queries that join `transitions.at` with `tickets.updated_at` may show inconsistencies.

**Recommendation:**
Inject a `Clock` port (or accept an optional `now?: string` parameter) so tests can supply a deterministic timestamp. Alternatively, compute the ISO string once at the top of `transition()` and pass it to both repo calls:

```typescript
const now = new Date().toISOString();
this.transitionRepo.record({ ...fields, at: now });
this.ticketRepo.updateColumn(projectId, ticketId, targetColumn, now);
```

This is a v2 improvement — acceptable to ship as-is for M1.

---

### m2. Misnumbered inline comments — steps skip from 1 to 3 to 5

**Severity:** Minor
**File:** `src/domain/services/state-machine.ts` — lines 34, 42, 63
**Function:** `StateMachineService.transition()`

**Problem:**
The inline step comments are numbered 1, 3, 3, 5 — step 2 and step 4 are missing, and step 3 appears twice (lines 34 and 42). This creates confusion when referencing steps in reviews or documentation.

**Impact:**
Readability and maintainability. When the task spec references "step 3" or "step 5", the code comments don't align.

**Recommendation:**
Renumber to sequential 1–5:
- Line 27: `// 1. Load ticket`
- Line 34: `// 2. Same column — illegal`
- Line 42: `// 3. Validate transition legality`
- Line 63: `// 4. Legal transition — execute`
- Line 80: `// 5. Update the ticket's column`

---

### n1. Dead-code guard: `else if (!isBackward)` is unreachable

**Severity:** Nit
**File:** `src/domain/services/state-machine.ts` — lines 54–59
**Function:** `StateMachineService.transition()`

**Problem:**
After the same-column check on line 35 eliminates `currentIndex === targetIndex`, and the `isForward` branch handles `targetIndex > currentIndex`, the remaining case is always `targetIndex < currentIndex` (backward). The `else if (!isBackward)` guard on line 54 is dead code — `!isBackward` can never be true at that point.

**Impact:**
No runtime impact. Slightly misleading to readers who might think there's a fourth case.

**Recommendation:**
Remove the dead branch or convert to a TypeScript `satisfies never` exhaustiveness check if you want defensive coding. Low priority.

---

## Positive Observations

1. **Clean hexagonal layering.** `StateMachineService` depends only on domain port interfaces (`TicketRepository`, `TransitionRepository`). No `BetterSqlite3` or infrastructure types leak into the domain. ✅
2. **Discriminated union result type.** `TransitionResult = { ok: true } | { ok: false; reason: string }` follows the project's typed-result pattern (no thrown exceptions). ✅
3. **Correct BACKLOG sub-state reset.** The data invariant (BACKLOG tickets have `null` sub-state) is enforced at the domain service level, not left to callers. ✅
4. **Tests use stub ports, not SQLite.** `state-machine.test.ts` injects plain object stubs — domain tests have zero infrastructure dependency. ✅
5. **Comprehensive test coverage.** 13 test cases across 6 `describe` groups covering not-found, same-column, forward-adjacent, forward-skip, backward-one, backward-multi, backward-to-BACKLOG, backward-from-DONE, DONE-terminal, transition-record sub-state, comment, and null-comment. ✅
6. **Backward transitions are unrestricted.** Correctly implements the spec: any prior column is reachable, supporting the `sendback` rework flow (PRD FR-12). ✅
7. **Existing test mocks updated.** All three use-case test files (`ticket-create`, `ticket-list`, `ticket-show`) correctly add `updateColumn` and `updateSubState` stubs to `TicketRepository` mocks. ✅
8. **`SqliteTransitionRepository`** correctly implements `TransitionRepository` port with parameterised query. ✅

---

## Architecture & Layer Compliance

| Check | Status |
|-------|--------|
| Domain imports only domain types | ✅ |
| Dependency direction: cli → app → domain ← infra | ✅ |
| No `any` usage | ✅ |
| ESM `.js` extensions in imports | ✅ |
| No CommonJS patterns | ✅ |
| Typed results (no thrown exceptions) | ✅ |
| Ports defined in domain, adapters in infrastructure | ✅ |

---

## Files Reviewed

| File | Verdict |
|------|---------|
| `src/domain/services/state-machine.ts` | ✅ Approve (m1, m2, n1) |
| `src/domain/services/state-machine.test.ts` | ✅ Approve |
| `src/domain/ports/driven/ticket-repository.port.ts` | ✅ Approve |
| `src/domain/ports/driven/transition-repository.port.ts` | ✅ Approve |
| `src/infrastructure/persistence/sqlite-ticket.repository.ts` | ✅ Approve (m1 — timestamp) |
| `src/infrastructure/persistence/sqlite-transition.repository.ts` | ✅ Approve |
| `src/application/ticket-create.use-case.test.ts` | ✅ Approve |
| `src/application/ticket-list.use-case.test.ts` | ✅ Approve |
| `src/application/ticket-show.use-case.test.ts` | ✅ Approve |

---

## Draft PR Summary

**Title:** feat(M1-008): implement `transition()` state machine function

**Description:**
Implements the core `StateMachineService.transition()` method that enforces forward-adjacent-only and backward-any column transitions. Records audit trail rows in `TransitionRepository`, resets sub-state to null on BACKLOG entry, and returns typed `TransitionResult` discriminated unions (no thrown exceptions).

**Changes:**
- **Domain service:** `StateMachineService` class with `transition()` method
- **Domain ports:** `TransitionRepository` port + `TransitionRecord` interface; `TicketRepository` extended with `updateColumn()` and `updateSubState()`
- **Infrastructure adapters:** `SqliteTransitionRepository` (new); `SqliteTicketRepository` extended with `updateColumn()` and `updateSubState()`
- **Tests:** 13 unit tests covering all transition rules using stub ports; existing use-case test mocks updated
