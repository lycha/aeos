# Code Review — M1-010 State Machine Test Rewrite

**Reviewer:** Augment Agent (Staff SWE)
**Date:** 2026-04-07
**Scope:** `src/domain/services/state-machine.test.ts` (uncommitted changes)
**Verdict:** ✅ **Approve** — No Critical or Major issues. Minor and informational findings only.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0     |
| Major    | 0     |
| Minor    | 3     |
| Info     | 3     |

The change rewrites the `StateMachineService` test suite from vi.fn()-based mock objects to typed in-memory stub classes (`StubTicketRepository`, `StubTransitionRepository`). This is a significant improvement: the stubs implement the port interfaces directly, which means TypeScript will catch contract drift at compile time. The test suite also expands coverage to include cross-project isolation, sub-state lifecycle sequencing, DB integrity (transition row counting, `updated_at` refresh), and data-driven forward-transition tests via `it.each`.

---

## Findings

### m1. `StubTicketRepository.findById` returns a mutable reference

**Severity:** Minor
**File:** `src/domain/services/state-machine.test.ts` (lines 39–41)

**Problem:**
`findById` returns the object stored in the `Map` via `this.store.get(...)`. The `save()` method defensively copies with `{ ...ticket }`, but `findById` does not. This means callers that mutate the returned ticket (e.g. `updateColumn`, `updateSubState`) operate on the Map's stored reference directly. The production `SqliteTicketRepository` returns a new object from each `findById` call (row mapping), so the stub's aliasing behavior diverges from production semantics.

In practice this doesn't cause test failures because `updateColumn` and `updateSubState` also call `findById` + `this.store.set(...)`, so the re-set is redundant but not harmful. However, if a future test reads a ticket, mutates it directly, and then reads again expecting isolation, it would get a false positive.

**Recommendation:**
Return a shallow copy from `findById`:
```typescript
findById(projectId: string, ticketId: string): Ticket | null {
  const ticket = this.store.get(this.key(projectId, ticketId));
  return ticket ? { ...ticket } : null;
}
```

---

### m2. `updated_at` assertion in "DB integrity" is non-deterministic

**Severity:** Minor
**File:** `src/domain/services/state-machine.test.ts` (lines 338–349)

**Problem:**
The test asserts `expect(t2).not.toBe(t0)` to verify that `updated_at` was refreshed. The stub uses `new Date().toISOString()` which has millisecond resolution. If the test runs fast enough (sub-millisecond), `t1` or `t2` could equal `t0`, causing a flaky failure. The same pattern appears at line 316.

**Recommendation:**
Inject a clock or use `vi.useFakeTimers()` to control time deterministically. Alternatively, accept the flake risk as negligible on CI (ISO timestamps change every millisecond) — but document the assumption with a comment.

---

### m3. Unused import `SubStateOrNull`

**Severity:** Minor
**File:** `src/domain/services/state-machine.test.ts` (line 3)

**Problem:**
`type SubStateOrNull` is imported but never used directly in the test file. The `seedTicket` helper's `subState` parameter is typed inline as `SubStateOrNull` in the partial, but that type comes from the `Ticket` interface (which is imported). The explicit import of `SubStateOrNull` is redundant.

**Recommendation:**
Remove the unused type import:
```typescript
import { SubState } from '../model/sub-state.js';
```
Or keep it if it serves as documentation that the parameter accepts `null`. Low priority.

---

### i1. Data-driven forward tests don't verify the ticket actually moved

**Severity:** Info
**File:** `src/domain/services/state-machine.test.ts` (lines 131–138)

**Problem:**
The `it.each(ADJACENT_PAIRS)` test only checks `{ ok: true }` but does not verify that the ticket's column was actually updated in the repository. The old tests used `expect(ticketRepo.updateColumn).toHaveBeenCalledWith(...)` to confirm the side effect. Since the new stubs don't use mocks, the equivalent assertion would be to read the ticket back and verify its column.

**Recommendation:**
Consider adding a read-back assertion:
```typescript
const ticket = ticketRepo.findById(PROJECT_ID, 'T-1')!;
expect(ticket.column).toBe(to);
```
Not required — the `{ ok: true }` result combined with the service implementation is sufficient — but it would make the test self-documenting.

