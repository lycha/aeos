# Task: Implement `transition(ticketId, targetColumn)` State Machine Function

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** backend-architect
**Method:** Manual (bootstrapping)

## Context
Core state machine operation. Validates that a column transition is legal, records it in the `transitions` table, and updates the ticket's column and `updated_at`. Supports forward movement (adjacent only), backward movement (any prior column), and BACKLOG reset. The `aeos ticket approve` and `aeos ticket sendback` commands in M2 will call this function. Requires M1-006 (SQLite) and M1-007 (enums).

## What needs to be done
Implement in `src/domain/services/state-machine.ts` as part of the `StateMachineService` class. The service receives `TicketRepository` and `TransitionRepository` ports via constructor injection — it does NOT depend on `Database` or any infrastructure type.

```typescript
// src/domain/services/state-machine.ts
export type TransitionResult =
  | { ok: true }
  | { ok: false; reason: string };

export class StateMachineService {
  constructor(
    private ticketRepo: TicketRepository,
    private transitionRepo: TransitionRepository,
  ) {}

  transition(
    projectId: string,
    ticketId: string,
    targetColumn: Column,
    comment?: string,
  ): TransitionResult
}
```

Implementation rules:
1. Load current ticket via `this.ticketRepo.findById(projectId, ticketId)`; if not found return `{ ok: false, reason: "Ticket not found" }`
2. Determine current column and current `sub_state` from the ticket row
3. Legal transition rules:
   - **Forward:** target must be exactly the **next** column in `COLUMN_ORDER` (adjacent only, no skipping)
   - **Backward:** target can be any column that appears *before* the current column in `COLUMN_ORDER` (any prior column, including BACKLOG). This enables the `sendback` rework flow (PRD FR-12, Section 5.9).
   - **Same column:** illegal (return `{ ok: false, reason: "Already in <column>" }`)
   - **From DONE:** only backward movement is allowed (DONE has no forward target)
4. If illegal: return `{ ok: false, reason: "Cannot transition from X to Y" }`
5. If legal:
   - Read the ticket's current `sub_state` as `from_sub_state`
   - Determine `to_sub_state`: if target is `BACKLOG`, use `NULL`; otherwise use `NULL` (caller sets via `setSubState()` after)
   - Record the transition via `this.transitionRepo.record({ ticketId, projectId, fromColumn, toColumn, fromSubState, toSubState, comment, at: ISO })`
   - Update the ticket via `this.ticketRepo.updateColumn(projectId, ticketId, targetColumn)`
   - **BACKLOG exception:** when target is `BACKLOG`, also reset sub-state via `this.ticketRepo.updateSubState(projectId, ticketId, null)` (BACKLOG tickets must have null sub-state — data invariant from M1-003)
   - Return `{ ok: true }`
6. The repository adapters (in infrastructure) are responsible for wrapping DB operations in a transaction

## Acceptance Criteria
- [ ] Given a ticket in `BACKLOG`, when calling `stateMachine.transition(projectId, id, 'PRODUCT_SCOPING')`, then result is `{ ok: true }` and repo reflects new column
- [ ] Given a ticket in `BACKLOG`, when calling `stateMachine.transition(projectId, id, 'TECH_SPEC')` (skipping forward), then result is `{ ok: false }`
- [ ] Given a ticket in `TECH_SPEC`, when calling `stateMachine.transition(projectId, id, 'ARCH_SPIKE')` (backward one), then result is `{ ok: true }`
- [ ] Given a ticket in `TECH_SPEC`, when calling `stateMachine.transition(projectId, id, 'BACKLOG')` (backward to BACKLOG), then result is `{ ok: true }` and `sub_state` is `NULL`
- [ ] Given a ticket in `CODE_REVIEW`, when calling `stateMachine.transition(projectId, id, 'PRODUCT_SCOPING')` (backward multiple), then result is `{ ok: true }`
- [ ] Given a ticket in `QA`, when calling `stateMachine.transition(projectId, id, 'QA')` (same column), then result is `{ ok: false }`
- [ ] Given a ticket in `DONE`, when calling `stateMachine.transition(projectId, id, 'PRODUCT_SCOPING')` (backward from DONE), then result is `{ ok: true }`
- [ ] Given a ticket in `DONE`, when calling `stateMachine.transition()` with any forward target, then result is `{ ok: false }` (no forward from DONE)
- [ ] Given a non-existent ticket ID, when calling `stateMachine.transition()`, then result is `{ ok: false, reason: "Ticket not found" }`
- [ ] Given a successful transition with `comment = "Scope too broad"`, when querying `transitions` table, then the row contains the comment
- [ ] Given a successful transition, when querying `transitions` table, then `from_sub_state` reflects the ticket's sub-state before the move

## Out of Scope
- Sub-state management for non-BACKLOG columns (M1-009 — `setSubState()`)
- Operator approval flow (M2 — `aeos ticket approve`)
- Operator sendback flow (M2 — `aeos ticket sendback`)

## Layer Mapping
```
Domain service:   src/domain/services/state-machine.ts          — StateMachineService class
Domain ports:     src/domain/ports/driven/ticket-repository.port.ts
                  src/domain/ports/driven/transition-repository.port.ts
Adapters:         src/infrastructure/persistence/sqlite-ticket.repository.ts
                  src/infrastructure/persistence/sqlite-transition.repository.ts (new — implements TransitionRepository)
```

## Technical Notes / Hints
- The service uses constructor-injected ports, NOT raw `db: Database` — this keeps the domain layer free of infrastructure types
- Tests use simple in-memory port stubs (plain objects implementing the port interfaces) — no `:memory:` SQLite needed for domain service tests
- **BACKLOG exception:** `transition()` calls `ticketRepo.updateSubState(projectId, ticketId, null)` when the target is BACKLOG. This is the one exception to the general rule that sub-state is managed by `setSubState()`. BACKLOG's null sub-state is a data invariant, not a caller decision.
- **Caller responsibility for non-BACKLOG transitions:** after a successful forward transition, callers must call `setSubState()` to set the initial sub-state for the new column (e.g. `BLOCKED` for manual-advance). `transition()` does not set sub-state for non-BACKLOG columns.
- The `comment` parameter is optional — forward approvals typically omit it; sendbacks always include one (FR-24).

## Dependencies
- M1-006: SQLite schema (includes `from_sub_state`, `to_sub_state`, `comment` columns in `transitions`)
- M1-007: Column enums and `COLUMN_ORDER`

## Definition of Done
- [ ] `transition()` enforces forward-adjacent and backward-any rules
- [ ] Backward to BACKLOG resets `sub_state` to NULL
- [ ] Transition comment persisted when provided
- [ ] `from_sub_state` recorded in transition row
- [ ] Illegal transitions return structured error (not throw)
- [ ] Unit tests: legal forward, skip-forward attempt, backward one column, backward multiple columns, same-column rejection, DONE terminal state, BACKLOG sub-state reset, comment persistence, missing ticket, DB transaction integrity
- [ ] Code reviewed and approved
