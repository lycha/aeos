# Code Review: M1-009 — `setSubState(ticketId, subState)` State Machine Function

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Task specification document — `docs/tasks/M1-009-set-sub-state.md`

---

## Overall Assessment

The task is correctly scoped as the simpler counterpart to `transition()` — a direct DB update with no column movement. The function signature, composite key lookup, and `SetSubStateResult` discriminated union are all sound. The "no transition validation" decision is appropriate for v1.

However, there is one Major issue: the function does not guard against calling `setSubState()` on a BACKLOG ticket, which would violate the data invariant that BACKLOG tickets have `sub_state = NULL` (established in M1-003, enforced in M1-008's BACKLOG reset). Two Minor issues cover a missing dependency on M1-007's `isValidSubState()` for runtime validation and undocumented behaviour when setting the same sub-state twice (idempotency).

**Verdict:** Approve with changes

---

## Major Issues

### M1. No guard against setting sub-state on BACKLOG tickets

**File:** `docs/tasks/M1-009-set-sub-state.md` — Implementation steps

**Problem:**
The implementation says "No transition validation needed — sub-state changes are always allowed within the current column." This is true for non-BACKLOG columns, but BACKLOG is a special case.

The data invariant across the codebase is:
- M1-003: BACKLOG tickets are inserted with `sub_state = null`
- M1-004: BACKLOG tickets display `—` in the SUB-STATE column (null rendering)
- M1-008 (updated): `transition()` resets `sub_state = NULL` when the target is BACKLOG
- System design (Section 2.1): "Backlog is human-only. No agent runs."

If a caller accidentally calls `setSubState(db, projectId, ticketId, 'WORKING')` on a BACKLOG ticket (e.g. due to a bug in orchestration logic), the invariant is silently violated. The ticket would show `WORKING` in the BACKLOG column, which is semantically wrong — no agent runs in BACKLOG.

No current caller does this intentionally, but the function is a low-level primitive that will be called from many places (M2-009 preflight, M2-010 answer, M2-011 ticket run, M2-012 approve). A defensive guard prevents a class of bugs.

**Impact:**
A BACKLOG ticket with a non-null sub-state would confuse the operator, break the `ticket list` null rendering logic (M1-004), and contradict the system design's "Backlog is human-only" rule.

**Recommendation:**
Add a guard between steps 1 and 2:
> 1b. If the ticket's current `column` is `BACKLOG`, return `{ ok: false, reason: "Cannot set sub-state on a BACKLOG ticket" }`

Add a corresponding acceptance criterion:
> Given a ticket in BACKLOG, when calling `setSubState(db, projectId, ticketId, 'WORKING')`, then result is `{ ok: false, reason: "Cannot set sub-state on a BACKLOG ticket" }`

---

## Minor Issues

### m1. No runtime validation of sub-state value

**File:** `docs/tasks/M1-009-set-sub-state.md` — Implementation

**Problem:**
The `subState` parameter is typed as `SubState` at compile time, which prevents invalid strings in TypeScript callers. However, there is no runtime validation. If the function is called from:
- A JavaScript caller (no type checking)
- A test with `as any` cast
- A future CLI command that takes user input and passes it through

...an invalid string like `'RUNNING'` (not in the SubState enum) could be written to the DB.

M1-007 (updated) exports `isValidSubState()` specifically for this purpose, but M1-009 doesn't reference it.

**Recommendation:**
Add to step 1: "Validate `subState` against `isValidSubState()` from M1-007. If invalid, return `{ ok: false, reason: 'Invalid sub-state: <value>' }`." Add M1-007 to Dependencies if not already there (it is listed, but the note should reference `isValidSubState()` specifically).

---

### m2. Idempotent behaviour undocumented — setting the same sub-state twice

**File:** `docs/tasks/M1-009-set-sub-state.md` — Acceptance Criteria

**Problem:**
AC #3 covers "calling `setSubState()` again with a different sub-state" but does not cover setting the *same* sub-state. Is this idempotent (returns `{ ok: true }` and updates `updated_at`) or a no-op (returns `{ ok: true }` without touching `updated_at`)?

The downstream callers don't currently rely on either behaviour, but `ticket run` (M2-011) sets `WORKING` at step 4, and a retry flow could call `setSubState(WORKING)` again. If `updated_at` doesn't update, the audit trail loses the retry timestamp.

**Recommendation:**
Add a note: "Setting the same sub-state as the current value is allowed and treated as an update (updates `updated_at`). This supports retry and resume flows." Add an AC: "Given a ticket already in `WORKING`, when calling `setSubState(db, projectId, ticketId, 'WORKING')`, then result is `{ ok: true }` and `updated_at` is refreshed."

---

## Positive Observations

1. **Separation from `transition()`** — correct. Sub-state changes and column transitions are independent operations with different validation rules.
2. **`SetSubStateResult` discriminated union** — consistent with `TransitionResult` pattern from M1-008. Structured errors throughout the state machine.
3. **"No transition validation" decision** — appropriate for v1. Sub-state transition rules (e.g. WORKING → IN_REVIEW but not WORKING → SIGNED_OFF) are a v2 concern and correctly deferred in Out of Scope.
4. **Composite key** handling matches M1-006 schema.

---

## Verification Notes

- After M1 fix: create a ticket (BACKLOG, sub_state NULL), then call `setSubState(db, proj, 'AEOS-1', 'WORKING')`. Verify it returns `{ ok: false }` and the DB still shows `sub_state = NULL`.
- After m1 fix: call `setSubState(db, proj, 'AEOS-1', 'INVALID' as any)` and verify it returns `{ ok: false }`.
- After m2 fix: set a ticket to `WORKING`, call `setSubState(WORKING)` again, verify `updated_at` changed.
- Cross-reference M1-010: update state machine tests to include BACKLOG guard test and same-sub-state idempotency test.

---

## Draft PR Summary

**Scope:** M1-009 task specification document
**Changes needed before implementation:**

- **Step 1b (new):** Add BACKLOG guard — reject `setSubState()` on tickets in the BACKLOG column. Add AC.
- **Step 1 (augment):** Add runtime validation via `isValidSubState()` from M1-007.
- **AC (new):** Same-sub-state idempotency — setting the current sub-state again returns `{ ok: true }` and refreshes `updated_at`.
- **Technical Notes:** Document idempotent behaviour for same-sub-state calls.
