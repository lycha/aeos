# Task: Implement `aeos ticket show <id>` CLI Command

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** typescript-pro
**Method:** Manual (bootstrapping)

## Context
Gives the operator a detailed view of a single ticket: current column, sub-state, and list of artifacts in `.aeos/tickets/<ID>/`. Depends on M1-003 (ticket create) and M1-006 (SQLite schema).

> **Note:** The system design doc (Section 8.1) uses `ticket status` for this command. The action plan and all M1 tasks use `ticket show`. We standardise on `show` — update the system design command surface to match.

## What needs to be done
Implement the CLI command in `src/cli/commands/ticket-show.command.ts` and the use case in `src/application/ticket-show.use-case.ts`:

**CLI command** (`ticket-show.command.ts`):
1. Parse `<id>` argument
2. Resolve project root via `ProjectRepository.findRoot()` and read project key
3. Call the use case with `{ projectId, ticketId }` (case-insensitive on `ticketId`)
4. Format and print structured output. If `sub_state` is `null`, display `—`

**Use case** (`ticket-show.use-case.ts`):
1. Look up ticket via `TicketRepository.findById(projectId, ticketId)` (case-insensitive on `ticketId`)
2. List artifacts via `ArtifactStore.listArtifacts(ticketId)` — reads from `.aeos/tickets/<ID>/`
3. Return `{ ticket, artifacts }` to the CLI command

**CLI output** (printed by the command). If `sub_state` is `null` (e.g. BACKLOG tickets), display `—` (em-dash):
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
- [ ] Given `AEOS-1` has two artifact files in `.aeos/tickets/AEOS-1/`, when running `aeos ticket show AEOS-1`, then both files appear under "Artifacts"
- [ ] Given a BACKLOG ticket with `sub_state = NULL`, when running `aeos ticket show AEOS-1`, then the State line displays `—`
- [ ] Given a non-existent ticket ID, when running `aeos ticket show AEOS-99`, then an error message is printed and process exits with code 1
- [ ] Given ticket ID is passed in lowercase, when running `aeos ticket show aeos-1`, then the ticket is found (case-insensitive)

## Out of Scope
- Printing the contents of artifact files (operator opens them directly)
- Transition history / audit log (future feature)

## Layer Mapping
```
CLI command:  src/cli/commands/ticket-show.command.ts    — parse id, call use case, format output
Use case:     src/application/ticket-show.use-case.ts    — query TicketRepository + ArtifactStore, return ticket + artifacts
Domain:       src/domain/model/ticket.ts                 — Ticket aggregate
Adapters:     SqliteTicketRepository (src/infrastructure/persistence/sqlite-ticket.repository.ts)
              FsArtifactStore (src/infrastructure/filesystem/fs-artifact-store.adapter.ts)
              FsProjectRepository (src/infrastructure/filesystem/fs-project.repository.ts)
```

## Technical Notes / Hints
- The use case calls ports — no raw `fs` or `db` imports
- When `sub_state` is `null` from the query result, the CLI command substitutes `'—'` before formatting (consistent with M1-004)
- Catch `ProjectRootNotFoundError` in the CLI command and print: `Error: Not inside an AEOS project. Run 'aeos project init' first.` Exit with code 1

## Dependencies
- M1-003: `aeos ticket create` (to have data)
- M1-006: SQLite schema

## Definition of Done
- [ ] `aeos ticket show <id>` prints correct structured output
- [ ] Null sub_state renders as `—`
- [ ] Missing ticket exits with code 1
- [ ] Unit tests: found ticket, missing ticket, artifact listing, null sub_state display
- [ ] Code reviewed and approved
