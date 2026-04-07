# Task: Define Column and Sub-State Enums

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** typescript-pro
**Method:** Manual (bootstrapping)

## Context
Central type definitions for the state machine. Every other module imports from here. Must be defined before `transition()` and `setSubState()` are implemented. Keeping enums in one file prevents drift between DB strings and TypeScript types.

## What needs to be done
Create `src/state-machine/enums.ts` exporting:

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

export const COLUMN_ORDER: Column[] = [
  Column.BACKLOG, Column.PRODUCT_SCOPING, Column.ARCH_SPIKE,
  Column.TECH_SPEC, Column.IMPLEMENTATION, Column.CODE_REVIEW,
  Column.QA, Column.DOD_GATE, Column.DONE,
];
```

- Export `COLUMN_ORDER` as the authoritative sequence for legal forward transitions
- Add a utility `isValidColumn(value: string): value is Column` type guard

## Acceptance Criteria
- [ ] Given `Column.BACKLOG`, when used in a TypeScript file, then it compiles without error and equals the string `"BACKLOG"`
- [ ] Given an invalid string, when passing to `isValidColumn()`, then it returns `false`
- [ ] Given `COLUMN_ORDER`, when inspecting the array, then it contains all 9 columns in correct pipeline order
- [ ] Given importing from `src/state-machine/enums.ts`, when using `Column` or `SubState` as a type, then TypeScript enforces valid values

## Out of Scope
- Legal transition rules (M1-008 — `transition()` function)
- DB persistence of these values (M1-006)

## Dependencies
- M0-002: TypeScript configured

## Definition of Done
- [ ] `src/state-machine/enums.ts` exported and importable
- [ ] Unit tests: `isValidColumn` with valid and invalid inputs; `COLUMN_ORDER` length is 9
- [ ] Code reviewed and approved
