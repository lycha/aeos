# Task: Implement `aeos costs` Spend Report Command

**Milestone:** M7 — Polish & Distribution
**Agent:** typescript-pro
**Method:** Manual

## Context
Gives the operator visibility into LLM spend across all projects and tickets. Reads from `cost_records` tables in each project's `state.db`. Essential for users managing API budgets. Requires the `cost_records` table to have been populated by M2's executor (cost tracking is part of `ExecutorResult`).

## What needs to be done
Implement `src/commands/costs.ts`:

1. Accept optional flags: `--project <key>`, `--ticket <id>`, `--since <YYYY-MM-DD>`
2. Aggregate `cost_records` across all registered projects (or filtered by `--project`)
3. Print a report:
   ```
   AEOS Cost Report
   ─────────────────────────────────────────────────────
   Period: all time  (use --since YYYY-MM-DD to filter)

   By Project:
     aeos [AEOS]                  $4.23
       AEOS-1  PRODUCT_SCOPING    $0.42  (1,240 in / 890 out tokens)
       AEOS-2  ARCH_SPIKE         $1.10  (3,200 in / 2,100 out tokens)

   ─────────────────────────────────────────────────────
   Total:                         $4.23
   ```
4. If `cost_usd` is 0 for all records (e.g., StubExecutor was used), note: `Note: no cost data — StubExecutor records zero cost.`

## Acceptance Criteria
- [ ] Given `cost_records` with data for 2 projects, when running `aeos costs`, then both projects and their totals appear
- [ ] Given `--since 2026-01-01`, when running `aeos costs --since 2026-01-01`, then only records from that date onwards are included
- [ ] Given `--ticket AEOS-1`, when running `aeos costs --ticket AEOS-1`, then only AEOS-1 records appear
- [ ] Given all records have `cost_usd = 0`, when running `aeos costs`, then the stub note is shown
- [ ] Given no `cost_records` exist, when running `aeos costs`, then `No cost data recorded yet.` is shown

## Out of Scope
- Export to CSV or JSON (v2)
- Real-time budget alerts (v2)
- Currency conversion (costs are stored in USD; display currency conversion is v2)

## Dependencies
- M1-006: SQLite `cost_records` table
- M2-003: `ClaudeCodeCliExecutor` populates cost data
- M1-011: `aeosRegistryPath()` to find all projects

## Definition of Done
- [ ] `aeos costs` renders correct aggregated spend report
- [ ] All filter flags work correctly
- [ ] Stub-executor zero-cost case handled with note
- [ ] Unit tests: multi-project aggregation, date filter, ticket filter, zero costs
- [ ] Code reviewed and approved
