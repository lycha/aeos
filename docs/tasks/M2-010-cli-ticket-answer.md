# Task: Implement `aeos ticket answer <id>` CLI Command

**Milestone:** M2 — Dogfood Harness
**Agent:** typescript-pro
**Method:** Manual (last manual milestone)

## Context
Allows the operator to unblock a BLOCKED ticket after filling in answers in the questions artifact. The command validates the questions file has been modified and transitions the ticket back to WORKING so the run can resume. Requires M2-009 (pre-flight) and M1-009 (setSubState).

## What needs to be done
Implement `src/commands/ticket-answer.ts`:
1. Resolve project root and load ticket from DB
2. Verify ticket sub-state is `BLOCKED`; if not, print error and exit 1
3. Check that `<id>-questions.md` exists in `.aeos/`
4. Read `<id>-questions.md` and verify it has been modified (file mtime > ticket `updated_at` timestamp)
5. Call `setSubState(db, ticketId, 'WORKING')`
6. Print: `✓ Ticket <id> unblocked. Run 'aeos ticket run <id>' to resume.`

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

## Dependencies
- M1-009: `setSubState()`
- M2-009: Pre-flight (creates questions file)
- M1-012: `projectRoot()` helper

## Definition of Done
- [ ] `aeos ticket answer` unblocks correctly on modified questions file
- [ ] Non-BLOCKED ticket exits with code 1
- [ ] Unmodified file triggers confirmation prompt
- [ ] Unit tests: blocked + modified file, not blocked, missing questions file
- [ ] Code reviewed and approved
