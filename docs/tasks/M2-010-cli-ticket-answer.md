# Task: Implement `aeos ticket answer <id>` CLI Command

**Milestone:** M2 — Dogfood Harness
**Agent:** typescript-pro
**Method:** Manual (last manual milestone)

## Context
Allows the operator to unblock a BLOCKED ticket after filling in answers in the questions artifact. The command validates the questions file has been modified and transitions the ticket back to WORKING so the run can resume. Requires M2-009 (pre-flight) and M1-009 (setSubState).

## Prerequisites — Extend `ArtifactStore` port

Before implementing this task, add the following methods to `src/domain/ports/driven/artifact-store.port.ts` and implement them in `FsArtifactStore`:

```typescript
artifactExists(projectPath: string, ticketId: string, filename: string): boolean;
readArtifact(projectPath: string, ticketId: string, filename: string): string;
getArtifactMtime(projectPath: string, ticketId: string, filename: string): Date | null;
```

This is a cross-cutting amendment that also affects M2-009 and M2-011.

## What needs to be done
Implement the CLI command in `src/cli/commands/ticket-answer.command.ts` and the use case in `src/application/ticket-answer.use-case.ts`:

**CLI command** (`ticket-answer.command.ts`):
1. Parse `<id>` argument
2. Resolve project context via `ProjectRepository` (yields `projectId` and `projectPath`)
3. Call the use case; if the result is `{ needsConfirmation: true }`, prompt the operator with `Warning: questions file does not appear to have been modified. Continue anyway? [y/N]` using `readline` from `node:readline`, and re-call the use case with `confirmed: true`
4. Print result or error

**Use case** (`ticket-answer.use-case.ts`):

Constructor dependencies (injected):
```typescript
export class TicketAnswerUseCase {
  constructor(
    private ticketRepo: TicketRepository,
    private artifactStore: ArtifactStore,
    private stateMachine: StateMachineService,
    private gitGateway: GitGateway,        // for committing answered file
  ) {}

  async execute(
    projectId: string,
    projectPath: string,                   // from CLI's project resolution
    ticketId: string,
    confirmed?: boolean,                   // set to true if user confirmed unmodified-file prompt
  ): Promise<TicketAnswerResult>
}
```

Flow:
1. Load ticket via `ticketRepo.findById(projectId, ticketId)`
2. Verify ticket sub-state is `BLOCKED`; if not, return error
3. Check questions file exists via `artifactStore.artifactExists(projectPath, ticketId, `${ticketId}-questions.md`)`
4. Get the file modification time via `artifactStore.getArtifactMtime(projectPath, ticketId, `${ticketId}-questions.md`)` and verify it has been modified (convert both mtime and ticket `updated_at` to epoch milliseconds for comparison); if not modified and `confirmed` is not `true`, return `{ needsConfirmation: true, reason: 'questions file not modified' }`
5. Call `stateMachine.setSubState(projectId, ticketId, 'WORKING')`
6. Commit the answered questions file via `gitGateway.commit(`[${ticketId}][QUESTIONS][v1][human][answered]`, [questionsFilePath])`
7. Return success result to CLI command

If ticket is not BLOCKED: `Error: Ticket <id> is not blocked (current state: <subState>). Only blocked tickets can be answered.`

Add the use case to the barrel re-export at `src/application/index.ts`.

## Acceptance Criteria
- [ ] Given a BLOCKED ticket with an edited questions file, when running `aeos ticket answer AEOS-1`, then sub-state changes to WORKING, the answered file is committed, and success message is printed
- [ ] Given a ticket that is not BLOCKED, when running `aeos ticket answer AEOS-1`, then an error is printed and process exits with code 1
- [ ] Given a questions file that has not been edited since blocking, when running `aeos ticket answer AEOS-1`, then a warning is printed: `Warning: questions file does not appear to have been modified. Continue anyway? [y/N]` — prompt operator for confirmation
- [ ] Given a non-existent ticket, when running `aeos ticket answer AEOS-99`, then error is printed and process exits with code 1

## Out of Scope
- Auto-resuming the run after answering (operator must explicitly call `aeos ticket run` again). Note: system design §7.2 implies `ticket answer` triggers the main run, but this is deferred — auto-resume is out of scope for M2.
- Editing the questions file from the CLI (operator uses their editor)

## Technical Notes / Hints
- File modification time must be obtained through the `ArtifactStore.getArtifactMtime()` port method — do **not** call `fs.statSync()` directly from the use case (hexagonal architecture violation)
- Convert both `Date` (mtime) and ISO-8601 string (`ticket.updatedAt`) to epoch milliseconds before comparison to avoid timezone/precision issues
- The confirmation prompt (`readline`) belongs in the CLI command layer, not the use case. The use case returns `{ needsConfirmation: true }` and the CLI handles the interactive prompt
- The questions artifact filename must match M2-009's output convention: `${ticketId}-questions.md` (e.g., `AEOS-1-questions.md`), not bare `questions.md`

## Layer Mapping
```
CLI command:     src/cli/commands/ticket-answer.command.ts       — parse args, call use case, handle confirmation prompt, format output
Use case:        src/application/ticket-answer.use-case.ts       — orchestrate via ports
Driving port:    src/domain/ports/driving/ticket-answer.port.ts  — define TicketAnswerPort interface
Domain service:  src/domain/services/state-machine.ts            — StateMachineService.setSubState()
Adapters:        SqliteTicketRepository, FsArtifactStore, FsProjectRepository
```

## Dependencies
- M1-008/M1-009: `StateMachineService` (setSubState via ports)
- M2-009: Pre-flight (creates questions file as `${ticketId}-questions.md`)
- `ArtifactStore` port extension: `artifactExists()`, `readArtifact()`, `getArtifactMtime()` (cross-cutting — also affects M2-009 and M2-011)
- `ProjectRepository`: needed by CLI command to resolve `projectPath` for all `ArtifactStore` calls
- `GitGateway`: needed by use case to commit the answered questions file per system design §7.2

## Definition of Done
- [ ] `aeos ticket answer` unblocks correctly on modified questions file
- [ ] Answered questions file is committed with `[ticketId][QUESTIONS][v1][human][answered]` attribution
- [ ] Non-BLOCKED ticket exits with code 1
- [ ] Unmodified file triggers confirmation prompt (handled in CLI layer)
- [ ] Unit tests: blocked + modified file, not blocked, missing questions file, empty questions file (exists but zero content)
- [ ] Use case re-exported from `src/application/index.ts`
- [ ] Driving port interface defined in `src/domain/ports/driving/ticket-answer.port.ts`
- [ ] Code reviewed and approved
