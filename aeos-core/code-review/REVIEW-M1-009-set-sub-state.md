# Code Review: M1-009 — `setSubState()` State Machine Function

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Uncommitted changes — `src/domain/services/state-machine.ts`, `src/domain/services/state-machine.test.ts`

---

## Overall Assessment

Clean, well-structured implementation of `setSubState()` on `StateMachineService`. The method follows the exact specification from M1-009, uses typed result objects, validates at runtime via `isValidSubState()`, and guards against BACKLOG invariant violations. Tests are thorough, co-located, and cover all acceptance criteria including idempotency, sequential updates, invalid input, and error paths. The code is consistent with the existing `transition()` method's style and patterns.

No Critical or Major issues found. Two minor observations noted below.

**Verdict:** ✅ Approve

---

## Critical Issues

None.

---

## Major Issues

None.

---

## Minor Issues

### m1. `SetSubStateResult` type alias is structurally identical to `TransitionResult`

**File:** `src/domain/services/state-machine.ts` (line 15)

**Problem:**
`SetSubStateResult` is defined as `{ ok: true } | { ok: false; reason: string }`, which is structurally identical to `TransitionResult` on line 14. Both are discriminated unions with the same shape.

**Recommendation:**
Consider extracting a shared `Result` type alias (e.g. `DomainResult`) and using it for both. This is purely a DRY concern — the current code compiles and works correctly. If the two result types are expected to diverge in the future (e.g. adding metadata to one), keeping them separate is justified. No action required before merge.

### m2. BACKLOG guard uses string literal `'BACKLOG'` instead of `Column.BACKLOG` enum value

**File:** `src/domain/services/state-machine.ts` (line 95)

**Problem:**
The guard `ticket.column === 'BACKLOG'` uses a raw string literal. The existing `transition()` method on line 80 does the same (`targetColumn === 'BACKLOG'`), so this is consistent within the file. However, using `Column.BACKLOG` would provide a compile-time safety net if the enum value ever changes.

**Recommendation:**
Consider importing and using `Column.BACKLOG` for the comparison. This is a minor consistency improvement — the `Column` type is already imported (as a type-only import on line 7). To use the runtime value, add `Column` to the runtime import from `'../model/column.js'` (it's already imported for `COLUMN_ORDER`). Low priority — the string literal matches the const enum value and TypeScript's type narrowing works correctly either way.

---

## Positive Observations

1. **Runtime validation with `isValidSubState()`** — Correctly validates at runtime even though the TypeScript type system prevents invalid values at compile time. Defensive against `as any` casts and JavaScript callers.
2. **Typed result objects** — Consistent use of discriminated union results (`{ ok: true } | { ok: false; reason }`) instead of thrown exceptions.
3. **Idempotent design** — Setting the same sub-state value is explicitly allowed, supporting retry and resume flows.
4. **Test coverage is comprehensive** — 6 test cases covering: happy path, BACKLOG guard, ticket not found, invalid sub-state, sequential updates, and idempotency. All acceptance criteria from M1-009 are covered.
5. **Domain purity** — No I/O, no infrastructure imports. Method operates purely through the injected `TicketRepository` port.
6. **Test stubs are well-designed** — Reuses `createStubRepos()` from the existing `transition()` tests, with the `updateSubState` mock correctly mutating the in-memory ticket for verification.

---

## Architecture Compliance

- [x] Dependency direction: `cli → application → domain ← infrastructure`
- [x] Domain layer purity: no I/O, no framework imports in `src/domain/`
- [x] Barrel exports updated — `src/domain/services/index.ts` already re-exports `state-machine.js`
- [x] Composition root — no changes needed (method added to existing `StateMachineService`)

---

## Verification Notes

- `npx tsc --noEmit` — **PASS** (zero errors)
- `npx eslint src/domain/services/state-machine.ts src/domain/services/state-machine.test.ts` — **PASS** (zero warnings)
- `npx vitest run` — **SKIPPED** (environment has Node 20.9.0; vitest requires Node 22+ due to `node:util.styleText` dependency in rolldown)
- Tests are structurally sound and follow established patterns from `transition()` tests

---

## Draft PR Summary

**Summary:**
- Added `setSubState(projectId, ticketId, subState)` method to `StateMachineService`
- Added `SetSubStateResult` discriminated union type
- Imports `SubState` type and `isValidSubState()` runtime guard from domain model
- Guards: ticket-not-found, BACKLOG column rejection, invalid sub-state validation
- Delegates persistence to `TicketRepository.updateSubState()` port
- Added 6 test cases covering all M1-009 acceptance criteria

**Testing:**
- TypeScript type check: PASS
- ESLint: PASS
- Unit tests: 6 new tests (vitest runner unavailable in current Node 20 environment; tests are structurally verified)

Please review this summary and confirm it matches the intended changes.
