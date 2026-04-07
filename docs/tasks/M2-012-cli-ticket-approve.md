# Task: Implement `aeos ticket approve <id>` CLI Command

**Milestone:** M2 — Dogfood Harness
**Agent:** typescript-pro
**Method:** Manual (last manual milestone)

## Context
Operator-initiated command that advances a SIGNED_OFF ticket to the next column in the pipeline. This is the human gate between columns. In v1 all advance is manual — the operator must explicitly approve before the ticket moves. Requires M1-008 (`transition()`).

## What needs to be done
Implement `src/commands/ticket-approve.ts`:
1. Resolve project root; load ticket from DB
2. Verify sub-state is `SIGNED_OFF`; if not print error and exit 1:
   `Error: Ticket <id> is not signed off (current state: <subState>). Only signed-off tickets can be approved.`
3. Determine next column using `COLUMN_ORDER`
4. If current column is `DONE`: print `Ticket <id> is already done.` and exit 0
5. Call `transition(db, ticketId, nextColumn)`
6. On success: call `setSubState(db, ticketId, 'BLOCKED')` (new column starts blocked until run)
7. Print: `✓ Ticket <id> advanced to <nextColumn>. Run 'aeos ticket run <id>' to begin this column.`

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

## Dependencies
- M1-008: `transition()`
- M1-009: `setSubState()`
- M1-007: `COLUMN_ORDER`

## Definition of Done
- [ ] `aeos ticket approve` advances column and resets sub-state to BLOCKED
- [ ] Non-SIGNED_OFF state exits with code 1
- [ ] Transition record written to DB
- [ ] Unit tests: successful advance, not signed off, already done
- [ ] Code reviewed and approved
