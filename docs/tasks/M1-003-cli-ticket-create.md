# Task: Implement `aeos ticket create <title>` CLI Command

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** typescript-pro
**Method:** Manual (bootstrapping)

## Context
Creates a new ticket markdown file in `.aeos/` and registers it in the state database as `BACKLOG`. The ticket ID is auto-assigned using the project key and an incrementing counter (e.g., `AEOS-1`). Depends on M1-002 (project init) and M1-006 (SQLite schema).

## What needs to be done
Implement `src/commands/ticket-create.ts`:
1. Resolve project root by walking up from CWD to find `.aeos/` (use `projectRoot()` helper from M1-012)
2. Read `project.json` to get the project `key`
3. Determine next ticket number by querying the tickets table (MAX id + 1)
4. Assign ticket ID: `<KEY>-<N>` (e.g., `AEOS-1`)
5. Write `.aeos/<KEY>-<N>-ticket.md` with:
   ```markdown
   # <title>
   **ID:** <KEY>-<N>
   **Created:** <ISO date>
   **Column:** BACKLOG
   ## Description
   <!-- Fill in the ticket description here -->
   ```
6. Insert a row into the `tickets` table: `{ id, title, column: 'BACKLOG', subState: 'BLOCKED', createdAt }`
7. Commit the new file to `.aeos/.git` using `gitCommit()` helper (M1-014)
8. Print: `✓ Created ticket <KEY>-<N>: "<title>"`

## Acceptance Criteria
- [ ] Given an initialised project, when running `aeos ticket create "Add rate limiting"`, then `AEOS-1-ticket.md` exists in `.aeos/`
- [ ] Given the ticket file, when inspecting it, then it contains the title and `Column: BACKLOG`
- [ ] Given the tickets table, when queried, then one row exists with `column = 'BACKLOG'`
- [ ] Given the `.aeos/.git` log, when inspected, then a commit exists for the new ticket file
- [ ] Given running the command twice, when inspecting, then two distinct ticket files exist (`AEOS-1` and `AEOS-2`)

## Out of Scope
- Editing ticket description (done manually by operator in the file)
- Template injection from column specs (M2)

## Dependencies
- M1-002: `aeos project init` complete
- M1-006: SQLite schema created
- M1-012: `projectRoot()` helper
- M1-014: `gitCommit()` helper

## Definition of Done
- [ ] `aeos ticket create` writes correct file and DB row
- [ ] Commit produced in `.aeos/.git`
- [ ] Unit tests: ticket file content, DB row, auto-incrementing ID
- [ ] Code reviewed and approved
