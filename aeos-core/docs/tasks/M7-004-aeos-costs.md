# Task: Implement `aeos costs` Spend Report Command

**Milestone:** M7 — Polish & Distribution
**Agent:** typescript-pro
**Method:** Manual

## Context
Gives the operator visibility into LLM spend across all projects and tickets. Reads from the `cost_records` table in the global `~/.aeos/state.db` (all cost records across all projects are stored centrally). Essential for users managing API budgets. Requires the `cost_records` table to have been populated by M2's executor (cost tracking is part of `ExecutorResult`).

## What needs to be done
Implement the CLI command in `src/cli/commands/costs.command.ts` and the use case in `src/application/costs.use-case.ts`:

**CLI command** (`costs.command.ts`):
1. Parse optional flags: `--project <key>`, `--ticket <id>`, `--since <YYYY-MM-DD>`
2. Call the use case with filters
3. Render the report from returned data

**Use case** (`costs.use-case.ts`):
1. Query `CostRepository.findByFilters({ projectId?, ticketId?, since? })`
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

## Technical Notes / Hints
- Single DB query fetches all cost records — no need to open per-project DBs
- The `agent` column (added to `cost_records` in M1-006 review) enables per-agent cost breakdowns in future iterations
- Group by `project_id` for the "By Project" view

## Layer Mapping
```
CLI command:  src/cli/commands/costs.command.ts     — parse flags, call use case, render report
Use case:     src/application/costs.use-case.ts     — query CostRepository with filters, aggregate
Domain ports: CostRepository
Adapters:     SqliteCostRepository (src/infrastructure/persistence/sqlite-cost.repository.ts)
```

## Dependencies
- M1-006: SQLite `cost_records` table (global DB with `project_id`, `agent`, `executor` columns)
- M2-003: `ClaudeCodeCliExecutor` populates cost data

## Definition of Done
- [ ] `aeos costs` renders correct aggregated spend report
- [ ] All filter flags work correctly
- [ ] Stub-executor zero-cost case handled with note
- [ ] Unit tests: multi-project aggregation, date filter, ticket filter, zero costs
- [ ] Code reviewed and approved
