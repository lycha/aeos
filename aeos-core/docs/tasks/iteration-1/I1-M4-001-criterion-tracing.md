# Task: Criterion Tracing

**Milestone:** I1-M4 — Prove
**Plan package:** 4.1
**Agent:** typescript-pro
**Method:** Agentic implementation, test-first
**Size:** M
**Human-owned inputs:** none

## Context
"Traceability runs both ways." The spec skills already give every acceptance criterion a stable id (`AC-12`, `AC-12a`) and tag scenarios with `@AC-12`, and the artefact-tree conventions define `Implements: AC-12, AC-13` commit trailers. Nothing checks any of it. An epic can reach the definition-of-done gate with a criterion that no task claimed and no test exercises.

This is a deterministic check. It needs no model.

## What needs to be done
1. **Pure domain service** `src/domain/services/criteria-trace.ts`:
   ```
   traceCriteria({ criteria: string[], nonGoals: string[], claims: Map<taskId, string[]>, instruments: Map<criterionId, string[]> })
     → { rows: Array<{ id, claimedBy: string[], instruments: string[] }>, unclaimed: string[], untested: string[], unknownClaims: Array<{ taskId, id }> }
   ```
2. **Criteria.** Parse ids from the pinned `spec.md`. Confirm the exact format `spec-writer` emits before writing the parser (ids look like `AC-<n>` with an optional lowercase suffix). Numbered non-goals (`NON-GOAL-<n>`) are listed and excluded from the trace.
3. **Claims.** A task declares the criteria it implements:
   - new option `aeos ticket create --parent <epic> --implements AC-1,AC-2`, stored on the ticket (migration: nullable `implements` text column) and in the ticket document
   - the architect's `taskInstruction` in `templates/agents/architect-agent.yaml` and `skills/aeos/SKILL.md` are updated to require it for every task of a spec-backed epic
   - the task's commit gains `Implements: AC-1, AC-2` through the trailer function from I1-M2-003
4. **Instruments.** Scan for criterion tags in two places:
   - `.feature` files of the pinned spec (`@AC-n` above a scenario)
   - the project's test files, by configurable globs `criteria.testGlobs` in `project.json` (default `["src/**/*.test.ts", "src/**/*.test.tsx", "tests/**/*"]`), matching `AC-<n>` in a test title or an `@AC-<n>` comment tag
5. **Report.** Write `<epic>-criteria-trace.md` (a table) and `.json` to the epic's ticket directory.
6. **Run it as a check.** Register it as a built-in check in the checks stage (I1-M2-001), applied at `INTEGRATION_REVIEW` for spec-backed epics, before the worker. It fails when any criterion is unclaimed or untested, or a task claims an id the spec does not contain. Failure output is the report.
7. **Task breakdown review.** Add the unclaimed list to the `TASK_BREAKDOWN` reviewer's context, so a decomposition that leaves a criterion unowned is rejected early, not at integration.
8. **Scenario filtering.** Now that tasks carry claims, a task worker's prompt includes only the scenarios tagged with its claimed criteria (the deferred step from I1-M3-002b).

## Acceptance Criteria
- [ ] Given a spec with AC-1..AC-4 and tasks claiming AC-1..AC-3, when traced, then AC-4 is unclaimed and integration review is blocked with the report
- [ ] Given a criterion that is claimed but appears in no test title or scenario tag, when traced, then it is listed as untested and blocks
- [ ] Given a task claiming AC-9 that the spec does not contain, when traced, then it is reported as an unknown claim and blocks
- [ ] Given every criterion claimed and tagged, when traced, then the check passes and the report is committed
- [ ] Given `AC-12a` and `AC-12b`, when parsed, then they are two criteria
- [ ] Given non-goals in the spec, when traced, then they appear in the report and never block
- [ ] Given an epic with no spec, when it reaches integration review, then the check is skipped
- [ ] Given a task claiming AC-1 only, when its prompt is built, then it contains the scenarios tagged `@AC-1` and no others

## Out of Scope
- Whether the tagged test actually passes (I1-M4-002a) or actually exercises the behaviour (the reviewer agent's job)
- Generating tests from scenarios

## Technical Notes / Hints
- `--implements` is a new option on `ticket create`; it is in the proposed CLI contract.
- The stub cannot shell out, so the end-to-end test passes `--implements` when it creates the child tasks itself, and the fixture feature from I1-M3-002a needs tagged tests.
- Keep the service pure: file reading and globbing belong in the application layer.

## Layer Mapping
```
Domain svc:  src/domain/services/criteria-trace.ts
Application: src/application/services/criteria-collector.ts (new), ticket-run.use-case.ts, ticket-create.use-case.ts, ticket-approve.use-case.ts, services/context-assembler.ts
CLI:         src/cli/commands/ticket-create.command.ts
Persistence: src/infrastructure/persistence/database.ts, sqlite-ticket.repository.ts
Templates:   templates/agents/architect-agent.yaml, skills/aeos/SKILL.md
```

## Dependencies
- I1-M2-001: the checks stage
- I1-M3-002b: the pinned spec in context

## Definition of Done
- [ ] Common Definition of Done in `README.md`
