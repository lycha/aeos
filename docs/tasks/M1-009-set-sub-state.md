# Task: Implement `setSubState(ticketId, subState)` State Machine Function

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** typescript-pro
**Method:** Manual (bootstrapping)

## Context
Immediate sub-state update that does not change the column. Used by the orchestrator to reflect WORKING, FAILED, INTERRUPTED, SIGNED_OFF etc. within a column. Works alongside `transition()` but is a separate, simpler operation. Requires M1-006 (SQLite) and M1-007 (enums).

## What needs to be done
Create `src/state-machine/set-sub-state.ts` exporting:

```typescript
export type SetSubStateResult =
  | { ok: true }
  | { ok: false; reason: string };

export function setSubState(
  db: Database,
  ticketId: string,
  subState: SubState,
): SetSubStateResult
```

Implementation:
1. Load ticket row; if not found return `{ ok: false, reason: "Ticket not found" }`
2. Update `tickets` SET `sub_state = subState`, `updated_at = ISO` WHERE `id = ticketId`
3. Return `{ ok: true }`

No transition validation needed — sub-state changes are always allowed within the current column.

## Acceptance Criteria
- [ ] Given ticket `AEOS-1` in `BACKLOG/BLOCKED`, when calling `setSubState(db, 'AEOS-1', 'WORKING')`, then result is `{ ok: true }` and DB shows `sub_state = 'WORKING'`
- [ ] Given a non-existent ticket, when calling `setSubState()`, then result is `{ ok: false, reason: "Ticket not found" }`
- [ ] Given calling `setSubState()`, when calling `setSubState()` again with a different sub-state, then the value updates correctly (no constraint violation)
- [ ] Given a valid sub-state value, when checking the `SubState` TypeScript type, then invalid strings are rejected at compile time

## Out of Scope
- Sub-state transition validation rules (no restrictions in v1 — any sub-state is reachable from any other)
- Logging sub-state history to a separate table (v2 concern)

## Dependencies
- M1-006: SQLite schema
- M1-007: SubState enum

## Definition of Done
- [ ] `setSubState()` updates DB correctly
- [ ] Missing ticket returns structured error
- [ ] Unit tests: happy path, missing ticket, sequential updates
- [ ] Code reviewed and approved
