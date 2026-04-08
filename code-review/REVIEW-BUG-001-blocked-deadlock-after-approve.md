# Code Review: BUG-001 — Deadlock after `ticket approve` (BLOCKED → READY fix)

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Uncommitted changes — `src/` only (task-file renames and README excluded)

---

## Overall Assessment

This changeset correctly resolves a **critical workflow deadlock** (BUG-001) where `ticket approve` set sub-state to `BLOCKED`, causing `ticket run` to short-circuit before reaching preflight. The fix introduces a new `READY` sub-state that semantically distinguishes "just arrived in column" from "blocked on human input."

The approach is sound: a 7th enum value `READY` is added to `SubState`, `ticket approve` sets `READY` instead of `BLOCKED`, and `ticket run`'s guard logic already allows `READY` to fall through to preflight. Tests are updated and pass. The change is minimal and well-scoped.

**Verdict:** Approve with minor changes

---

## Critical Issues

_None._

---

## Major Issues

_None._

---

## Minor Issues

### m1. Compensation logic sets `SIGNED_OFF` unconditionally on BACKLOG tickets

**File:** `src/application/ticket-approve.use-case.ts` (lines 76–79)

**Problem:**
When git commit fails for a BACKLOG ticket, the compensation block reverts the column via `transition(…, currentColumn)` — which resets sub-state to `null` for BACKLOG targets — then calls `setSubState(…, 'SIGNED_OFF')`. The `setSubState` call fails silently (BACKLOG guard rejects it) and its return value is not checked. The end state happens to be correct (BACKLOG, null sub-state) because `transition` already reset it, but the dead `setSubState` call is misleading.

**Recommendation:**
Guard the compensation `setSubState` call with `if (!isBacklog)`:

```typescript
} catch (err) {
  this.stateMachine.transition(projectId, ticketId, currentColumn);
  if (!isBacklog) {
    this.stateMachine.setSubState(projectId, ticketId, 'SIGNED_OFF');
  }
  throw err;
}
```

### m2. String literals used instead of `SubState` enum constants

**File:** `src/application/ticket-approve.use-case.ts` (lines 31, 59, 78), `src/application/ticket-run.use-case.ts` (lines 67, 70, 77)

**Problem:**
Use-case files use string literals (`'READY'`, `'SIGNED_OFF'`, `'BLOCKED'`, `'WORKING'`) instead of `SubState.READY`, `SubState.SIGNED_OFF`, etc. If the enum values ever change, these would silently become incorrect.

**Recommendation:**
Import `SubState` and use the enum constants. This is pre-existing and low-risk given `as const` guarantees, but worth standardising.

### m3. State-machine lifecycle test not updated for READY

**File:** `src/domain/services/state-machine.test.ts` (line 282)

**Problem:**
The lifecycle test documents the sequence `BLOCKED → WORKING → IN_REVIEW → SIGNED_OFF`. With `READY` now the canonical initial sub-state set by `approve`, the test doesn't cover the `READY → WORKING → IN_REVIEW → SIGNED_OFF` lifecycle.

**Recommendation:**
Add a companion test:
```typescript
it('sequences READY → WORKING → IN_REVIEW → SIGNED_OFF', () => { … });
```

### m4. Improved error message inconsistency — BACKLOG message omits `ticketId`

**File:** `src/application/ticket-run.use-case.ts` (line 54)

**Problem:**
The BACKLOG error message starts with `"Ticket is in BACKLOG…"` while every other error in the file includes the ticket ID: `"Ticket ${ticketId} is already DONE."`, `"Ticket ${ticketId} not found"`. This is inconsistent with the error-message conventions in the verification checklist ("error messages include: what failed, the ticket ID").

**Recommendation:**
Change to: `` `Ticket ${ticketId} is in BACKLOG. Run 'aeos ticket approve ${ticketId}' to advance to PRODUCT_SCOPING first.` ``

---

## Positive Observations

1. **Correct semantic modelling** — `READY` is the right abstraction. It separates "awaiting first run" from "blocked on human input," eliminating the deadlock without complex branching.
2. **Minimal blast radius** — Only the sub-state enum, approve use case, and run use case are touched. No infrastructure or schema changes needed since `sub_state` is stored as a free-text column validated at the domain layer.
3. **Test coverage for the fix** — New test `should proceed to preflight when ticket is READY` directly validates the bug scenario. Existing tests updated consistently.
4. **BACKLOG bypass in approve** — Allowing BACKLOG tickets to advance without sign-off is correct (no agent pipeline runs in BACKLOG). Well-commented.
5. **Actionable CLI error messages** — Error messages now tell the user exactly which command to run next (`Run 'aeos ticket run …'`, `Run 'aeos ticket approve …'`).
6. **CLI description addition** — The `buildProgram()` description is a nice onboarding touch.

---

## Architecture Compliance

- [x] Dependency direction: `cli → application → domain ← infrastructure`
- [x] Domain layer purity: `SubState` enum change has no I/O or framework imports
- [x] Barrel exports updated: N/A (no new modules)
- [x] Composition root: N/A (no new adapters/use cases)

---

## Verification Notes

- `npm run typecheck` — **PASS**
- `npm run lint` — **PASS**
- `npm test` — **PASS** (29 test files, 324 tests passing)

---

## Draft PR Summary

**Summary:**
- **Fix BUG-001:** `ticket approve` now sets sub-state to `READY` instead of `BLOCKED` after column advance, preventing the deadlock where `ticket run` refused to execute and `ticket answer` had no questions file
- Added `READY` as 7th value in `SubState` enum (`src/domain/model/sub-state.ts`)
- `ticket approve` allows BACKLOG tickets to advance without sign-off (BACKLOG has no agent pipeline)
- `ticket run` splits BACKLOG/DONE guards into separate blocks with actionable error messages
- Updated all affected tests; sub-state count test updated from 6 → 7
- Added CLI program description with getting-started guide

**Testing:**
- 324 tests passing (29 files)
- TypeScript strict-mode type check: PASS
- ESLint: PASS

Please review this summary and confirm it matches the intended changes.
