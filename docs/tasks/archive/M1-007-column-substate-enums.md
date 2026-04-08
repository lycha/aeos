# Task: Define Column and Sub-State Enums

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** typescript-pro
**Method:** Manual (bootstrapping)

## Context
Central type definitions for the state machine. Every other module imports from here. Must be defined before `transition()` and `setSubState()` are implemented. Keeping enums in one file prevents drift between DB strings and TypeScript types.

## What needs to be done
Implement in `src/domain/model/column.ts` and `src/domain/model/sub-state.ts`:

**`src/domain/model/column.ts`** — Column enum, COLUMN_ORDER, and `isValidColumn()` type guard
**`src/domain/model/sub-state.ts`** — SubState enum, SubStateOrNull, and `isValidSubState()` type guard

Combined exports:

```typescript
export const Column = {
  BACKLOG:          'BACKLOG',
  PRODUCT_SCOPING:  'PRODUCT_SCOPING',
  ARCH_SPIKE:       'ARCH_SPIKE',
  TECH_SPEC:        'TECH_SPEC',
  IMPLEMENTATION:   'IMPLEMENTATION',
  CODE_REVIEW:      'CODE_REVIEW',
  QA:               'QA',
  DOD_GATE:         'DOD_GATE',
  DONE:             'DONE',
} as const;
export type Column = typeof Column[keyof typeof Column];

export const SubState = {
  BLOCKED:     'BLOCKED',
  WORKING:     'WORKING',
  INTERRUPTED: 'INTERRUPTED',
  FAILED:      'FAILED',
  IN_REVIEW:   'IN_REVIEW',
  SIGNED_OFF:  'SIGNED_OFF',
} as const;
export type SubState = typeof SubState[keyof typeof SubState];

/** Sub-state value as stored in the DB — null for BACKLOG tickets. */
export type SubStateOrNull = SubState | null;

export const COLUMN_ORDER = [
  Column.BACKLOG, Column.PRODUCT_SCOPING, Column.ARCH_SPIKE,
  Column.TECH_SPEC, Column.IMPLEMENTATION, Column.CODE_REVIEW,
  Column.QA, Column.DOD_GATE, Column.DONE,
] as const;
export type ColumnOrder = typeof COLUMN_ORDER;
```

- Export `COLUMN_ORDER` as the authoritative readonly sequence for legal forward transitions (`as const` prevents accidental mutation)
- Add a utility `isValidColumn(value: string): value is Column` type guard
- Add a utility `isValidSubState(value: string): value is SubState` type guard
- Use `SubState` for function parameters where `null` is never valid (e.g. `setSubState()`). Use `SubStateOrNull` for DB row types and display functions where `null` is a valid value (e.g. BACKLOG tickets).

## Acceptance Criteria
- [ ] Given `Column.BACKLOG`, when used in a TypeScript file, then it compiles without error and equals the string `"BACKLOG"`
- [ ] Given an invalid string, when passing to `isValidColumn()`, then it returns `false`
- [ ] Given an invalid string, when passing to `isValidSubState()`, then it returns `false`
- [ ] Given `'WORKING'`, when passing to `isValidSubState()`, then it returns `true` and narrows the type to `SubState`
- [ ] Given `COLUMN_ORDER`, when inspecting the array, then it contains all 9 columns in correct pipeline order
- [ ] Given `COLUMN_ORDER`, when attempting `.push()` in TypeScript, then a compile error is produced (readonly tuple)
- [ ] Given importing from `src/domain/model/column.ts` or `src/domain/model/sub-state.ts`, when using `Column` or `SubState` as a type, then TypeScript enforces valid values
- [ ] Given `SubStateOrNull`, when typing a DB row with `sub_state: null`, then it compiles without error

## Out of Scope
- Legal transition rules (M1-008 — `transition()` function)
- DB persistence of these values (M1-006)

## Dependencies
- M0-002: TypeScript configured

## Layer Mapping
```
Domain model:  src/domain/model/column.ts      — Column enum, COLUMN_ORDER, isValidColumn()
Domain model:  src/domain/model/sub-state.ts   — SubState enum, SubStateOrNull, isValidSubState()
Barrel:        src/domain/model/index.ts       — re-exports both
```

## Definition of Done
- [ ] `src/domain/model/column.ts` and `src/domain/model/sub-state.ts` exported and importable
- [ ] Unit tests: `isValidColumn` with valid and invalid inputs; `isValidSubState` with valid and invalid inputs; `COLUMN_ORDER` length is 9
- [ ] Code reviewed and approved
