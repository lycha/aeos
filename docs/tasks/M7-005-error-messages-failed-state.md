# Task: Implement Clear Error Messages for Every FAILED State

**Milestone:** M7 — Polish & Distribution
**Agent:** typescript-pro
**Method:** Manual

## Context
Every FAILED state must have a specific, actionable error message that tells the operator exactly what went wrong and what to do next. Generic "something went wrong" errors are unacceptable for a CLI tool. This is a polish pass across the entire codebase — every `setSubState(FAILED)` call must be accompanied by a structured error message.

## What needs to be done
Create `src/errors/error-messages.ts` with an enum of all FAILED scenarios and their messages:

**Failure scenarios to cover (minimum):**
1. `EXECUTOR_TIMEOUT` — `✗ Executor timed out after {timeout}s for {ticketId} in {column}.\n  → Check claude CLI connectivity. Run 'aeos ticket run {id}' to retry.`
2. `EXECUTOR_NONZERO_EXIT` — `✗ Executor exited with code {code}.\n  Stderr: {stderr}\n  → Check claude CLI authentication. Run 'aeos ticket run {id}' to retry.`
3. `VALIDATION_FAILED` — `✗ Output validation failed for {ticketId} ({column}):\n  {violations}\n  → Improve the ticket description and retry.`
4. `REVIEWER_REJECTED` — `✗ Reviewer rejected artifact for {ticketId} ({column}).\n  Review: {reviewPath}\n  → Read the review, update the ticket or rubric, then retry.`
5. `PREFLIGHT_BLOCKED` — `✗ Pre-flight identified blockers for {ticketId}.\n  Questions: {questionsPath}\n  → Answer the questions and run 'aeos ticket answer {id}'.`
6. `CLAUDE_NOT_FOUND` — `✗ 'claude' CLI not found on PATH.\n  → Install: npm install -g @anthropic-ai/claude-code`

Audit every `setSubState(FAILED)` call in the codebase and ensure each one uses one of these messages.

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

## Definition of Done
- [ ] `src/errors/error-messages.ts` implemented with all 6 scenarios
- [ ] Every `setSubState(FAILED)` call in the codebase uses a named error message
- [ ] Unit tests: each message format renders correctly with its context variables
- [ ] Code reviewed and approved
