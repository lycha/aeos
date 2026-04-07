# Task: Implement `aeos ticket show <id>` CLI Command

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** typescript-pro
**Method:** Manual (bootstrapping)

## Context
Gives the operator a detailed view of a single ticket: current column, sub-state, and list of artifacts committed to `.aeos/.git`. Depends on M1-003 (ticket create) and M1-006 (SQLite schema).

## What needs to be done
Implement `src/commands/ticket-show.ts`:
1. Resolve project root via `projectRoot()` helper
2. Look up the ticket row in `tickets` table by `id` (case-insensitive)
3. List all files in `.aeos/` matching `<id>-*.md` to show artifacts
4. Print structured output:
   ```
   Ticket: AEOS-1
   Title:  Add rate limiting
   Column: PRODUCT_SCOPING
   State:  WORKING
   
   Artifacts:
     • AEOS-1-ticket.md
     • AEOS-1-prd.md
   ```
5. If ticket ID is not found, print an error and exit with code 1

## Acceptance Criteria
- [ ] Given ticket `AEOS-1` exists, when running `aeos ticket show AEOS-1`, then title, column, sub-state, and artifacts are printed
- [ ] Given `AEOS-1` has two artifact files in `.aeos/`, when running `aeos ticket show AEOS-1`, then both files appear under "Artifacts"
- [ ] Given a non-existent ticket ID, when running `aeos ticket show AEOS-99`, then an error message is printed and process exits with code 1
- [ ] Given ticket ID is passed in lowercase, when running `aeos ticket show aeos-1`, then the ticket is found (case-insensitive)

## Out of Scope
- Printing the contents of artifact files (operator opens them directly)
- Transition history / audit log (future feature)

## Dependencies
- M1-003: `aeos ticket create` (to have data)
- M1-006: SQLite schema
- M1-012: `projectRoot()` helper

## Definition of Done
- [ ] `aeos ticket show <id>` prints correct structured output
- [ ] Missing ticket exits with code 1
- [ ] Unit tests: found ticket, missing ticket, artifact listing
- [ ] Code reviewed and approved
