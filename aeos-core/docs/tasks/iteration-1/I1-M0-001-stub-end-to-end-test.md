# Task: Stub End-to-End Test of Both Pipelines in CI

**Milestone:** I1-M0 — Harness
**Plan package:** 0.1
**Agent:** typescript-pro
**Method:** Agentic implementation, test-first
**Size:** M
**Human-owned inputs:** none

## Context
`CLAUDE.md` warns that if the verdict contract or a word count changes and the stub executor is not updated, `AEOS_EXECUTOR=stub` "silently stops working, and no unit test will catch it because they all mock the executor". Every later task in this iteration changes something the stub takes part in. This test is the regression harness for all of them, and from M1 on it is the gate for tagging a build.

## What needs to be done
Add `src/e2e/pipeline.e2e.test.ts`. It is picked up by the existing Vitest glob (`src/**/*.test.ts`), so it runs in `npm test` and in CI with no workflow change.

1. In `beforeEach`, create a temporary `AEOS_HOME` and a temporary project directory with `git init` and one commit. Set `AEOS_EXECUTOR=stub`. Reset the lazy database singleton (`resetDb`) between tests.
2. Drive the CLI through `buildProgram().parseAsync([...])` wherever practical, so command wiring is covered as well as use cases. Fall back to `createContainer()` use cases only where a command is interactive.
3. **Epic path.** `install` → `project init` → `ticket create` (epic) → for each epic column: `ticket run`, assert `SIGNED_OFF`, `ticket approve`. At `TASK_BREAKDOWN` the stub cannot shell out to create children, so the test creates two child tasks itself with `ticket create --parent <epic> --key T-001` and `T-002`.
4. **Task path.** Drive both children `IMPLEMENTATION → CODE_REVIEW → QA → DONE`. Assert each finished task produced exactly one commit in the project repository.
5. Return to the epic: `INTEGRATION_REVIEW`, `DOD_GATE`, `ticket dod-approve`, assert `DONE`.
6. **Standalone task.** Create a task with no parent and drive it to `DONE`.
7. **Contract-break test.** A second test wraps the stub so its reviewer output has no `AEOS-VERDICT` trailer, runs one column, and asserts the ticket is `ESCALATED` (not `FAILED`, not `SIGNED_OFF`).
8. Export small helpers (`createTempProject`, `runCli`, `driveColumn`) from `src/e2e/harness.ts`. Later tasks extend this file rather than writing their own scaffolding.

## Acceptance Criteria
- [ ] Given a fresh temp project and `AEOS_EXECUTOR=stub`, when the epic path runs, then the epic and both children end in `DONE` with no model calls
- [ ] Given a standalone task with no parent, when driven through its columns, then it ends in `DONE`
- [ ] Given a reviewer output with no verdict trailer, when a column runs, then the ticket is `ESCALATED`
- [ ] Given the test suite, when run twice in a row, then it passes both times and leaves nothing in the real `~/.aeos`
- [ ] Given `npm test` in CI, when the workflow runs, then the end-to-end test is included

## Out of Scope
- Real executors. Smoke tests stay separate and are not part of `npm test`.
- Asserting artefact content. The stub's text is filler by design.

## Technical Notes / Hints
- Find out first how the stub satisfies "agentic implementation must leave a real git diff" (`ticket-run.use-case.ts`, the validation block after the worker). If the stub writes no repository change, have the harness do it through a documented hook rather than weakening the guarantee.
- The orchestrator's `AWAITING_DECOMPOSITION` halt exists for exactly the stub case; step 3 mirrors it.
- Keep the whole file under ten seconds. If it is slower, the cause is almost always a real `git` spawn per assertion; batch them.

## Layer Mapping
```
Test:     src/e2e/pipeline.e2e.test.ts
Harness:  src/e2e/harness.ts
Touches:  src/infrastructure/executor/stub-executor.adapter.ts (only if a hook is needed)
```

## Dependencies
- None. This is the first task of the iteration.

## Definition of Done
- [ ] Common Definition of Done in `README.md`
- [ ] Both tests pass locally and in CI
- [ ] `harness.ts` exports documented helpers
