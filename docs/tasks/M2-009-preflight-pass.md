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
  | { blocked: true; questionsPath: string };  // questionsPath is the artifact filename, e.g. "AEOS-1-questions.md"

export class PreflightService {
  constructor(
    private executor: Executor,
    private artifactStore: ArtifactStore,
    private stateMachine: StateMachineService,
  ) {}

  async run(
    ticketId: string,
    projectId: string,
    projectPath: string,       // filesystem path for ArtifactStore port calls
    ticketContent: string,     // ticket markdown content for the preflight prompt
    columnSpec: ColumnSpec,
  ): Promise<PreflightResult>
}
```

> **Note:** `agentSpec` was removed from `run()` — the preflight prompt uses a generic
> "requirements analyst" role rather than the agent's own system prompt (see Design Notes below).
> If a future iteration aligns with system design §7.2 (agent's own prompt), re-add `agentSpec`
> and inject `agentSpec.systemPrompt` into the `[ROLE]` section.

Implementation:
1. If `columnSpec.preflight.enabled === false`: return `{ blocked: false }` immediately
2. Build a preflight-specific prompt:
   ```
   [ROLE] You are a requirements analyst.
   [CONTEXT] <ticketContent — no prior artifacts>
   [TASK] Identify any blocking questions that, if unanswered, would prevent you from producing
   a high-quality <columnSpec.outputArtifact>. If there are no blockers, respond with exactly:
   NO_BLOCKERS
   [OUTPUT FORMAT] Either: "NO_BLOCKERS" or a numbered list of questions.
   ```
3. Construct an `ExecutorInvocation` and run the executor:
   - Generate a temp output path (e.g., `path.join(os.tmpdir(), \`preflight-${ticketId}-${uuid()}.md\`)`)
   - Derive `column` from `columnSpec.column` (map the string to the `Column` enum value)
   - Call `executor.run({ prompt, outputPath: tempPath, ticketId, column })`
4. Read the executor output from `ExecutorResult.content` (see cross-cutting note below):
   - If it contains `NO_BLOCKERS`: return `{ blocked: false }`
   - Otherwise:
     ```typescript
     const questionsFilename = `${ticketId}-${columnSpec.preflight.questionsArtifact}`;
     this.artifactStore.writeArtifact(projectPath, ticketId, questionsFilename, content);
     this.stateMachine.setSubState(projectId, ticketId, 'BLOCKED');
     return { blocked: true, questionsPath: questionsFilename };
     ```

> **Cross-cutting amendment (M2-001):** The `ExecutorResult` interface must be extended with
> an optional `content?: string` field so the preflight service can inspect the executor's
> raw output without a redundant filesystem round-trip or a new file-reader port:
> ```typescript
> export interface ExecutorResult {
>   success: boolean;
>   artifactPath: string;
>   content?: string;     // raw output text (used by preflight for NO_BLOCKERS check)
>   usage?: { inputTokens: number; outputTokens: number; costUsd: number };
>   error?: string;
> }
> ```

## Acceptance Criteria
- [ ] Given a clear, complete ticket, when preflight runs and model responds `NO_BLOCKERS`, then result is `{ blocked: false }`
- [ ] Given an underspecified ticket, when model responds with questions, then `<id>-questions.md` (e.g. `AEOS-1-questions.md`) is written to `.aeos/tickets/<id>/` via `writeArtifact(projectPath, ticketId, filename, content)` and result is `{ blocked: true, questionsPath: '<id>-questions.md' }`
- [ ] Given `preflight.enabled: false` in column spec, when calling `runPreflight()`, then it returns `{ blocked: false }` without any executor call
- [ ] Given a blocked result, when checking DB, then ticket sub-state is `BLOCKED`

## Out of Scope
- The `aeos ticket answer` command (M2-010)
- Preflight rubric or review (preflight is lightweight by design)

## Layer Mapping
```
Application:     src/application/services/preflight.ts (or inline in ticket-run.use-case.ts)
Barrel:          src/application/services/index.ts — re-export PreflightService
Domain service:  src/domain/services/state-machine.ts     — StateMachineService.setSubState()
Domain ports:    src/domain/ports/driven/executor.port.ts  — Executor
                 src/domain/ports/driven/artifact-store.port.ts — ArtifactStore
```

## Dependencies
- M2-001: Executor port (amend `ExecutorResult` to add `content?: string` — see cross-cutting note above)
- M1-008/M1-009: `StateMachineService` (setSubState via ports)
- M2-007/M2-008: ColumnSpec types (`ColumnSpec.preflight.questionsArtifact` for filename)

> **Removed:** M2-004 (ContextAssembler) is no longer a dependency. Ticket content is passed
> directly as the `ticketContent` parameter by the caller (M2-011 `ticket-run`), which will
> have already assembled context.

## Definition of Done
- [ ] Pre-flight correctly detects blockers and non-blockers
- [ ] `preflight.enabled: false` short-circuits without executor call
- [ ] DB sub-state updated on block
- [ ] Unit tests with stubbed executor (both blocker and clear cases); stub `ExecutorResult.content` to test `NO_BLOCKERS` parsing and questions output
- [ ] Code reviewed and approved

## Design Notes

### Preflight prompt — generic role vs agent system prompt
System design §7.2 uses the agent's own system prompt for preflight. This task uses a
generic "requirements analyst" role instead. **Rationale:** the preflight is a meta-task
(identifying gaps, not producing the artifact), so a specialist prompt produces better
gap detection than the domain-specific agent prompt. This is a deliberate deviation.

### Context scope — ticket only vs full context
System design §7.2 injects the same assembled context as the main run. This task injects
ticket content only. **Rationale:** prior artifacts are irrelevant for gap detection in the
current column's input; including them would increase cost with no benefit.