---

### i2. No negative test for `transition()` on a non-existent ticket

**Severity:** Info
**File:** `src/domain/services/state-machine.test.ts`

**Problem:**
The old test suite had an explicit "ticket not found" test for `transition()`. The new suite has it for `setSubState` (line 282) but not for `transition()`. The behavior is covered by the `StateMachineService` implementation (`if (!ticket) return { ok: false, reason: 'Ticket not found' }`), but there's no test exercising it.

**Recommendation:**
Add a test in the "illegal transitions" block:
```typescript
it('rejects transition on a non-existent ticket', () => {
  const result = stateMachine.transition(PROJECT_ID, 'NOPE-1', Column.PRODUCT_SCOPING);
  expect(result).toEqual({ ok: false, reason: 'Ticket not found' });
});
```

---

### i3. `ADJACENT_PAIRS` is built at module scope outside `describe`

**Severity:** Info
**File:** `src/domain/services/state-machine.test.ts` (lines 126–129)

**Problem:**
The `ADJACENT_PAIRS` array is constructed inside the `describe('legal forward transitions', ...)` callback but outside any `it()`/`beforeEach()`. Vitest collects `it.each` parameters eagerly during suite registration, so this is correct — `COLUMN_ORDER` is a static constant. However, the imperative loop (`for (let i = ...)`) is unusual in test files where declarative data is preferred.

**Recommendation:**
A more idiomatic approach:
```typescript
const ADJACENT_PAIRS = COLUMN_ORDER.slice(0, -1).map(
  (col, i) => [col, COLUMN_ORDER[i + 1]] as [Column, Column],
);
```
Purely stylistic — no functional impact.

---

## Positive Observations

1. **Stub classes implement port interfaces** — `StubTicketRepository implements TicketRepository` ensures compile-time contract enforcement. If the port interface changes, the stub must be updated or the test won't compile. This is a major improvement over `vi.fn()` mocks which silently accept any call.

2. **Cross-project isolation tests** — New tests at lines 355–381 verify that tickets with the same ID but different `projectId` are truly independent. This exercises the composite key logic that's critical for multi-tenant correctness.

3. **Comprehensive sub-state lifecycle** — The sequential BLOCKED → WORKING → IN_REVIEW → SIGNED_OFF test (lines 262–280) validates the full sub-state progression in a single test, catching ordering regressions.

4. **Clean `beforeEach` setup** — Shared `ticketRepo`, `transitionRepo`, and `stateMachine` instances are reset in `beforeEach`, eliminating state leakage between tests. The old tests had per-test `setup()` calls which were correct but more verbose.

5. **`seedTicket` helper with typed partial** — The helper accepts only the fields relevant to tests (`id`, `projectId`, `column`, `subState`) rather than `Partial<Ticket>`, which prevents tests from accidentally setting `createdAt`/`updatedAt` to non-standard values.

6. **Removed `vi` import dependency** — The file no longer imports `vi` from vitest, reflecting the shift from mock-based to stub-based testing. Clean separation of concerns.

7. **Section banners** — The `// =========` separators with section names improve navigability in a 384-line file.

---

## Draft PR Summary

> **Rewrite state-machine tests: stubs over mocks**
>
> Replaces `vi.fn()`-based mock objects with typed in-memory stub classes that implement `TicketRepository` and `TransitionRepository` port interfaces. This gives compile-time contract enforcement — if a port method signature changes, the test fails to build rather than silently accepting stale mocks.
>
> **New coverage:**
> - Data-driven forward transitions via `it.each(ADJACENT_PAIRS)` — all 8 adjacent column pairs
> - Cross-project isolation (composite key `projectId:ticketId`)
> - Sub-state lifecycle sequencing (BLOCKED → WORKING → IN_REVIEW → SIGNED_OFF)
> - DB integrity: transition row counting, `updated_at` refresh verification
> - Backward transition sub-state retention vs. BACKLOG reset
>
> **Removed:** `vi` import, `makeTicket()` factory, `createStubRepos()` factory
> **Added:** `StubTicketRepository`, `StubTransitionRepository`, `seedTicket()` helper
>
> Net: +313 / −170 lines (test-only, no production code changes)
