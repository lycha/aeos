# Code Review: M1-008 — `transition(ticketId, targetColumn)` State Machine Function

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Task specification document — `docs/tasks/M1-008-transition-function.md`

---

## Overall Assessment

The task correctly models the core state machine operation — column transition with validation, DB persistence in a single SQLite transaction, and structured error returns. The composite key `(project_id, id)`, the `TransitionResult` discriminated union, and the explicit "no sub-state management here" separation are all sound design choices.

However, there are three Major issues. The transition rules only allow forward-only adjacent moves plus a BACKLOG reset, but the PRD (FR-12, Section 5.9) and system design (Section 2.1) both require leftward movement to *any* prior column — not just BACKLOG. The function signature omits the `comment` parameter required by FR-24, leaving the `comment` column in the `transitions` table (M1-006) permanently NULL. And the function does not reset `sub_state` to `NULL` on BACKLOG resets, which means a ticket sent back to BACKLOG would retain its previous sub-state (e.g. `SIGNED_OFF`) instead of `NULL`. Three Minor issues cover a missing terminal-state test for DONE, undocumented caller responsibility for sub-state, and the `from_sub_state`/`to_sub_state` transition fields not being populated.

**Verdict:** Approve with changes

---

## Major Issues

### M1. Leftward movement restricted to BACKLOG only — contradicts PRD and system design

**File:** `docs/tasks/M1-008-transition-function.md` — Rule 3

**Problem:**
Rule 3 states:
> Legal transitions: target must be exactly the **next** column in `COLUMN_ORDER` (forward-only, no skipping)
> Exception: any column → `BACKLOG` is allowed (reset/unblock flow)

The PRD says (Section 5.8): "Move cards — forward (to next column) or **backward (to any prior column)** at any time."

Section 5.9 elaborates: "Cards can move left at any time. When a card moves left: It returns to the target column in a 'rework' state."

FR-12: "Operator can move cards forward or backward at any time with an optional transition comment."

The system design (Section 2.1): "Leftward movement (rework) is normal and supported."

The CLI surface includes `aeos ticket sendback` which needs to move a ticket to any prior column — e.g., from TECH_SPEC back to ARCH_SPIKE (one column back) or to PRODUCT_SCOPING (two columns back). Under the current rules, `sendback` from TECH_SPEC to ARCH_SPIKE would be rejected because the only backward exception is BACKLOG.

**Impact:**
The `sendback` command cannot function. Rework flows — the primary mechanism for quality iteration — are blocked. The operator can only reset to BACKLOG, losing all forward progress context that a targeted sendback preserves.

**Recommendation:**
Replace rule 3 with:
1. **Forward:** target must be exactly the next column in `COLUMN_ORDER` (adjacent only, no skipping)
2. **Backward:** target can be any column that appears *before* the current column in `COLUMN_ORDER` (any prior column, including BACKLOG)
3. **Same column:** illegal (no-op transition)
4. **From DONE:** only backward movement is allowed (DONE has no forward target)

---

### M2. Missing `comment` parameter — `transitions.comment` column always NULL

**File:** `docs/tasks/M1-008-transition-function.md` — Function signature

**Problem:**
The function signature is:
```typescript
transition(db, projectId, ticketId, targetColumn): TransitionResult
```

FR-24 requires: "Every card move (forward or backward) presents a transition comment panel; comment committed as `[human][transition-note]`."

The `transitions` table in M1-006 (updated) has a `comment TEXT` column specifically for this. The CLI `sendback` command surface is `aeos ticket sendback <id> "reason"` — the reason string must be persisted.

Without a `comment` parameter, the transition record's `comment` column will always be `NULL`. The audit trail — a core system requirement — loses the operator's reasoning for every transition.

**Impact:**
`aeos ticket sendback T001 "Scope too broad"` cannot persist the reason. The transition history becomes a sequence of column moves with no context. When the worker agent receives rework context (PRD Section 5.9: "the reason for the return"), there is nowhere to read it from.

**Recommendation:**
Add an optional `comment` parameter:
```typescript
export function transition(
  db: Database,
  projectId: string,
  ticketId: string,
  targetColumn: Column,
  comment?: string,
): TransitionResult
```
Insert the comment into the `transitions` row. Forward approvals typically have no comment (parameter omitted); sendbacks always have one.

---

### M3. Sub-state not reset to NULL on BACKLOG reset

**File:** `docs/tasks/M1-008-transition-function.md` — Technical Notes

**Problem:**
The Technical Notes say: "Do not update `sub_state` in this function — that is the responsibility of `setSubState()`."

This creates a gap for backward transitions (including BACKLOG reset). When a ticket is sent back to BACKLOG:
- M1-003 established that BACKLOG tickets have `sub_state = NULL`
- But `transition()` only updates `column` and `updated_at`
- The ticket arrives in BACKLOG with its old sub-state (e.g. `SIGNED_OFF` or `IN_REVIEW`)

M2-012 (`ticket approve`) handles forward transitions by calling `setSubState(db, projectId, ticketId, 'BLOCKED')` after `transition()`. But there is no corresponding task for `sendback` that resets sub-state. The gap between "transition doesn't touch sub_state" and "caller must remember to reset it" is a bug waiting to happen.

For BACKLOG specifically, `setSubState()` requires a `SubState` value — it does not accept `null` (the parameter type is `SubState`, not `SubStateOrNull`). So the caller *cannot* set sub-state to null using `setSubState()`, but BACKLOG tickets must have null sub-state.

