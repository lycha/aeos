# Task: Implement `aeos ticket approve <id>` CLI Command

**Milestone:** M2 — Dogfood Harness
**Agent:** typescript-pro
**Method:** Manual (last manual milestone)

## Context
Operator-initiated command that advances a SIGNED_OFF ticket to the next column in the pipeline. This is the human gate between columns. In v1 all advance is manual — the operator must explicitly approve before the ticket moves. Requires M1-008 (`transition()`).

## What needs to be done
Implement the CLI command in `src/cli/commands/ticket-approve.command.ts` and the use case in `src/application/ticket-approve.use-case.ts`:

**CLI command** (`ticket-approve.command.ts`):
1. Parse `<id>` argument
2. Resolve project context via `ProjectRepository`
3. Call the use case; print result or error

**Use case** (`ticket-approve.use-case.ts`):
1. Load ticket via `TicketRepository.findById(projectId, ticketId)`
2. Verify sub-state is `SIGNED_OFF`; if not return error:
   `Error: Ticket <id> is not signed off (current state: <subState>). Only signed-off tickets can be approved.`
3. Determine next column using `COLUMN_ORDER`
4. If current column is `DONE`: return "already done" result
5. Call `stateMachine.transition(projectId, ticketId, nextColumn)`
6. On success: call `stateMachine.setSubState(projectId, ticketId, 'BLOCKED')` (new column starts blocked until run)
7. Return success result with next column name

## Acceptance Criteria
- [ ] Given a SIGNED_OFF ticket in BACKLOG, when running `aeos ticket approve AEOS-1`, then ticket moves to PRODUCT_SCOPING with sub-state BLOCKED
- [ ] Given a ticket with sub-state WORKING, when running `aeos ticket approve AEOS-1`, then error is printed and exit code is 1
- [ ] Given a DONE ticket, when running `aeos ticket approve`, then "already done" message and exit 0
- [ ] Given the approval, when querying `transitions` table, then a transition record exists for the move
- [ ] Given a non-existent ticket, when running `aeos ticket approve AEOS-99`, then error and exit 1

## Out of Scope
- Auto-advance mode (v2 — `advanceMode: auto` config flag)
- Multi-column batch advance

## Technical Notes / Hints
- `COLUMN_ORDER` provides `indexOf(currentColumn) + 1` to find the next column
- Sub-state defaults to BLOCKED on entering a new column — this is intentional (must be explicitly run before it's working)

## Layer Mapping
```
CLI command:     src/cli/commands/ticket-approve.command.ts     — parse args, call use case, format output
Use case:        src/application/ticket-approve.use-case.ts     — orchestrate via StateMachineService
Domain service:  src/domain/services/state-machine.ts           — transition() + setSubState()
Domain model:    src/domain/model/column.ts                     — COLUMN_ORDER
```

## Dependencies
- M1-008: `StateMachineService.transition()`
- M1-009: `StateMachineService.setSubState()`
- M1-007: `COLUMN_ORDER`

## Definition of Done
- [ ] `aeos ticket approve` advances column and resets sub-state to BLOCKED
- [ ] Non-SIGNED_OFF state exits with code 1
- [ ] Transition record written to DB
- [ ] Unit tests: successful advance, not signed off, already done
- [ ] Code reviewed and approved
