# Code Review: M1-007 — Column and Sub-State Enums

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Task specification document — `docs/tasks/M1-007-column-substate-enums.md`

---

## Overall Assessment

The task is clean, focused, and correctly structured. The `as const` + value type pattern is the right TypeScript idiom for string enums backed by a database. `COLUMN_ORDER`, `isValidColumn()`, and the type guards are exactly what the downstream state machine tasks need.

There is one Major issue: the `SubState` type accepts only the six defined values but the M1-003 and M1-006 reviews established that `sub_state` is nullable — BACKLOG tickets have `null` in the DB. `setSubState()` in M1-009 uses the `SubState` type, but nothing in this enum file acknowledges that the DB column can be `null`. Callers that read from the DB and type the result as `SubState` will get a type error on `null` rows. Two Minor issues cover a missing `isValidSubState()` type guard (M2-012 and M7-005 need to validate sub-state values) and a missing `COLUMN_ORDER` readonly tuple type (which would give compile-time index safety).

**Verdict:** Approve with changes

---

## Major Issues

### M1. `SubState` type does not account for nullable `sub_state` in the DB

**File:** `docs/tasks/M1-007-column-substate-enums.md` — SubState type definition

**Problem:**
The M1-006 review (already applied) changed `sub_state` to `TEXT DEFAULT NULL` in the DB schema. The M1-003 review (already applied) inserts BACKLOG tickets with `sub_state: null`. M1-004 and M1-005 both display `—` when `sub_state` is `null`.

The `SubState` type defined here is:
```typescript
export type SubState = typeof SubState[keyof typeof SubState];
// = 'BLOCKED' | 'WORKING' | 'INTERRUPTED' | 'FAILED' | 'IN_REVIEW' | 'SIGNED_OFF'
```

This type does not include `null`. Every function that reads a ticket row from the DB and types `sub_state` as `SubState` will get a TypeScript error when the value is `null`. The alternatives are:
1. Every caller writes `SubState | null` manually (error-prone, inconsistent)
2. This file exports a nullable alias

**Impact:**
Type errors in M1-004, M1-005, M1-009, M2-011, M2-012, and every other module that reads `sub_state` from the DB. Developers will cast away the `null` or use `as SubState`, hiding real bugs.

**Recommendation:**
Add a nullable alias export:
```typescript
/** Sub-state value as stored in the DB — null for BACKLOG tickets. */
export type SubStateOrNull = SubState | null;
```

Use `SubState` for function parameters where `null` is never valid (e.g. `setSubState()` — you never deliberately set sub-state to null). Use `SubStateOrNull` for DB row types and display functions where `null` is a valid value.

---

## Minor Issues

### m1. Missing `isValidSubState()` type guard

**File:** `docs/tasks/M1-007-column-substate-enums.md` — utility functions

**Problem:**
The task exports `isValidColumn()` but not a corresponding `isValidSubState()`. M2-012 (`ticket approve`) validates that `sub_state === 'SIGNED_OFF'` before advancing. M7-005 (error messages) audits every `setSubState(FAILED)` call. M2-011 (`ticket run`) checks the ticket is in a "runnable state."

Without `isValidSubState()`, each of these tasks will do raw string comparisons against the enum values, which is fragile and doesn't narrow the TypeScript type.

**Recommendation:**
Add:
```typescript
export function isValidSubState(value: string): value is SubState {
  return Object.values(SubState).includes(value as SubState);
}
```

This is symmetric with `isValidColumn()` and costs one line. Update the ACs and DoD to include it.

---

### m2. `COLUMN_ORDER` should be a readonly tuple for compile-time safety

**File:** `docs/tasks/M1-007-column-substate-enums.md` — COLUMN_ORDER definition

**Problem:**
The type is `Column[]` (mutable array). This allows accidental `.push()`, `.splice()`, or reassignment at any call site. Since `COLUMN_ORDER` is the authoritative sequence for legal transitions (used by M1-008 and M2-012), mutation would silently break the state machine.

**Recommendation:**
Change to:
```typescript
export const COLUMN_ORDER = [
  Column.BACKLOG, Column.PRODUCT_SCOPING, Column.ARCH_SPIKE,
  Column.TECH_SPEC, Column.IMPLEMENTATION, Column.CODE_REVIEW,
  Column.QA, Column.DOD_GATE, Column.DONE,
] as const;
export type ColumnOrder = typeof COLUMN_ORDER;
```

The `as const` assertion makes the array `readonly` and gives each element a literal type, preventing mutation and enabling precise index-based type narrowing.

---

## Positive Observations

1. **`as const` + value type pattern** — idiomatic TypeScript for DB-backed string enums. Avoids TypeScript `enum` keyword issues (reverse mapping, tree-shaking).
2. **Single source of truth** — keeping enums in one file prevents drift between DB strings and TypeScript types, as the context correctly notes.
3. **`COLUMN_ORDER` as a separate export** — clean separation between the set of valid values and the ordered sequence. M1-008 consumes the order; other modules just need the set.
4. **Dependencies are minimal** — only M0-002 (TypeScript configured). Correct for a pure type definition file.

---

## Verification Notes

- After applying M1: verify that a ticket row typed with `SubStateOrNull` compiles when `sub_state` is `null` from the DB.
- After applying m2: verify that `COLUMN_ORDER.push(...)` produces a TypeScript compile error.
- `isValidSubState('WORKING')` should return `true` and narrow the type; `isValidSubState('INVALID')` should return `false`.
- Confirm `COLUMN_ORDER.length === 9` in tests.

---

## Draft PR Summary

**Scope:** M1-007 task specification document
**Changes needed before implementation:**

- **SubState type:** Add `SubStateOrNull = SubState | null` export for DB row types where `sub_state` can be null (BACKLOG tickets). Document when to use `SubState` (parameters) vs `SubStateOrNull` (DB reads).
- **Utility functions:** Add `isValidSubState()` type guard, symmetric with `isValidColumn()`.
- **COLUMN_ORDER:** Change from `Column[]` to `as const` readonly tuple to prevent accidental mutation.
- **ACs/DoD:** Add entries for `isValidSubState()` and `SubStateOrNull`.

Please review this summary and confirm it matches the intended changes before updating the task document.
