# Task: A Checks Stage Before the Reviewer

**Milestone:** I1-M2 — Guard
**Plan package:** 2.1
**Agent:** typescript-pro
**Method:** Agentic implementation, test-first
**Size:** M
**Human-owned inputs:** none

## Context
Principle VI: checks run first, review agents second. Today `runAttempt` in `src/application/ticket-run.use-case.ts` goes worker → `validateOutput` (word count, sections, "a diff exists") → commit → `runReview`. No lint, typecheck or test runs before a model is asked to review. A red build reaches the reviewer and costs a model call to be told what `npm test` would have said.

## What needs to be done
1. **Configuration.** Add an optional `checks` list to `.aeos/project.json` (`ProjectExecutorConfig`), validated with Zod on read:
   ```json
   "checks": [
     { "name": "typecheck", "command": "npm run typecheck", "timeoutSeconds": 120 },
     { "name": "lint", "command": "npm run lint", "timeoutSeconds": 120 },
     { "name": "test", "command": "npm test", "timeoutSeconds": 600 }
   ]
   ```
   Order is execution order. The operator lists the fastest first.
2. **Column opt-in.** Add `runChecks?: boolean` to `ColumnSpec` and `ColumnSpecSchema`. Set it `true` in the `implementation.yaml` and `integration-review.yaml` templates. Absent means false.
3. **Port and adapter.** `checks-runner.port.ts`: `run(check, cwd) → { name, exitCode, durationMs, timedOut, outputTail }`. A shell adapter spawns the command in the project root, captures combined output, keeps the last 200 lines, and kills on timeout.
4. **Wire into the loop.** In `runAttempt`, after validation passes and before the artefact commit, when `columnSpec.runChecks` is true and checks are configured: run them in order and stop at the first failure.
5. **On failure.** Return a new `AttemptOutcome` kind `checks-failed` carrying the check name and output tail. `decideNextAttempt` in `domain/services/review-loop-policy.ts` treats it as a rejection: it counts toward `maxIterations`, and its "blocker topic" for convergence detection is `check:<name>`. The next worker attempt receives the output as `previous-checks.md` (use `withExtraArtifact`, as the review feedback does). **The reviewer is not invoked.**
6. **On success.** Write `<ticket>-checks.md` (a table of name, result, duration) and commit it with the artefact. Give it to the reviewer as an extra artefact so the review can rely on it.
7. **Run records.** Write one record per checks stage with `role: checks`, `executor: shell`, `cost_basis: none`, `verdict: CHECKS_PASSED | CHECKS_FAILED`.
8. **Events.** Emit `stage.started/completed/failed` with phase `checks` so the terminal display shows the stage. Add the phase to `TicketRunPhase` and to `ticket-run-display.ts`.

## Acceptance Criteria
- [ ] Given a column with `runChecks: true` and a failing check, when the attempt runs, then the reviewer executor is never invoked
- [ ] Given a failing check, when the next attempt starts, then the worker's context contains the check's output
- [ ] Given checks that fail on every attempt, when the iteration cap is reached, then the ticket is `ESCALATED`, not `FAILED`
- [ ] Given three checks where the second fails, when run, then the third does not run
- [ ] Given passing checks, when the reviewer runs, then its context contains the checks table
- [ ] Given a check that exceeds its timeout, when run, then it is killed and reported as failed with `timedOut: true`
- [ ] Given a column without `runChecks`, when run, then behaviour is unchanged from today
- [ ] Given the end-to-end test with a check of `node -e "process.exit(1)"`, when the task runs, then no reviewer run record exists for that attempt

## Out of Scope
- Deciding which checks a project should have. The list is the operator's.
- Parallel checks, caching, or running only on changed files
- Built-in checks (criterion tracing arrives in I1-M4-001 and reuses this stage)

## Technical Notes / Hints
- `review-loop-policy.ts` is pure and the most heavily tested file in the repo. Extend its tests first.
- The check commands come from `project.json`, which a person writes. I1-M2-002 makes that file a protected path, so an agent cannot rewrite its own checks.
- An agentic worker has `Bash` and may have run the tests itself. Run them anyway: the stage is the evidence, not the agent's word.

## Layer Mapping
```
Domain model: src/domain/model/column-spec.ts, project-executor-config.ts, ticket-run-event.ts
Domain svc:   src/domain/services/review-loop-policy.ts
Domain port:  src/domain/ports/driven/checks-runner.port.ts
Adapter:      src/infrastructure/checks/shell-checks-runner.adapter.ts
Spec loader:  src/infrastructure/spec-loader/schemas.ts
Application:  src/application/ticket-run.use-case.ts
CLI:          src/cli/ui/ticket-run-display.ts, src/cli/container.ts
Templates:    templates/column-specs/implementation.yaml, integration-review.yaml
```

## Dependencies
- I1-M1-003: run records

## Definition of Done
- [ ] Common Definition of Done in `README.md`
- [ ] This repository's own `.aeos/project.json` gets a `checks` list in a separate, human-made change
