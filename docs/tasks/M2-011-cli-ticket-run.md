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
  promptBuilder: PromptBuilder,
  executor: Executor,
  artifactStore: ArtifactStore,
  gitGateway: GitGateway,
  columnSpecLoader: ColumnSpecLoader,
  agentSpecLoader: AgentSpecLoader,
)
```

Orchestration sequence:
```
1. Load ticket via ticketRepo; verify it is in a runnable state (not DONE, not already WORKING)
2. Load ColumnSpec via columnSpecLoader; load AgentSpec via agentSpecLoader
3. Run pre-flight (M2-009); if blocked → return blocked result
4. stateMachine.setSubState → WORKING
5. contextAssembler.assemble()
6. promptBuilder.buildPrompt()
7. executor.run() → ExecutorResult
8. If executor fails → stateMachine.setSubState(FAILED); return error
9. outputValidation.validateOutput(); if violations → stateMachine.setSubState(FAILED); return violations
10. Run reviewer agent:
    - contextAssembler.assemble with the new artifact included
    - promptBuilder.buildPrompt using reviewer-agent spec + reviewer rubrics
    - executor.run() → reviewer artifact (<id>-review.md)
11. stateMachine.setSubState → IN_REVIEW
12. stateMachine.setSubState → SIGNED_OFF (in v1, reviewer pass = automatic sign-off)
13. Return success result
```

The executor to use is determined by container wiring (stub for tests, claude-cli for production).

## Acceptance Criteria
- [ ] Given a ticket in BACKLOG with a stub column spec, when running `aeos ticket run AEOS-1`, then the ticket reaches SIGNED_OFF and an artifact is written
- [ ] Given executor failure, when running `aeos ticket run`, then sub-state is FAILED and process exits 1 with a clear error
- [ ] Given output validation failure, when running `aeos ticket run`, then violations are printed and ticket is FAILED
- [ ] Given a BLOCKED ticket, when running `aeos ticket run`, then it prints "Ticket is blocked" and exits cleanly (not 1)
- [ ] Given a successful run, when inspecting `.aeos/.git log`, then two commits exist: artifact + review

## Out of Scope
- Advancing the ticket to the next column (M2-012 — `aeos ticket approve`)
- Auto-advance mode (v2)

## Dependencies
- M2-002 through M2-009: All harness subsystems
- M2-013: `reviewer-agent.yaml` exists

## Layer Mapping
```
CLI command:     src/cli/commands/ticket-run.command.ts              — parse args, call use case, print progress
Use case:        src/application/ticket-run.use-case.ts              — orchestrate full column run
App services:    src/application/services/context-assembler.ts       — ContextAssembler
                 src/application/services/prompt-builder.ts          — PromptBuilder
                 src/application/services/preflight.ts               — PreflightService (optional extraction)
Domain service:  src/domain/services/state-machine.ts                — StateMachineService
                 src/domain/services/output-validation.ts            — validateOutput()
Domain ports:    Executor, TicketRepository, ArtifactStore, GitGateway, ColumnSpecLoader, AgentSpecLoader
```

## Definition of Done
- [ ] Full orchestration sequence executes in correct order
- [ ] FAILED state set on executor or validation failure
- [ ] Integration test: full run with StubExecutor through BACKLOG column (stub spec)
- [ ] Code reviewed and approved
