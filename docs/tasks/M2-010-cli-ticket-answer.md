# Task: Implement `aeos ticket answer <id>` CLI Command

**Milestone:** M2 — Dogfood Harness
**Agent:** typescript-pro
**Method:** Manual (last manual milestone)

## Context
Allows the operator to unblock a BLOCKED ticket after filling in answers in the questions artifact. The command validates the questions file has been modified and transitions the ticket back to WORKING so the run can resume. Requires M2-009 (pre-flight) and M1-009 (setSubState).

## What needs to be done
Implement the CLI command in `src/cli/commands/ticket-answer.command.ts` and the use case in `src/application/ticket-answer.use-case.ts`:

**CLI command** (`ticket-answer.command.ts`):
1. Parse `<id>` argument
2. Resolve project context via `ProjectRepository`
3. Call the use case; print result or error

**Use case** (`ticket-answer.use-case.ts`):
1. Load ticket via `TicketRepository.findById(projectId, ticketId)`
2. Verify ticket sub-state is `BLOCKED`; if not, return error
3. Check questions file exists via `ArtifactStore.artifactExists(ticketId, 'questions.md')`
4. Read the questions file and verify it has been modified (file mtime > ticket `updated_at`)
5. Call `stateMachine.setSubState(projectId, ticketId, 'WORKING')`
6. Return success result to CLI command

If ticket is not BLOCKED: `Error: Ticket <id> is not blocked (current state: <subState>). Only blocked tickets can be answered.`

## Acceptance Criteria
- [ ] Given a BLOCKED ticket with an edited questions file, when running `aeos ticket answer AEOS-1`, then sub-state changes to WORKING and success message is printed
- [ ] Given a ticket that is not BLOCKED, when running `aeos ticket answer AEOS-1`, then an error is printed and process exits with code 1
- [ ] Given a questions file that has not been edited since blocking, when running `aeos ticket answer`, then a warning is printed: `Warning: questions file does not appear to have been modified. Continue anyway? [y/N]` — prompt operator for confirmation
- [ ] Given a non-existent ticket, when running `aeos ticket answer AEOS-99`, then error is printed and process exits with code 1

## Out of Scope
- Auto-resuming the run after answering (operator must explicitly call `aeos ticket run` again)
- Editing the questions file from the CLI (operator uses their editor)

## Technical Notes / Hints
- Use `fs.statSync(path).mtime` for file modification time
- For the confirmation prompt, use `readline` from `node:readline`

## Layer Mapping
```
CLI command:     src/cli/commands/ticket-answer.command.ts       — parse args, call use case, format output
Use case:        src/application/ticket-answer.use-case.ts       — orchestrate via ports
Domain service:  src/domain/services/state-machine.ts            — StateMachineService.setSubState()
Adapters:        SqliteTicketRepository, FsArtifactStore, FsProjectRepository
```

## Dependencies
- M1-008/M1-009: `StateMachineService` (setSubState via ports)
- M2-009: Pre-flight (creates questions file)

## Definition of Done
- [ ] `aeos ticket answer` unblocks correctly on modified questions file
- [ ] Non-BLOCKED ticket exits with code 1
- [ ] Unmodified file triggers confirmation prompt
- [ ] Unit tests: blocked + modified file, not blocked, missing questions file
- [ ] Code reviewed and approved