**Impact:**
A ticket sent back to BACKLOG retains its previous sub-state. `aeos ticket list` would show a BACKLOG ticket with `SIGNED_OFF` sub-state, which is semantically wrong. M1-004's null sub-state display logic (`—`) would never trigger for sent-back tickets.

**Recommendation:**
Add a rule to the transition function: "When the target column is `BACKLOG`, set `sub_state = NULL` in the same transaction." This is the one exception to "don't touch sub_state" — BACKLOG is a special column with no agent lifecycle, and its null sub-state is a data invariant, not a caller decision.

For non-BACKLOG backward transitions, document that the caller must call `setSubState()` after `transition()` to set the appropriate initial sub-state for the target column.

---

## Minor Issues

### m1. Missing AC and test for transition from DONE (terminal state)

**File:** `docs/tasks/M1-008-transition-function.md` — Acceptance Criteria

**Problem:**
DONE is the last column in `COLUMN_ORDER`. There is no forward target. The current rule implicitly prevents forward transition (no next column exists), but this is not tested. Additionally, DONE → BACKLOG (reset from terminal state) should be tested as a valid backward move.

M1-010 (state machine tests) includes "Reset to BACKLOG from any column passes" but doesn't explicitly mention DONE.

**Recommendation:**
Add two ACs:
- "Given a ticket in `DONE`, when calling `transition(db, projectId, id, 'PRODUCT_SCOPING')`, then result is `{ ok: false }` (no forward from DONE)"
- "Given a ticket in `DONE`, when calling `transition(db, projectId, id, 'BACKLOG')`, then result is `{ ok: true }` (backward from DONE allowed)"

---

### m2. Caller responsibility for sub-state after transition is undocumented

**File:** `docs/tasks/M1-008-transition-function.md` — Technical Notes

**Problem:**
The Technical Note says "Do not update sub_state in this function" but doesn't specify what the caller *should* do. M2-012 happens to call `setSubState(BLOCKED)` after approval, but this is implicit knowledge in a different task. Future callers (sendback, auto-advance) may forget.

**Recommendation:**
Add to Technical Notes: "After a successful forward transition, callers must set the ticket's sub-state for the new column (e.g. `BLOCKED` for manual-advance columns). After a backward transition to a non-BACKLOG column, callers must set the appropriate sub-state. `transition()` handles only the BACKLOG case (resets sub_state to NULL)."

---

### m3. `from_sub_state` / `to_sub_state` in transitions table not populated

**File:** `docs/tasks/M1-008-transition-function.md` — Step 5

**Problem:**
The M1-006 `transitions` table (updated) includes `from_sub_state TEXT` and `to_sub_state TEXT` columns. Step 5 inserts `{ ticket_id, project_id, from_column, to_column, at }` but does not include `from_sub_state` or `to_sub_state`. These columns will always be NULL, reducing the audit trail's value.

**Recommendation:**
Read the ticket's current `sub_state` before the transition and record it as `from_sub_state`. Set `to_sub_state` to `NULL` for BACKLOG resets (since the function handles that case). For non-BACKLOG transitions, `to_sub_state` can be `NULL` in the transition record (the caller sets it via `setSubState()` afterwards — a subsequent audit entry). Document this explicitly.

---

## Positive Observations

1. **`TransitionResult` discriminated union** — returning `{ ok: false, reason }` instead of throwing is the right pattern for expected validation failures. Keeps control flow explicit.
2. **Single SQLite transaction** (rule 6) — correct for atomic DB consistency between `tickets` update and `transitions` insert.
3. **Separation from sub-state management** — the "don't touch sub_state" principle is directionally correct. Only BACKLOG needs an exception (M3 above).
4. **Composite key handling** — `(project_id, id)` filtering in all queries matches the M1-006 schema correctly.
5. **Out of Scope** correctly defers sub-state management and approval flow.

---

## Verification Notes

- After M1 fix: verify that `transition(db, 'proj', 'T-1', 'ARCH_SPIKE')` succeeds when the ticket is in `TECH_SPEC` (backward one column). Verify that `transition(db, 'proj', 'T-1', 'IMPLEMENTATION')` fails from `TECH_SPEC` (skip forward).
- After M2 fix: verify that `transition(db, 'proj', 'T-1', 'BACKLOG', 'Scope too broad')` stores the comment in the `transitions` row.
- After M3 fix: verify that a ticket sent to BACKLOG has `sub_state = NULL` in the DB after the transition completes.
- Cross-reference M1-010: update the test plan to include backward transition tests (not just reset-to-BACKLOG).

---

## Draft PR Summary

**Scope:** M1-008 task specification document
**Changes needed before implementation:**

- **Rule 3:** Expand legal transitions to allow backward movement to any prior column (not just BACKLOG). Forward remains adjacent-only. Same-column transitions are illegal.
- **Signature:** Add optional `comment?: string` parameter. Insert into `transitions.comment` column.
- **BACKLOG reset:** Set `sub_state = NULL` in the same transaction when target is BACKLOG. Document this as the one exception to the "don't touch sub_state" rule.
- **ACs:** Add tests for DONE (terminal state — no forward, backward allowed). Add tests for backward transitions to non-BACKLOG columns.
- **Technical Notes:** Document caller responsibility for sub-state after non-BACKLOG transitions. Document `from_sub_state` population in transition records.

Please review this summary and confirm it matches the intended changes before updating the task document.
