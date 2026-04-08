# BUG-001: Deadlock after `ticket approve` — ticket stuck in BLOCKED with no questions file

**Severity:** Critical (workflow-blocking)
**Discovered:** 2026-04-08
**Component:** `ticket-approve` / `ticket-run` interaction
**Status:** Open

## Summary

After `aeos ticket approve` advances a ticket to the next column, the ticket is permanently stuck. `ticket run` refuses to execute because the ticket is BLOCKED, and `ticket answer` refuses to execute because no questions file exists. There is no way to unstick the ticket through normal CLI commands. This affects **every** column transition via `approve`, not just BACKLOG → PRODUCT_SCOPING.

## Steps to Reproduce

```bash
aeos ticket approve AEOS-1
# ✓ Ticket AEOS-1 advanced: BACKLOG → PRODUCT_SCOPING (sub-state: BLOCKED)

aeos ticket run AEOS-1
# ⚠ Ticket AEOS-1 is blocked:
#   - Ticket is blocked — run `aeos ticket answer` first

aeos ticket answer AEOS-1
# Error: Questions file not found: AEOS-1-questions.md
```

## Expected Behaviour

`aeos ticket run AEOS-1` should execute the preflight step for the new column, generating the questions file (or proceeding directly if preflight returns `NO_BLOCKERS`).

## Actual Behaviour

`ticket run` short-circuits at the BLOCKED guard (line 70–75) before reaching the preflight step (line 93–109), returning immediately with _"Ticket is blocked — run `aeos ticket answer` first"_. Since preflight never ran, no questions file was written, so `ticket answer` also fails.

## Root Cause

Two commands set sub-state to BLOCKED for **different semantic reasons**, but `ticket run` treats all BLOCKED states identically:


| Command                      | Sets BLOCKED because…                               | Questions file exists? |
| ---------------------------- | ---------------------------------------------------- | ---------------------- |
| `ticket approve` (line 59)   | New column entry — ticket needs its first `run`      | **No**                 |
| `PreflightService` (line 64) | Preflight generated questions needing human answers   | **Yes**                |

The BLOCKED guard in `ticket-run.use-case.ts` does not distinguish between these two cases:

```typescript
// src/application/ticket-run.use-case.ts:70-75
if (ticket.subState === 'BLOCKED') {
  return {
    status: 'blocked',
    ticketId,
    blockers: ['Ticket is blocked — run `aeos ticket answer` first'],
  };
}
```

## Affected Files

- `src/application/ticket-approve.use-case.ts` — sets BLOCKED on column advance (line 59)
- `src/application/ticket-run.use-case.ts` — BLOCKED guard prevents run (lines 70–75)
- `src/application/ticket-answer.use-case.ts` — requires questions file to exist (lines 40–43)
- `src/application/services/preflight.ts` — sets BLOCKED after writing questions (line 64)

## Possible Fixes

### Option A: Change `ticket approve` to set a different initial sub-state

Use a sub-state that `ticket run` accepts (e.g. a new `READY` state) so the run can proceed into preflight. This is the most semantically correct fix — "just arrived in column" is not the same as "blocked on human input."

**Cost:** Requires adding a 7th value to the `SubState` enum in `src/domain/model/sub-state.ts`, updating `isValidSubState`, and updating any DB schema constraints that enumerate valid sub-state values. `null` is not viable here because `stateMachine.setSubState()` validates via `isValidSubState()` which only accepts the 6 existing enum strings.

## Related Issue: Questions filename mismatch

`ticket-answer.use-case.ts` (line 40) hardcodes the questions filename as `${ticketId}-questions.md`, but `PreflightService` (line 62) derives it from `columnSpec.preflight.questionsArtifact` (`${ticketId}-${columnSpec.preflight.questionsArtifact}`). The default value of `questionsArtifact` is `'questions.md'` so they agree under default config, but a custom `questionsArtifact` value would cause preflight to write one filename while `ticket answer` looks for a different one.

## Tests to Add

- Given a ticket just advanced via `approve` (BLOCKED, no questions file), `ticket run` should proceed to preflight
- Given a ticket blocked by preflight (BLOCKED, questions file exists), `ticket run` should return blocked status
- End-to-end: `approve` → `run` → (preflight) should not deadlock
