# Task: Implement Clear Error Messages for Every FAILED State

> **Archived, superseded by [I1-M4-004c](../iteration-1/I1-M4-004c-json-output-and-exit-codes.md).**
> Every error the CLI reports now has a stable `error.code` in one enum,
> `src/cli/error-codes.ts`. Of the list below it has `EXECUTOR_NONZERO_EXIT`,
> `VALIDATION_FAILED` and `EXECUTOR_NOT_FOUND` (this task's `CLAUDE_NOT_FOUND`,
> for any executor). `REVIEWER_REJECTED` and `PREFLIGHT_BLOCKED` are not
> failures: such a run ends `ESCALATED` or `BLOCKED`, exits `3`, and reports the
> engine's escalation reason (`ITERATIONS_EXHAUSTED`, `PREFLIGHT_BLOCKERS`, …).
> `EXECUTOR_TIMEOUT` has no code yet: no executor reports a timeout in words the
> CLI can tell apart. The message texts proposed here were not adopted; text
> output is unchanged.

**Milestone:** M7 — Polish & Distribution
**Agent:** typescript-pro
**Method:** Manual

## Context
Every FAILED state must have a specific, actionable error message that tells the operator exactly what went wrong and what to do next. Generic "something went wrong" errors are unacceptable for a CLI tool. This is a polish pass across the entire codebase — every `setSubState(FAILED)` call must be accompanied by a structured error message.

## What needs to be done
Implement in `src/shared/errors.ts` (extends the existing shared errors module) with an enum of all FAILED scenarios and their messages:

**Failure scenarios to cover (minimum):**
1. `EXECUTOR_TIMEOUT` — `✗ Executor timed out after {timeout}s for {ticketId} in {column}.\n  → Check claude CLI connectivity. Run 'aeos ticket run {id}' to retry.`
2. `EXECUTOR_NONZERO_EXIT` — `✗ Executor exited with code {code}.\n  Stderr: {stderr}\n  → Check claude CLI authentication. Run 'aeos ticket run {id}' to retry.`
3. `VALIDATION_FAILED` — `✗ Output validation failed for {ticketId} ({column}):\n  {violations}\n  → Improve the ticket description and retry.`
4. `REVIEWER_REJECTED` — `✗ Reviewer rejected artifact for {ticketId} ({column}).\n  Review: {reviewPath}\n  → Read the review, update the ticket or rubric, then retry.`
5. `PREFLIGHT_BLOCKED` — `✗ Pre-flight identified blockers for {ticketId}.\n  Questions: {questionsPath}\n  → Answer the questions and run 'aeos ticket answer {id}'.`
6. `CLAUDE_NOT_FOUND` — `✗ 'claude' CLI not found on PATH.\n  → Install: npm install -g @anthropic-ai/claude-code`

Audit every `stateMachine.setSubState(projectId, ticketId, 'FAILED')` call in the codebase and ensure each one uses one of these messages.

## Acceptance Criteria
- [ ] Given executor timeout, when printed to stderr, then message includes timeout duration, ticket ID, and retry instruction
- [ ] Given validation failure, when printed, then all violation strings are listed
- [ ] Given reviewer rejection, when printed, then the path to the review artifact is shown
- [ ] Given `claude` not on PATH, when error is shown, then install command is provided
- [ ] Given all FAILED scenarios, when triggered in tests, then no FAILED state produces a generic or empty error message

## Out of Scope
- Sentry or remote error reporting (v2)
- Log files (v2 — v1 errors go to stderr only)

## Technical Notes / Hints
- Export a `formatError(scenario, context)` function that returns the formatted string
- Write to `process.stderr` not `console.error` for structured error output

## Dependencies
- All M1 and M2 implementation tasks complete (audit requires all setSubState calls to exist)

## Layer Mapping
```
Shared:  src/shared/errors.ts   — FailedScenario enum + formatError() function
```

## Definition of Done
- [ ] `src/shared/errors.ts` extended with all 6 FAILED scenarios
- [ ] Every `stateMachine.setSubState(..., 'FAILED')` call in the codebase uses a named error message
- [ ] Unit tests: each message format renders correctly with its context variables
- [ ] Code reviewed and approved
