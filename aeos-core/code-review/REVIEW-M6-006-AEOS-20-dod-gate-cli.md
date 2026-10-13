# Review — M6-006: AEOS-20 DoD Gate Human Approval CLI Flow

**Date:** 2026-04-08 (post-fix re-review)
**Task:** `docs/tasks/M6-006-AEOS-20-dod-gate-cli.md`

---

## Acceptance Criteria

### AC-1: `aeos ticket dod-approve AEOS-1` on a QA-passed ticket displays DoD checklist and Y/N prompt
**PASS** — The CLI command (`ticket-dod-approve.command.ts`) loads the DoD rubric via `rubricLoader.load('rubrics/dod/dod-evaluation.md', projectPath)`, displays it between visual delimiters, lists artifact files via `artifactStore.listArtifacts()` as relative paths (`.aeos/tickets/<ticketId>/<filename>`), and prompts with `All DoD criteria above must be met. Approve ticket AEOS-1 as DONE? [y/N]` using a `readline`-based `promptYesNo` helper. Matches spec step 1 exactly.

### AC-2: Operator enters Y → ticket column is DONE and completion summary is printed
**PASS** — On approval (`approved=true`), the use case: (a) transitions to `Column.DONE` via `stateMachine.transition`, (b) sets sub-state to `null` via `ticketRepo.updateSubState` (correctly bypasses `StateMachineService.setSubState` which requires a valid `SubState` enum value), (c) commits `[AEOS-1][HUMAN][v1][dod-approve: DOD_GATE → DONE]` to git, (d) sums cost records via `costRepo.findByTicket`. The CLI prints `✓ Ticket AEOS-1 approved: DOD_GATE → DONE (total cost: $0.1500)`. Git commit failure triggers compensation (revert column to DOD_GATE + restore previous sub-state), matching the `TicketApproveUseCase` rollback pattern.

### AC-3: Operator enters N → ticket remains in DOD_GATE, exit code 0, message `DoD approval cancelled.`
**PASS** — When `approved=false`, the use case returns `{ status: 'cancelled', ticketId }` without calling `transition` or `commit`. The CLI prints `DoD approval cancelled.` and does not set `process.exitCode` (defaults to 0). Unit tests `should return cancelled when not approved` and `should not transition or commit when not approved` validate this.

### AC-4: Ticket not in DOD_GATE → error and exit 1
**PASS** — The use case guard checks `ticket.column !== Column.DOD_GATE` and returns `{ status: 'error', ... }`. The CLI sets `process.exitCode = 1` on error status. Unit tests cover QA, BACKLOG, and DONE columns. Ticket-not-found is also handled with an error return.

### AC-5: Unit tests cover all paths (approve, cancel, wrong column)
**PASS** — `ticket-dod-approve.use-case.test.ts` has 13 tests (all passing, verified via `vitest run`):
1. Approve with cost aggregation (0.05 + 0.10 = 0.15)
2. Transition to DONE column
3. Sub-state cleared to null
4. Git commit message format
5. Cancel returns `cancelled`
6. No transition/commit on cancel
7. Ticket not found → error
8. Wrong column: QA → error
9. Wrong column: BACKLOG → error
10. Wrong column: DONE → error
11. Transition failure → error
12. Git commit failure → compensation (revert column + restore sub-state)
13. Zero-cost edge case

---

## Definition of Done

### DoD-1: `aeos ticket dod-approve` implemented and unit tested
**PASS** — All four files implemented:
- Port: `src/domain/ports/driving/ticket-dod-approve.port.ts`
- Use case: `src/application/ticket-dod-approve.use-case.ts`
- CLI command: `src/cli/commands/ticket-dod-approve.command.ts`
- Container wiring: `src/cli/container.ts` (lazy getter + `Container` interface)
- Registration: `src/cli/index.ts` (import + `registerTicketDodApproveCommand` call)
- Barrel export: `src/cli/commands/index.ts` (line 10)
- Tests: 13/13 passing

### DoD-2: End-to-end: a ticket can move from DOD_GATE → DONE via this command
**PASS** — Full flow wired: CLI (`readline` prompt) → use case (`approved` boolean) → `stateMachine.transition(DONE)` → `ticketRepo.updateSubState(null)` → `gitGateway.commit` → `costRepo.findByTicket` → summary output. Container creates the use case with `getTicketRepo()`, `getStateMachine()`, `gitGateway`, `getCostRepo()`. CLI command receives `rubricLoader` and `artifactStore` for checklist display.

---

## Deviation Analysis

### D1: Port signature includes `approved: boolean` parameter (Minor — Acceptable)
**Spec:** `execute(projectId, projectPath, ticketId): TicketDodApproveResult`
**Impl:** `execute(projectId, projectPath, ticketId, approved): TicketDodApproveResult`

The task's Technical Notes explicitly state: *"The CLI command layer handles I/O; the use case receives a boolean `approved` parameter. Keep I/O out of the use case to maintain testability."* The implementation correctly follows this guidance. The port signature in the spec contradicts its own technical notes — the implementation chose the right design.

### D2: Use case constructor omits `rubricLoader` and `artifactStore` (Minor — Acceptable)
**Spec constructor:** includes `rubricLoader: RubricLoader` and `artifactStore: ArtifactStore`
**Impl constructor:** omits them; CLI command receives them directly

Rubric loading and artifact listing are presentation/I/O concerns properly handled by the CLI layer. The container exposes `rubricLoader` and `artifactStore` as top-level properties, and `registerTicketDodApproveCommand` receives them as additional parameters. This is cleaner separation of concerns.

### D3: Container wiring and CLI registration differ from spec (Minor — Acceptable)
**Spec wiring:** `new TicketDodApproveUseCase(..., new FsRubricLoader(), artifactStore)`
**Spec registration:** `registerTicketDodApproveCommand(program, () => container.ticketDodApprove, container.projectRepo)`
**Impl wiring:** `new TicketDodApproveUseCase(getTicketRepo(), getStateMachine(), gitGateway, getCostRepo())`
**Impl registration:** adds `container.rubricLoader` and `container.artifactStore` parameters

Consistent with D2 — I/O dependencies are passed to the CLI command registration rather than the use case.

---

## Summary

| Criterion | Result |
|-----------|--------|
| AC-1 DoD checklist + prompt | **PASS** |
| AC-2 Y → DONE + summary | **PASS** |
| AC-3 N → cancelled, exit 0 | **PASS** |
| AC-4 Not DOD_GATE → error, exit 1 | **PASS** |
| AC-5 Unit tests all paths | **PASS** |
| DoD-1 Implemented + tested | **PASS** |
| DoD-2 E2E DOD_GATE → DONE | **PASS** |

**Overall: PASS** — All acceptance criteria and definition of done items are met. All 13 unit tests pass. The deviations from the spec are intentional design improvements that follow the task's own technical notes about keeping I/O out of the use case. Compensation rollback on git commit failure correctly follows the `TicketApproveUseCase` pattern.

No fixes required.
