# Task: Implement `aeos ticket run <id>` CLI Command

**Milestone:** M2 — Dogfood Harness
**Agent:** backend-architect
**Method:** Manual (last manual milestone)

## Context
The core orchestration command. Runs a full column cycle for a ticket: pre-flight → WORKING → executor → output validation → reviewer agent → SIGNED_OFF. This is the command that makes the pipeline real. Requires all M2 subsystems to be complete.

## What needs to be done
Implement the CLI command in `src/cli/commands/ticket-run.command.ts` and the use case in `src/application/ticket-run.use-case.ts`:

**CLI command** (`ticket-run.command.ts`):
1. Parse `<id>` argument
2. Resolve project context; build the container (use cases + ports)
3. Call the use case; print progress/result/errors

**Use case** (`ticket-run.use-case.ts`) — receives all ports via constructor injection:
```
constructor(
  ticketRepo: TicketRepository,
  stateMachine: StateMachineService,
  contextAssembler: ContextAssembler,
  buildPrompt: (context: AssembledContext, agentSpec: AgentSpec) => string,
  executor: Executor,
  artifactStore: ArtifactStore,
  gitGateway: GitGateway,
  columnSpecLoader: ColumnSpecLoader,
  agentSpecLoader: AgentSpecLoader,
)
```

Note: `buildPrompt` is a pure function reference (M2-005 exports `buildPrompt()` as a pure function, not a class). `validateOutput` from M2-006 is also a pure function — import it directly rather than injecting it.

**Execute method signature:**
```typescript
async execute(
  projectId: string,
  projectPath: string,
  ticketId: string,
): Promise<TicketRunResult>
```

**Result type:**
```typescript
type TicketRunResult =
  | { status: 'success'; ticketId: string; artifactPath: string; reviewPath: string }
  | { status: 'failed'; ticketId: string; error: string }
  | { status: 'blocked'; ticketId: string; blockers: string[] }
```

Orchestration sequence:
```
1. Load ticket via ticketRepo; verify it is in a runnable state:
   - if column is BACKLOG or DONE → error: cannot run (no column spec)
   - if column is DOD_GATE → error: DoD gate is human-only
   - if subState is WORKING → error: already running
   - if subState is BLOCKED → error: ticket is blocked, run `aeos ticket answer` first
2. Load ColumnSpec via columnSpecLoader; load AgentSpec via agentSpecLoader
3. Run pre-flight (M2-009); if blocked → return blocked result
4. stateMachine.setSubState(projectId, ticketId, WORKING)
5. contextAssembler.assemble(ticketId, projectPath)
6. buildPrompt(assembledContext, agentSpec)
7. executor.run() → ExecutorResult
8. If executor fails:
   a. artifactStore.removeArtifact(projectPath, ticketId, artifactFilename) // if partially written
   b. stateMachine.setSubState(projectId, ticketId, FAILED)
   c. Return error
9. import { validateOutput } from output-validation; validateOutput(executorResult.content, columnSpec)
   If violations:
   a. artifactStore.removeArtifact(projectPath, ticketId, artifactFilename)
   b. stateMachine.setSubState(projectId, ticketId, FAILED)
   c. Return violations
10. Persist worker artifact and commit:
    a. artifactStore.writeArtifact(projectPath, ticketId, artifactFilename, executorResult.content)
    b. gitGateway.commitFiles(aeosDir, [artifactPath], `[${ticketId}][${artifactName}][v1][${agentSpec.name}][create]`)
11. Run reviewer agent:
    a. Load rubric files from columnSpec.reviewerRubrics paths
    b. contextAssembler.assemble(ticketId, projectPath) — re-assemble with new artifact now in store
    c. Include rubric content in the reviewer's assembled context
    d. buildPrompt(reviewerContext, reviewerAgentSpec)
    e. executor.run() → reviewer artifact
    f. Derive review artifact name from column spec: `${ticketId}-${columnSpec.outputArtifact.replace('.md', '-review.md')}`
       (e.g., AEOS-1-prd-review.md, AEOS-1-spike-review.md, AEOS-1-spec-review.md)
    g. artifactStore.writeArtifact(projectPath, ticketId, reviewFilename, reviewResult.content)
    h. gitGateway.commitFiles(aeosDir, [reviewPath], `[${ticketId}][REVIEW][v1][reviewer-agent][create]`)
12. stateMachine.setSubState(projectId, ticketId, IN_REVIEW)
13. stateMachine.setSubState(projectId, ticketId, SIGNED_OFF) (in v1, reviewer pass = automatic sign-off)
14. Return success result
```

The executor to use is determined by container wiring (stub for tests, claude-cli for production). The container selects the executor based on the agent spec's `executor.type` field or a CLI flag like `--stub`.

## Acceptance Criteria
- [ ] Given a ticket in PRODUCT_SCOPING with a stub column spec, when running `aeos ticket run AEOS-1`, then the ticket reaches SIGNED_OFF and an artifact is written
- [ ] Given executor failure, when running `aeos ticket run`, then sub-state is FAILED and process exits 1 with a clear error
- [ ] Given output validation failure, when running `aeos ticket run`, then violations are printed and ticket is FAILED
- [ ] Given a BLOCKED ticket, when running `aeos ticket run`, then it prints "Ticket is blocked" and exits cleanly (not 1)
- [ ] Given a successful run, when inspecting `.aeos/.git log`, then two commits exist: artifact + review, with messages following the format `[TICKET-ID][ARTIFACT|REVIEW][v1][agent-name][create]` per system design §3.3

## Out of Scope
- Advancing the ticket to the next column (M2-012 — `aeos ticket approve`)
- Auto-advance mode (v2)

## Dependencies
- M1-008/M1-009: StateMachineService (transition + setSubState)
- M2-002 through M2-009: All harness subsystems
- M2-013: `reviewer-agent.yaml` exists
- ArtifactStore.readArtifact() (cross-cutting amendment from M2-004/M2-010 reviews)
- ExecutorResult.content field (cross-cutting amendment from M2-009 review)

## Layer Mapping
```
CLI command:     src/cli/commands/ticket-run.command.ts              — parse args, call use case, print progress
Use case:        src/application/ticket-run.use-case.ts              — orchestrate full column run
App services:    src/application/services/context-assembler.ts       — ContextAssembler
                 src/application/services/prompt-builder.ts          — buildPrompt() pure function
                 src/application/services/preflight.ts               — PreflightService (optional extraction)
Domain service:  src/domain/services/state-machine.ts                — StateMachineService
                 src/domain/services/output-validation.ts            — validateOutput()
Domain ports:    Executor, TicketRepository, ArtifactStore, GitGateway, ColumnSpecLoader, AgentSpecLoader
```

## Container Wiring
Add to `src/cli/container.ts`:
- `TicketRunUseCase` with all 9 constructor dependencies
- Wire `StubExecutor` for tests, `ClaudeCodeCliExecutor` for production

## Definition of Done
- [ ] Full orchestration sequence executes in correct order
- [ ] FAILED state set on executor or validation failure; partial artifacts rolled back
- [ ] Git commits created for both worker artifact and reviewer artifact
- [ ] Integration test: full run with StubExecutor through PRODUCT_SCOPING column (stub spec)
- [ ] Code reviewed and approved
