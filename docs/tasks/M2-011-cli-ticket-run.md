# Task: Implement `aeos ticket run <id>` CLI Command

**Milestone:** M2 — Dogfood Harness
**Agent:** backend-architect
**Method:** Manual (last manual milestone)

## Context
The core orchestration command. Runs a full column cycle for a ticket: pre-flight → WORKING → executor → output validation → reviewer agent → SIGNED_OFF. This is the command that makes the pipeline real. Requires all M2 subsystems to be complete.

## What needs to be done
Implement `src/commands/ticket-run.ts` with the following orchestration sequence:

```
1. Load ticket from DB; verify it is in a runnable state (not DONE, not already WORKING)
2. Load ColumnSpec for current column; load AgentSpec from columnSpec.agentFile
3. Run pre-flight (M2-009); if blocked → exit cleanly with "Ticket is blocked" message
4. setSubState → WORKING
5. assembleContext() (M2-004)
6. buildPrompt() (M2-005)
7. executor.run() → ExecutorResult
8. If executor fails → setSubState(FAILED); print error; exit 1
9. validateOutput() (M2-006); if violations → setSubState(FAILED); print violations; exit 1
10. Run reviewer agent:
    - assembleContext with the new artifact included
    - buildPrompt using reviewer-agent.yaml + reviewer rubrics from columnSpec
    - executor.run() → reviewer artifact (<id>-review.md)
11. setSubState → IN_REVIEW; print reviewer output path
12. setSubState → SIGNED_OFF (in v1, reviewer pass = automatic sign-off)
13. Print: ✓ Column <column> complete for <id>. Run 'aeos ticket approve <id>' to advance.
```

The executor to use is determined by `agentSpec.executor.type` (stub or claude-cli).

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

## Definition of Done
- [ ] Full orchestration sequence executes in correct order
- [ ] FAILED state set on executor or validation failure
- [ ] Integration test: full run with StubExecutor through BACKLOG column (stub spec)
- [ ] Code reviewed and approved
