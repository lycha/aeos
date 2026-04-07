# Task: Implement `aeos ticket create <title>` CLI Command

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** typescript-pro
**Method:** Manual (bootstrapping)

## Context
Creates a new ticket markdown file in `.aeos/tickets/<ID>/` and registers it in the state database as `BACKLOG`. The ticket ID is auto-assigned using the project key and an incrementing counter (e.g., `AEOS-1`). Depends on M1-002 (project init) and M1-006 (SQLite schema).

## What needs to be done
Implement `src/commands/ticket-create.ts`:
1. Resolve project root by walking up from CWD to find `.aeos/` (use `projectRoot()` helper from M1-012)
2. Read `project.json` to get the project `key`
3. Determine next ticket number by querying the tickets table (MAX id + 1)
4. Assign ticket ID: `<KEY>-<N>` (e.g., `AEOS-1`)
5. Create `.aeos/tickets/<KEY>-<N>/` directory if it does not exist
6. Write the ticket file using `artifactPath(ticketId, 'ticket.md')` from M1-013, with the following template:
   ```markdown
   # Ticket: <KEY>-<N>

   ## Title
   <title>

   ## Description
   <!-- Fill in the ticket description here -->

   ## Definition of Done
   <!-- Define acceptance criteria — evaluated at DoD Gate -->

   ## Notes
   <!-- Additional context, links, constraints -->
   ```
7. Insert a row into the `tickets` table: `{ id, title, column: 'BACKLOG', subState: null, createdAt }`
   - `sub_state` is `null` for BACKLOG tickets — no agent has run, so no sub-state applies. Requires `sub_state` to be nullable in the DB schema (coordinate with M1-006).
8. Commit the new file to `.aeos/.git` using `gitCommit()` helper (M1-014) with message: `[<KEY>-<N>][TICKET][v1][human][create]`
9. Print: `✓ Created ticket <KEY>-<N>: "<title>"`

## Acceptance Criteria
- [ ] Given an initialised project, when running `aeos ticket create "Add rate limiting"`, then `AEOS-1-ticket.md` exists in `.aeos/tickets/AEOS-1/`
- [ ] Given the ticket file, when inspecting it, then it contains `## Title`, `## Description`, `## Definition of Done`, and `## Notes` sections
- [ ] Given the tickets table, when queried, then one row exists with `column = 'BACKLOG'` and `sub_state IS NULL`
- [ ] Given the `.aeos/.git` log, when inspected, then a commit exists with message matching `[AEOS-1][TICKET][v1][human][create]`
- [ ] Given running the command twice, when inspecting, then two distinct ticket directories and files exist (`AEOS-1` and `AEOS-2`)

## Out of Scope
- Editing ticket description (done manually by operator in the file)
- Template injection from column specs (M2)

## Technical Notes / Hints
- The ticket markdown file is immutable after creation — column state lives in the DB, not in the file
- Use `artifactPath()` from M1-013 for all path construction — do not hardcode paths inline
- The `tickets/` subdirectory under `.aeos/` keeps artifacts separated from AEOS config files (`project.json`, `state.db`, `column-specs/`)

## Dependencies
- M1-002: `aeos project init` complete
- M1-006: SQLite schema created (`sub_state` column must be nullable — coordinate)
- M1-012: `projectRoot()` helper
- M1-013: `artifactPath()` helper (canonical path for ticket artifacts)
- M1-014: `gitCommit()` helper

## Definition of Done
- [ ] `aeos ticket create` writes correct file in `.aeos/tickets/<ID>/` and DB row
- [ ] Ticket file contains all four required sections from system design
- [ ] Commit produced in `.aeos/.git` with structured message
- [ ] Unit tests: ticket file content, DB row with null sub_state, auto-incrementing ID
- [ ] Code reviewed and approved
