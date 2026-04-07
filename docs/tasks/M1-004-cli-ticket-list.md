# Task: Implement `aeos ticket list` CLI Command

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** typescript-pro
**Method:** Manual (bootstrapping)

## Context
Provides the operator with a summary view of all tickets in the current project. Reads from the global `~/.aeos/state.db` (SQLite), filtered by `project_id`. Depends on M1-006 (SQLite schema) and M1-003 (ticket create so there is data to list).

## What needs to be done
Implement the CLI command in `src/cli/commands/ticket-list.command.ts` and the use case in `src/application/ticket-list.use-case.ts`:

**CLI command** (`ticket-list.command.ts`):
1. Parse optional `--column <column>` flag; validate via `isValidColumn()` from M1-007 (uppercase input)
2. Resolve project root via `ProjectRepository.findRoot()` and read project key
3. Call the use case with `{ projectId, columnFilter? }`
4. Format and print the ticket table. If `sub_state` is `NULL` (e.g. BACKLOG tickets), display `—` (em-dash):

**Use case** (`ticket-list.use-case.ts`):
1. Query `TicketRepository.findByProject(projectId, columnFilter?)` — sorted numerically by ticket number (avoid lexicographic `AEOS-10` before `AEOS-2`)
2. Return the list of tickets to the CLI command

**CLI output** (printed by the command):
   ```
   ID        TITLE                          COLUMN              SUB-STATE
   AEOS-1    Add rate limiting              BACKLOG             —
   AEOS-2    Implement PM agent             PRODUCT_SCOPING     WORKING
   ```
4. If no tickets exist, print: `No tickets found. Run 'aeos ticket create <title>' to add one.`
5. Support optional `--column <column>` filter flag to show only tickets in that column. Before querying, validate the value against `isValidColumn()` from M1-007 (uppercase the input before comparison). If invalid, print: `Error: Unknown column '<value>'. Valid columns: BACKLOG, PRODUCT_SCOPING, ARCH_SPIKE, TECH_SPEC, IMPLEMENTATION, CODE_REVIEW, QA, DOD_GATE, DONE` and exit with code 1.

## Acceptance Criteria
- [ ] Given a project with 2 tickets, when running `aeos ticket list`, then both tickets are displayed with correct column and sub-state
- [ ] Given a BACKLOG ticket with `sub_state = NULL`, when running `aeos ticket list`, then the SUB-STATE column displays `—` (not `null` or blank)
- [ ] Given no tickets, when running `aeos ticket list`, then the "no tickets" message is shown
- [ ] Given `--column BACKLOG`, when running `aeos ticket list --column BACKLOG`, then only BACKLOG tickets appear
- [ ] Given `--column BACKLG` (typo), when running `aeos ticket list --column BACKLG`, then a validation error is printed listing valid column names, and exit code is 1
- [ ] Given the output, when reading it, then columns are aligned and readable (tabular format)
- [ ] Given tickets AEOS-1 through AEOS-11, when running `aeos ticket list`, then AEOS-10 and AEOS-11 appear after AEOS-9 (numeric order, not lexicographic)

## Out of Scope
- Interactive TUI or terminal dashboard (M7-003)
- Sorting by anything other than ID

## Layer Mapping
```
CLI command:  src/cli/commands/ticket-list.command.ts    — parse flags, validate column, call use case, format table
Use case:     src/application/ticket-list.use-case.ts    — query TicketRepository, return ticket list
Domain:       src/domain/model/column.ts                 — isValidColumn() for --column validation
Adapters:     SqliteTicketRepository (src/infrastructure/persistence/sqlite-ticket.repository.ts)
              FsProjectRepository (src/infrastructure/filesystem/fs-project.repository.ts)
```

## Technical Notes / Hints
- Use a simple column-padding approach with `String.padEnd()` for alignment
- When `sub_state` is `null` from the DB query result, substitute `'—'` before formatting
- Column name filter should be case-insensitive — uppercase the input before comparing
- Catch `ProjectRootNotFoundError` in the CLI command and print: `Error: Not inside an AEOS project. Run 'aeos project init' first.` Exit with code 1.

## Dependencies
- M1-006: SQLite schema
- M1-007: Column and SubState enums (for `--column` validation via `isValidColumn()`)

## Definition of Done
- [ ] `aeos ticket list` displays correct data from DB
- [ ] NULL sub_state renders as `—`
- [ ] Filter flag works correctly with validation
- [ ] Unit tests: empty state, multiple tickets, column filter, invalid column rejection, null sub_state display, numeric sort order
- [ ] Code reviewed and approved
