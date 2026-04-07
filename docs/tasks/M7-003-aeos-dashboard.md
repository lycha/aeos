# Task: Implement `aeos dashboard` Cross-Project Kanban Summary

**Milestone:** M7 — Polish & Distribution
**Agent:** javascript-pro
**Method:** Manual

## Context
A terminal-rendered Kanban view of all registered projects and their tickets. The operator can see the state of every AEOS project at a glance without changing directories. Reads from `~/.aeos/registry.json` and each project's `state.db`.

## What needs to be done
Implement `src/commands/dashboard.ts`:

1. Read `~/.aeos/registry.json` to get all registered projects
2. For each project, open its `state.db` (read-only) and query all tickets
3. Group tickets by column
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
5. Only show columns with tickets (skip empty columns in the display)
6. If a project's DB is not accessible (project moved/deleted), skip it with a warning

## Acceptance Criteria
- [ ] Given 2 registered projects each with 3 tickets, when running `aeos dashboard`, then both projects appear with their tickets grouped by column
- [ ] Given a project with no tickets, when running `aeos dashboard`, then the project shows with an empty state message
- [ ] Given a project whose `state.db` is inaccessible, when running `aeos dashboard`, then that project is skipped with `Warning: cannot read project at <path>`
- [ ] Given output, when reading, then column counts in headers are accurate (e.g., `BACKLOG (2)`)
- [ ] Given no registered projects, when running `aeos dashboard`, then: `No projects found. Run 'aeos project init' in a project directory.`

## Out of Scope
- Live auto-refresh / watch mode (v2)
- Interactive selection / navigation (v2)

## Technical Notes / Hints
- Use box-drawing Unicode characters for borders (`┌`, `─`, `┬`, `┐`, `│`, `└`, `┘`)
- `process.stdout.columns` gives the terminal width — use it to set max column width

## Dependencies
- M1-006: SQLite schema (for reading project DBs)
- M1-011: `aeosHome()` and `aeosRegistryPath()`

## Definition of Done
- [ ] `aeos dashboard` renders multi-project Kanban in terminal
- [ ] Inaccessible projects skipped gracefully
- [ ] Unit tests: multiple projects, empty project, inaccessible DB
- [ ] Code reviewed and approved
