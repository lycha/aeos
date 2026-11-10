# Task: Unknown Cost Is Null, and a Budget Needs a Reporting Executor

**Milestone:** I1-M1 — Measure
**Plan package:** 1.2
**Agent:** typescript-pro
**Method:** Agentic implementation, test-first
**Size:** S
**Human-owned inputs:** none (decision D5)

## Context
`recordCost` in `src/application/ticket-run.use-case.ts` coalesces missing usage to `0`. An executor that cannot report cost therefore looks free, and a budget set on such a run looks active when it is not. Decision D5: unknown cost is `null`, never `0`, and `--budget` is refused on an executor that cannot report.

## What needs to be done
1. **Domain.** In `cost-record.ts` and `executor-result.ts` make `costUsd: number | null`. `ExecutorSuccess.usage` undefined means unknown.
2. **Persistence.** `cost_records.cost_usd` is `REAL NOT NULL DEFAULT 0.0` and SQLite cannot drop `NOT NULL` in place. Append a migration that adds `cost_known INTEGER NOT NULL DEFAULT 0`. Existing rows correctly become "unknown": every one of them was written as 0 by the TODO. Map `cost_known = 0` to `costUsd: null` in `sqlite-cost.repository.ts`.
3. **Recording.** `recordCost` and `emitCostEvent` pass `null` through. Remove both `?? 0` on cost.
4. **Capability.** Add `reportsCost(executorType): boolean` beside the existing `supportsAgenticExecution` logic (a pure function in `domain/services/` is the right home). `claude-cli` and `stub` report; `auggie-cli`, `opencode-cli` and `ollama-cli` do not until their TODOs are done.
5. **Budget refusal.** In `orchestrator.use-case.ts`, when a budget is set or already persisted, resolve the executor for every agent the epic's and task's columns will use. If any cannot report, refuse before running with a message naming the agent and executor.
6. **Budget arithmetic.** `spentUsd` sums known costs only. If a `null` cost is recorded for an epic that has a budget (an override changed the executor mid-epic), halt with a new `HaltReason.COST_UNKNOWN`.
7. **Display.** `ticket show` and the run display print `unknown`, not `$0.00`, for null.
8. The stub keeps returning `costUsd: 0` as a *known* zero, so the end-to-end test can exercise budgets.

## Acceptance Criteria
- [ ] Given an executor result with no usage, when recorded, then the stored cost reads back as `null`
- [ ] Given a database at version 5 with existing rows, when migrated, then those rows read back with `costUsd: null`
- [ ] Given `orchestrator run --budget 5` and an agent resolved to `ollama-cli`, when started, then it is refused before any run with the agent and executor named
- [ ] Given a budget of 1.00 and recorded costs totalling 1.20, when the scheduler is asked, then it halts with `BUDGET_EXCEEDED`
- [ ] Given a budgeted epic and a `null` cost record, when the scheduler is asked, then it halts with `COST_UNKNOWN`
- [ ] Given a null cost, when shown, then the text is `unknown`

## Out of Scope
- Parsing usage for the other executors
- A price table

## Technical Notes / Hints
- `decideNextAction` in `orchestrator-policy.ts` is a pure function and the most heavily tested logic in the repo. Add `COST_UNKNOWN` there with tests; do not move the check into the use case.
- Migration number: take the next free one at merge time (see `README.md`, rule 6).

## Layer Mapping
```
Domain:      src/domain/model/cost-record.ts, executor-result.ts
             src/domain/services/orchestrator-policy.ts   — COST_UNKNOWN, spentUsd over known costs
             src/domain/services/ (new) executor-capabilities.ts
Application: src/application/ticket-run.use-case.ts       — recordCost, emitCostEvent
             src/application/orchestrator.use-case.ts     — budget refusal
             src/application/ticket-show.use-case.ts      — display
Adapters:    src/infrastructure/persistence/database.ts   — migration
             src/infrastructure/persistence/sqlite-cost.repository.ts
```

## Dependencies
- I1-M1-001: the Claude executor must report cost, or every real run becomes "unknown"

## Definition of Done
- [ ] Common Definition of Done in `README.md`
- [ ] Migration tested against a copy of a real `state.db`, not only a fresh one
