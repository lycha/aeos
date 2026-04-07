# Task: Implement Pre-flight Pass

**Milestone:** M2 — Dogfood Harness
**Agent:** backend-architect
**Method:** Manual (last manual milestone)

## Context
A lightweight executor invocation run before the main column run. If the model identifies blocking questions, the ticket transitions to BLOCKED and a questions artifact is written. The operator answers the questions, then resumes. This prevents expensive main runs from producing bad artifacts due to underspecified tickets.

## What needs to be done
Create `src/orchestrator/preflight.ts` exporting:

```typescript
export type PreflightResult =
  | { blocked: false }
  | { blocked: true; questionsPath: string };

export async function runPreflight(
  ticketId: string,
  columnSpec: ColumnSpec,
  agentSpec: AgentSpec,
  executor: Executor,
  db: Database,
  root?: string,
): Promise<PreflightResult>
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
   - Otherwise: write output to `<ticketId>-questions.md`, call `setSubState(BLOCKED)`, return `{ blocked: true, questionsPath }`

## Acceptance Criteria
- [ ] Given a clear, complete ticket, when preflight runs and model responds `NO_BLOCKERS`, then result is `{ blocked: false }`
- [ ] Given an underspecified ticket, when model responds with questions, then `<id>-questions.md` is written and result is `{ blocked: true }`
- [ ] Given `preflight.enabled: false` in column spec, when calling `runPreflight()`, then it returns `{ blocked: false }` without any executor call
- [ ] Given a blocked result, when checking DB, then ticket sub-state is `BLOCKED`

## Out of Scope
- The `aeos ticket answer` command (M2-010)
- Preflight rubric or review (preflight is lightweight by design)

## Dependencies
- M2-001: Executor interface
- M2-004: ContextAssembler (for reading ticket content)
- M1-009: `setSubState()`
- M2-007/M2-008: ColumnSpec and AgentSpec types

## Definition of Done
- [ ] Pre-flight correctly detects blockers and non-blockers
- [ ] `preflight.enabled: false` short-circuits without executor call
- [ ] DB sub-state updated on block
- [ ] Unit tests with stubbed executor (both blocker and clear cases)
- [ ] Code reviewed and approved
