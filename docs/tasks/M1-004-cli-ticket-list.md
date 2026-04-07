# Task: Implement `aeos ticket list` CLI Command

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** typescript-pro
**Method:** Manual (bootstrapping)

## Context
Provides the operator with a summary view of all tickets and their current state. Reads from `state.db` (SQLite). Depends on M1-006 (SQLite schema) and M1-003 (ticket create so there is data to list).

## What needs to be done
Implement `src/commands/ticket-list.ts`:
1. Resolve project root via `projectRoot()` helper
2. Query all rows from the `tickets` table ordered by `id` ascending
3. Print a formatted table to stdout:
   ```
   ID        TITLE                          COLUMN              SUB-STATE
   AEOS-1    Add rate limiting              BACKLOG             BLOCKED
   AEOS-2    Implement PM agent             PRODUCT_SCOPING     WORKING
   ```
4. If no tickets exist, print: `No tickets found. Run 'aeos ticket create <title>' to add one.`
5. Support optional `--column <column>` filter flag to show only tickets in that column

## Acceptance Criteria
- [ ] Given a project with 2 tickets, when running `aeos ticket list`, then both tickets are displayed with correct column and sub-state
- [ ] Given no tickets, when running `aeos ticket list`, then the "no tickets" message is shown
- [ ] Given `--column BACKLOG`, when running `aeos ticket list --column BACKLOG`, then only BACKLOG tickets appear
- [ ] Given the output, when reading it, then columns are aligned and readable (tabular format)

## Out of Scope
- Interactive TUI or terminal dashboard (M7-003)
- Sorting by anything other than ID

## Technical Notes / Hints
- Use a simple column-padding approach with `String.padEnd()` for alignment
- Column name filter should be case-insensitive

## Dependencies
- M1-006: SQLite schema
- M1-012: `projectRoot()` helper

## Definition of Done
- [ ] `aeos ticket list` displays correct data from DB
- [ ] Filter flag works correctly
- [ ] Unit tests: empty state, multiple tickets, column filter
- [ ] Code reviewed and approved
