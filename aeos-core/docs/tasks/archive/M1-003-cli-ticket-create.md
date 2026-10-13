# Task: Implement `aeos ticket create <title>` CLI Command

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** typescript-pro
**Method:** Manual (bootstrapping)

## Context
Creates a new ticket markdown file in `.aeos/tickets/<ID>/` and registers it in the state database as `BACKLOG`. The ticket ID is auto-assigned using the project key and an incrementing counter (e.g., `AEOS-1`). Depends on M1-002 (project init) and M1-006 (SQLite schema).

## What needs to be done
Implement the CLI command in `src/cli/commands/ticket-create.command.ts` and the use case in `src/application/ticket-create.use-case.ts`:

**CLI command** (`ticket-create.command.ts`):
1. Parse `<title>` argument
2. Resolve project root via `ProjectRepository.findRoot()` and read project key
3. Call the use case with `{ title, projectId }`
4. Print: `✓ Created ticket <KEY>-<N>: "<title>"`

**Use case** (`ticket-create.use-case.ts`):
1. Query `TicketRepository.nextId(projectId)` to determine next ticket number
2. Assign ticket ID: `<KEY>-<N>` (e.g., `AEOS-1`)
3. Create ticket directory and write the ticket file via `ArtifactStore.writeArtifact(ticketId, 'ticket.md', content)` with the following template:
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
4. Save ticket to DB via `TicketRepository.save({ id, projectId, title, column: 'BACKLOG', subState: null, createdAt, updatedAt })`
   - `sub_state` is `null` for BACKLOG tickets — no agent has run, so no sub-state applies
5. Commit the new file via `GitGateway.commit()` with message: `[<KEY>-<N>][TICKET][v1][human][create]`
6. Return the created ticket ID to the CLI command

## Acceptance Criteria
- [ ] Given an initialised project, when running `aeos ticket create "Add rate limiting"`, then `AEOS-1-ticket.md` exists in `.aeos/tickets/AEOS-1/`
- [ ] Given the ticket file, when inspecting it, then it contains `## Title`, `## Description`, `## Definition of Done`, and `## Notes` sections
- [ ] Given the tickets table, when queried, then one row exists with `column = 'BACKLOG'` and `sub_state IS NULL`
- [ ] Given the `.aeos/.git` log, when inspected, then a commit exists with message matching `[AEOS-1][TICKET][v1][human][create]`
- [ ] Given running the command twice, when inspecting, then two distinct ticket directories and files exist (`AEOS-1` and `AEOS-2`)

## Out of Scope
- Editing ticket description (done manually by operator in the file)
- Template injection from column specs (M2)

## Layer Mapping
```
CLI command:  src/cli/commands/ticket-create.command.ts   — parse title, resolve project, call use case, print result
Use case:     src/application/ticket-create.use-case.ts   — orchestrate via TicketRepository, ArtifactStore, GitGateway ports
Domain:       src/domain/model/ticket.ts                  — Ticket aggregate
Adapters:     SqliteTicketRepository (src/infrastructure/persistence/sqlite-ticket.repository.ts)
              FsArtifactStore (src/infrastructure/filesystem/fs-artifact-store.adapter.ts)
              SimpleGitGateway (src/infrastructure/git/simple-git-gateway.adapter.ts)
              FsProjectRepository (src/infrastructure/filesystem/fs-project.repository.ts)
```

## Technical Notes / Hints
- The ticket markdown file is immutable after creation — column state lives in the DB, not in the file
- The use case calls ports (TicketRepository, ArtifactStore, GitGateway) — no raw `fs` or `db` imports in the use case
- The `tickets/` subdirectory under `.aeos/` keeps artifacts separated from AEOS config files (`project.json`, `column-specs/`)

## Dependencies
- M1-002: `aeos project init` complete
- M1-006: SQLite schema created (`sub_state` column must be nullable — coordinate)

## Definition of Done
- [ ] `aeos ticket create` writes correct file in `.aeos/tickets/<ID>/` and DB row
- [ ] Ticket file contains all four required sections from system design
- [ ] Commit produced in `.aeos/.git` with structured message
- [ ] Unit tests: ticket file content, DB row with null sub_state, auto-incrementing ID
- [ ] Code reviewed and approved
