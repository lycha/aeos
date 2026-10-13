# Task: Implement AEOS-20 — DoD Gate Human Approval CLI Flow

**Milestone:** M6 — QA Agent + DoD Gate
**Agent:** typescript-pro
**Method:** Dogfood — run through AEOS pipeline

## Context
The final pipeline gate. Implements the `aeos ticket dod-approve <id>` CLI command — the human approval step that transitions a ticket to DONE. The command displays the DoD checklist, shows all artifact paths, and prompts the operator for confirmation.

## What needs to be done

> **Note:** The system design §8.1 `ticket approve` surface is extended with a dedicated `dod-approve` subcommand because DOD_GATE requires interactive human review (rubric display + Y/N prompt), distinct from the instant `approve` for other columns.

### Driving Port (`src/domain/ports/driving/ticket-dod-approve.port.ts`)
```typescript
export type TicketDodApproveResult =
  | { status: 'approved'; ticketId: string; totalCostUsd: number }
  | { status: 'cancelled'; ticketId: string }
  | { status: 'error'; ticketId: string; error: string };

export interface TicketDodApprovePort {
  execute(projectId: string, projectPath: string, ticketId: string): TicketDodApproveResult;
}
```

### Use Case (`src/application/ticket-dod-approve.use-case.ts`)
```typescript
export class TicketDodApproveUseCase implements TicketDodApprovePort {
  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly stateMachine: StateMachineService,
    private readonly gitGateway: GitGateway,
    private readonly costRepo: CostRepository,
    private readonly rubricLoader: RubricLoader,
    private readonly artifactStore: ArtifactStore,
  ) {}
}
```

### Layer Mapping
```
CLI command:     src/cli/commands/ticket-dod-approve.command.ts
Use case:        src/application/ticket-dod-approve.use-case.ts
Driving port:    src/domain/ports/driving/ticket-dod-approve.port.ts
Domain service:  src/domain/services/state-machine.ts
Domain ports:    cost-repository.port.ts, rubric-loader.port.ts,
                 artifact-store.port.ts, git-gateway.port.ts
```

### Steps
1. Create `src/cli/commands/ticket-dod-approve.command.ts`:
   - Load DoD rubric from `dod-evaluation.md`, display as checklist
   - List artifact files using `ArtifactStore.listArtifacts()`, display as relative paths from project root (`.aeos/tickets/<ticketId>/<filename>`)
   - Prompt: `All DoD criteria above must be met. Approve ticket <id> as DONE? [y/N]`
   - On Y: `stateMachine.transition(projectId, ticketId, Column.DONE)`,
     set sub-state to `null` (DONE is terminal — no active sub-state),
     commit `[<ticketId>][HUMAN][v1][dod-approve: DOD_GATE → DONE]` to git via `gitGateway.commit(aeosDir, '[<ticketId>][HUMAN][v1][dod-approve: DOD_GATE → DONE]')`,
     on commit failure: compensate by reverting column to DOD_GATE (follow `TicketApproveUseCase` error handling pattern, lines 76–83),
     print completion summary with total cost from `costRepo.findByTicket(projectId, ticketId)`
   - On N: exit 0 with message `DoD approval cancelled.`
2. Create `src/application/ticket-dod-approve.use-case.ts` — use case handling the transition logic
3. Guard: ticket must be in DOD_GATE column, error if not
4. Register the command in the CLI entry point (see Container Wiring and CLI Registration below)
5. Write unit tests for the use case and command

### Container Wiring (`src/cli/container.ts`)
- Add `ticketDodApprove: TicketDodApprovePort` to the `Container` interface
- Wire as lazy getter:
  ```typescript
  get ticketDodApprove() {
    return new TicketDodApproveUseCase(
      getTicketRepo(), getStateMachine(), gitGateway,
      getCostRepo(), new FsRubricLoader(), artifactStore,
    );
  }
  ```

### CLI Registration (`src/cli/index.ts`)
- Import `registerTicketDodApproveCommand` from `./commands/ticket-dod-approve.command.js`
- Add call in `buildProgram()`:
  `registerTicketDodApproveCommand(program, () => container.ticketDodApprove, container.projectRepo)`

## Acceptance Criteria
- [ ] `aeos ticket dod-approve AEOS-1` on a QA-passed ticket displays DoD checklist and Y/N prompt
- [ ] Operator enters Y → ticket column is DONE and completion summary is printed
- [ ] Operator enters N → ticket remains in DOD_GATE, exit code 0, message `DoD approval cancelled.`
- [ ] Ticket not in DOD_GATE → error and exit 1
- [ ] Unit tests cover all paths (approve, cancel, wrong column)

## Out of Scope
- Automated DoD evaluation (the DoD Gate agent evaluates, but human approves)

## Dependencies
- M6-005: AEOS-19 complete (`dod-evaluation.md` rubric exists)
- M6-001: AEOS-15 complete (DOD_GATE workflow design resolved)
- M2-012: `aeos ticket approve` pattern (reuse transition logic)

## Technical Notes / Hints
- The DoD rubric loading path depends on AEOS-15 design output. If DOD_GATE has a
  `dod-gate.yaml` column spec, load via `reviewerRubrics`. If human-only with no column
  spec, load via hardcoded path `rubrics/dod/dod-evaluation.md` using `RubricLoader`.
- Interactive Y/N prompting: use Node.js `readline` interface (or Commander's built-in
  prompt). The CLI command layer handles I/O; the use case receives a boolean `approved`
  parameter. Keep I/O out of the use case to maintain testability.
- `CostRecord.costUsd` is stored per-invocation. Sum all records for the ticket to get
  total cost: `costRepo.findByTicket(projectId, ticketId).reduce((sum, r) => sum + r.costUsd, 0)`.
- The `ticket-dod-approve` command barrel export already exists in
  `src/cli/commands/index.ts` (line 10) but the import and registration in
  `src/cli/index.ts` is missing — must be added.
- Follow `TicketApproveUseCase` compensating rollback pattern (lines 76–83) for git
  commit failure handling.

## Definition of Done
- [ ] `aeos ticket dod-approve` implemented and unit tested
- [ ] End-to-end: a ticket can move from DOD_GATE → DONE via this command
