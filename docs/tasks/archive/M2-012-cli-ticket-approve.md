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

```typescript
export class TicketApproveUseCase {
  constructor(
    private ticketRepo: TicketRepository,
    private stateMachine: StateMachineService,
    private gitGateway: GitGateway,
  ) {}

  execute(
    projectId: string,
    projectPath: string,
    ticketId: string,
  ): TicketApproveResult
}
```

Result type:
```typescript
type TicketApproveResult =
  | { status: 'advanced'; ticketId: string; fromColumn: Column; toColumn: Column }
  | { status: 'already_done'; ticketId: string }
  | { status: 'error'; ticketId: string; error: string };
```

Steps:
1. Load ticket via `TicketRepository.findById(projectId, ticketId)`
2. Verify sub-state is `SIGNED_OFF`; if not return error:
   `Error: Ticket <id> is not signed off (current state: <subState>). Only signed-off tickets can be approved.`
   — handle null sub-state explicitly: `"current state: BACKLOG (no sub-state)"` for BACKLOG tickets.
3. Determine next column using `COLUMN_ORDER`
4. If current column is `DONE`: return `{ status: 'already_done', ticketId }`
5. Call `stateMachine.transition(projectId, ticketId, nextColumn)`.
   If `result.ok` is `false`: return `{ status: 'error', ticketId, error: result.reason }`
6. On success: call `stateMachine.setSubState(projectId, ticketId, 'BLOCKED')` (new column starts blocked until run)
7. Commit approval to git:
   ```
   gitGateway.commitFiles(
     path.join(projectPath, '.aeos'),
     [],
     `[${ticketId}][HUMAN][v1][advance: ${currentColumn} → ${nextColumn}]`
   )
   ```
8. Return `{ status: 'advanced', ticketId, fromColumn: currentColumn, toColumn: nextColumn }`

## Acceptance Criteria
- [ ] Given a SIGNED_OFF ticket in BACKLOG, when running `aeos ticket approve AEOS-1`, then ticket moves to PRODUCT_SCOPING with sub-state BLOCKED
- [ ] Given a ticket with sub-state WORKING, when running `aeos ticket approve AEOS-1`, then error is printed and exit code is 1
- [ ] Given a DONE ticket, when running `aeos ticket approve AEOS-1`, then "already done" message and exit 0
- [ ] Given approval, when checking git history, then a commit with `[HUMAN][v1][advance]` tag exists
- [ ] Given the approval, when querying `transitions` table, then a transition record exists for the move
- [ ] Given a non-existent ticket, when running `aeos ticket approve AEOS-99`, then error and exit 1

## Out of Scope
- Auto-advance mode (v2 — `advanceMode: auto` config flag)
- Multi-column batch advance

## Technical Notes / Hints
- `COLUMN_ORDER` provides `indexOf(currentColumn) + 1` to find the next column
- Sub-state defaults to BLOCKED on entering a new column — this is intentional (must be explicitly run before it's working)
- **Known limitation (v1):** BLOCKED sub-state is semantically overloaded — it means both "has unanswered questions" (from `ticket run` pre-flight) and "entered column, not yet run" (from `ticket approve`). The operator cannot distinguish these two states from `aeos ticket show`. Consider a future `READY` or `QUEUED` sub-state for "entered column, not yet run."

## Layer Mapping
```
CLI command:     src/cli/commands/ticket-approve.command.ts     — parse args, call use case, format output
Use case:        src/application/ticket-approve.use-case.ts     — orchestrate via StateMachineService
Domain service:  src/domain/services/state-machine.ts           — transition() + setSubState()
Domain model:    src/domain/model/column.ts                     — COLUMN_ORDER
Domain ports:    src/domain/ports/driven/git-gateway.port.ts    — GitGateway (commit approval)
Driving port:    src/domain/ports/driving/ticket-approve.port.ts — TicketApprovePort
```

### Driving Port
```typescript
export interface TicketApprovePort {
  execute(projectId: string, projectPath: string, ticketId: string): TicketApproveResult;
}
```

### Container Wiring (`src/cli/container.ts`)
- Add `ticketApprove: TicketApprovePort` to the `Container` interface
- Wire `TicketApproveUseCase` with `TicketRepository`, `StateMachineService`, and `GitGateway`

## Dependencies
- M1-008: `StateMachineService.transition()`
- M1-009: `StateMachineService.setSubState()`
- M1-007: `COLUMN_ORDER`
- `GitGateway`: commit approval action per system design §8.3
- `ProjectRepository`: CLI layer needs to resolve `projectPath`

## Definition of Done
- [ ] `aeos ticket approve` advances column and resets sub-state to BLOCKED
- [ ] Non-SIGNED_OFF state exits with code 1
- [ ] Transition record written to DB
- [ ] Git commit with `[HUMAN][v1][advance]` tag created on approval
- [ ] Unit tests: successful advance, not signed off, already done, transition failure
- [ ] Code reviewed and approved
