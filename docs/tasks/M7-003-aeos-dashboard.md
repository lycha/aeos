# Task: Implement `aeos dashboard` Cross-Project Kanban Summary

**Milestone:** M7 — Polish & Distribution
**Agent:** javascript-pro
**Method:** Manual

## Context
A terminal-rendered Kanban view of all registered projects and their tickets. The operator can see the state of every AEOS project at a glance without changing directories. Reads from the global `~/.aeos/state.db` (all tickets across all projects are stored centrally) and `~/.aeos/registry.json` for project metadata (names, paths).

## What needs to be done
Implement the CLI command in `src/cli/commands/dashboard.command.ts` and the use case in `src/application/dashboard.use-case.ts`:

**CLI command** (`dashboard.command.ts`):
1. Call the use case (no arguments needed — dashboard is workspace-global)
2. Render the terminal table from the returned data

**Use case** (`dashboard.use-case.ts`):
1. Read registry via `ConfigStore.readRegistry()`
2. Query all tickets via `TicketRepository.findAll()` — sorted by `project_id`, then numerically by ticket number
3. Group tickets by project, then by column
4. Return structured data to CLI command for rendering
4. Render a terminal table:
   ```
   ═══════════════════════════════════════════════════════════════
   AEOS Dashboard                              2026-04-07 14:23
   ═══════════════════════════════════════════════════════════════

   PROJECT: aeos [AEOS]  /path/to/aeos
   ┌─────────────────┬──────────────────┬──────────────────┐
   │ BACKLOG (2)     │ PRODUCT_SCOPING  │ DONE (3)         │
   │ AEOS-5 BLOCKED  │ AEOS-4 WORKING   │ AEOS-1 ✓         │
   │ AEOS-6 BLOCKED  │                  │ AEOS-2 ✓         │
   └─────────────────┴──────────────────┴──────────────────┘
   ```
6. Only show columns with tickets (skip empty columns in the display)
7. If a project in `registry.json` has no tickets in the DB, show it with an empty state message

## Acceptance Criteria
- [ ] Given 2 registered projects each with 3 tickets, when running `aeos dashboard`, then both projects appear with their tickets grouped by column
- [ ] Given a project with no tickets, when running `aeos dashboard`, then the project shows with an empty state message
- [ ] Given output, when reading, then column counts in headers are accurate (e.g., `BACKLOG (2)`)
- [ ] Given no registered projects, when running `aeos dashboard`, then: `No projects found. Run 'aeos project init' in a project directory.`

## Out of Scope
- Live auto-refresh / watch mode (v2)
- Interactive selection / navigation (v2)

## Technical Notes / Hints
- Use box-drawing Unicode characters for borders (`┌`, `─`, `┬`, `┐`, `│`, `└`, `┘`)
- `process.stdout.columns` gives the terminal width — use it to set max column width

## Technical Notes / Hints
- Single DB query fetches all tickets across all projects — no need to open per-project DBs
- Use `registry.json` for project display metadata (name, path) and `project_id` for DB correlation
- If `sub_state` is `null` (BACKLOG tickets), display the appropriate symbol (e.g., `⚪`)

## Layer Mapping
```
CLI command:  src/cli/commands/dashboard.command.ts     — render terminal table
Use case:     src/application/dashboard.use-case.ts     — query TicketRepository + ConfigStore, group data
Domain ports: TicketRepository, ConfigStore
Adapters:     SqliteTicketRepository, FsConfigStore
```

## Dependencies
- M1-006: SQLite schema (global `~/.aeos/state.db` with `project_id` column)

## Definition of Done
- [ ] `aeos dashboard` renders multi-project Kanban in terminal
- [ ] Unit tests: multiple projects, empty project, null sub_state display
- [ ] Code reviewed and approved
