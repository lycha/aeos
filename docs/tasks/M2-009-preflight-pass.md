# Task: Implement Pre-flight Pass

**Milestone:** M2 — Dogfood Harness
**Agent:** backend-architect
**Method:** Manual (last manual milestone)

## Context
A lightweight executor invocation run before the main column run. If the model identifies blocking questions, the ticket transitions to BLOCKED and a questions artifact is written. The operator answers the questions, then resumes. This prevents expensive main runs from producing bad artifacts due to underspecified tickets.

## What needs to be done
Implement as part of the `ticket-run` use case in `src/application/ticket-run.use-case.ts` (or as a dedicated application service in `src/application/services/preflight.ts` if extracted for testability). The preflight logic receives ports via constructor injection — it does NOT depend on `Database` or raw `db` handles:

```typescript
export type PreflightResult =
  | { blocked: false }
  | { blocked: true; questionsPath: string };

export class PreflightService {
  constructor(
    private executor: Executor,
    private artifactStore: ArtifactStore,
    private stateMachine: StateMachineService,
  ) {}

  async run(
    ticketId: string,
    projectId: string,
    columnSpec: ColumnSpec,
    agentSpec: AgentSpec,
  ): Promise<PreflightResult>
}
```

Implementation:
1. If `columnSpec.preflight.enabled === false`: return `{ blocked: false }` immediately
2. Build a preflight-specific prompt:
   ```
   [ROLE] You are a requirements analyst.
   [CONTEXT] <ticket content only — no prior artifacts>
   [TASK] Identify any blocking questions that, if unanswered, would prevent you from producing
   a high-quality <columnSpec.outputArtifact>. If there are no blockers, respond with exactly:
   NO_BLOCKERS
   [OUTPUT FORMAT] Either: "NO_BLOCKERS" or a numbered list of questions.
   ```
3. Run the executor with the preflight prompt, output to a temp path
4. Read the output:
   - If it contains `NO_BLOCKERS`: return `{ blocked: false }`
   - Otherwise: write output via `this.artifactStore.writeArtifact(ticketId, 'questions.md', content)`, call `this.stateMachine.setSubState(projectId, ticketId, 'BLOCKED')`, return `{ blocked: true, questionsPath }`

## Acceptance Criteria
- [ ] Given a clear, complete ticket, when preflight runs and model responds `NO_BLOCKERS`, then result is `{ blocked: false }`
- [ ] Given an underspecified ticket, when model responds with questions, then `<id>-questions.md` is written to `.aeos/tickets/<id>/` and result is `{ blocked: true }`
- [ ] Given `preflight.enabled: false` in column spec, when calling `runPreflight()`, then it returns `{ blocked: false }` without any executor call
- [ ] Given a blocked result, when checking DB, then ticket sub-state is `BLOCKED`

## Out of Scope
- The `aeos ticket answer` command (M2-010)
- Preflight rubric or review (preflight is lightweight by design)

## Layer Mapping
```
Application:     src/application/services/preflight.ts (or inline in ticket-run.use-case.ts)
Domain service:  src/domain/services/state-machine.ts     — StateMachineService.setSubState()
Domain ports:    src/domain/ports/driven/executor.port.ts  — Executor
                 src/domain/ports/driven/artifact-store.port.ts — ArtifactStore
```

## Dependencies
- M2-001: Executor port
- M2-004: ContextAssembler (for reading ticket content)
- M1-008/M1-009: `StateMachineService` (setSubState via ports)
- M2-007/M2-008: ColumnSpec and AgentSpec types

## Definition of Done
- [ ] Pre-flight correctly detects blockers and non-blockers
- [ ] `preflight.enabled: false` short-circuits without executor call
- [ ] DB sub-state updated on block
- [ ] Unit tests with stubbed executor (both blocker and clear cases)
- [ ] Code reviewed and approved
