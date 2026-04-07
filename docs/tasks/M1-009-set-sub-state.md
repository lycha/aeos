# Task: Implement `setSubState(ticketId, subState)` State Machine Function

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** typescript-pro
**Method:** Manual (bootstrapping)

## Context
Immediate sub-state update that does not change the column. Used by the orchestrator to reflect WORKING, FAILED, INTERRUPTED, SIGNED_OFF etc. within a column. Works alongside `transition()` but is a separate, simpler operation. Requires M1-006 (SQLite) and M1-007 (enums).

## What needs to be done
Implement as a method on `StateMachineService` in `src/domain/services/state-machine.ts` (same class as `transition()`):

```typescript
// Added to StateMachineService (see M1-008)
setSubState(
  projectId: string,
  ticketId: string,
  subState: SubState,
): SetSubStateResult
```

Implementation:
1. Load ticket via `this.ticketRepo.findById(projectId, ticketId)`; if not found return `{ ok: false, reason: "Ticket not found" }`
2. If the ticket's current `column` is `BACKLOG`, return `{ ok: false, reason: "Cannot set sub-state on a BACKLOG ticket" }` — BACKLOG tickets must have `sub_state = NULL` (data invariant from M1-003, enforced by M1-008's BACKLOG reset)
3. Validate `subState` against `isValidSubState()` from M1-007. If invalid, return `{ ok: false, reason: "Invalid sub-state: <value>" }`
4. Update ticket via `this.ticketRepo.updateSubState(projectId, ticketId, subState)`
5. Return `{ ok: true }`

No sub-state transition validation needed — sub-state changes are always allowed within the current column (except BACKLOG, which rejects all sub-state changes). Setting the same sub-state as the current value is allowed and treated as an update (refreshes `updated_at`) — this supports retry and resume flows.

## Acceptance Criteria
- [ ] Given ticket `AEOS-1` in project `test-proj` in a non-BACKLOG column, when calling `stateMachine.setSubState('test-proj', 'AEOS-1', 'WORKING')`, then result is `{ ok: true }` and repo shows `sub_state = 'WORKING'`
- [ ] Given a ticket in BACKLOG, when calling `stateMachine.setSubState('test-proj', 'AEOS-1', 'WORKING')`, then result is `{ ok: false, reason: "Cannot set sub-state on a BACKLOG ticket" }` and repo still shows `sub_state = NULL`
- [ ] Given a non-existent ticket, when calling `stateMachine.setSubState()`, then result is `{ ok: false, reason: "Ticket not found" }`
- [ ] Given calling `setSubState()`, when calling `setSubState()` again with a different sub-state, then the value updates correctly
- [ ] Given a ticket already in `WORKING`, when calling `stateMachine.setSubState(projectId, ticketId, 'WORKING')`, then result is `{ ok: true }` and `updated_at` is refreshed
- [ ] Given an invalid sub-state string (e.g. `'RUNNING'` cast via `as any`), when calling `stateMachine.setSubState()`, then result is `{ ok: false, reason: "Invalid sub-state: RUNNING" }`
- [ ] Given a valid sub-state value, when checking the `SubState` TypeScript type, then invalid strings are rejected at compile time

## Out of Scope
- Sub-state transition validation rules (no restrictions in v1 — any sub-state is reachable from any other)
- Logging sub-state history to a separate table (v2 concern)

## Layer Mapping
```
Domain service:  src/domain/services/state-machine.ts   — StateMachineService.setSubState()
Domain ports:    src/domain/ports/driven/ticket-repository.port.ts
```

## Technical Notes / Hints
- `setSubState()` is a method on `StateMachineService`, sharing the same constructor-injected `TicketRepository` port as `transition()`
- Tests use in-memory port stubs, NOT `:memory:` SQLite — domain service tests must not depend on infrastructure

## Dependencies
- M1-006: SQLite schema
- M1-007: SubState enum and `isValidSubState()` type guard (runtime validation)

## Definition of Done
- [ ] `setSubState()` updates DB correctly
- [ ] BACKLOG tickets rejected with structured error
- [ ] Invalid sub-state values rejected with structured error
- [ ] Missing ticket returns structured error
- [ ] Unit tests: happy path, BACKLOG guard, invalid sub-state, missing ticket, sequential updates, same-sub-state idempotency
- [ ] Code reviewed and approved
