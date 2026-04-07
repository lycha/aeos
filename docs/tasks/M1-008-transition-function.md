# Task: Implement `transition(ticketId, targetColumn)` State Machine Function

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** backend-architect
**Method:** Manual (bootstrapping)

## Context
Core state machine operation. Validates that a column transition is legal (forward-only, adjacent column), records it in the `transitions` table, and updates the ticket's column and `updated_at`. The `aeos ticket approve` command in M2 will call this function. Requires M1-006 (SQLite) and M1-007 (enums).

## What needs to be done
Create `src/state-machine/transition.ts` exporting:

```typescript
export type TransitionResult =
  | { ok: true }
  | { ok: false; reason: string };

export function transition(
  db: Database,
  ticketId: string,
  targetColumn: Column,
): TransitionResult
```

Implementation rules:
1. Load current ticket row; if not found return `{ ok: false, reason: "Ticket not found" }`
2. Determine current column from the ticket row
3. Legal transitions: target must be exactly the **next** column in `COLUMN_ORDER` (forward-only, no skipping)
   - Exception: any column → `BACKLOG` is allowed (reset/unblock flow)
4. If illegal: return `{ ok: false, reason: "Cannot transition from X to Y" }`
5. If legal:
   - Insert into `transitions`: `{ ticket_id, from_column, to_column, at: ISO }`
   - Update `tickets` SET `column = targetColumn`, `updated_at = ISO` WHERE `id = ticketId`
   - Return `{ ok: true }`
6. All DB operations must be wrapped in a single SQLite transaction

## Acceptance Criteria
- [ ] Given a ticket in `BACKLOG`, when calling `transition(db, id, 'PRODUCT_SCOPING')`, then result is `{ ok: true }` and DB reflects new column
- [ ] Given a ticket in `BACKLOG`, when calling `transition(db, id, 'TECH_SPEC')` (skipping), then result is `{ ok: false }`
- [ ] Given a ticket in any column, when calling `transition(db, id, 'BACKLOG')`, then result is `{ ok: true }` (reset allowed)
- [ ] Given a non-existent ticket ID, when calling `transition()`, then result is `{ ok: false, reason: "Ticket not found" }`
- [ ] Given a successful transition, when querying `transitions` table, then a row exists for the move

## Out of Scope
- Sub-state management (M1-009 — `setSubState()`)
- Operator approval flow (M2 — `aeos ticket approve`)

## Technical Notes / Hints
- `better-sqlite3` transactions: `const tx = db.transaction(() => { ... }); tx();`
- Do not update `sub_state` in this function — that is the responsibility of `setSubState()`

## Dependencies
- M1-006: SQLite schema
- M1-007: Column enums and `COLUMN_ORDER`

## Definition of Done
- [ ] `transition()` enforces forward-only, adjacent-column rule
- [ ] Illegal transitions return structured error (not throw)
- [ ] Unit tests: legal transition, skip attempt, reset to BACKLOG, missing ticket, DB transaction integrity
- [ ] Code reviewed and approved
