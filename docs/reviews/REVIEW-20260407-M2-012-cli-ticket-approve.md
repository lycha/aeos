# Deep Review: M2-012 — Implement `aeos ticket approve <id>` CLI Command

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Task specification — `docs/tasks/M2-012-cli-ticket-approve.md`
**Cross-referenced against:** System design (03-system-design.md §7.1, §8.1, §8.3), PRD (02-prd.md §5.8), Action plan (05-action-plan-v1.md §M2), sibling tasks M2-010, M2-011, M1-007, M1-008, M1-009, existing scaffold in `src/`, prior reviews (M2-010, M2-011)

---

## Overall Assessment

The task correctly identifies `ticket approve` as the operator-initiated forward advance from SIGNED_OFF to the next column. The concept aligns with the system design's manual advance model (§8.1, §8.3) and the action plan's M2 scope. File paths match the hexagonal scaffold — both `src/cli/commands/ticket-approve.command.ts` and `src/application/ticket-approve.use-case.ts` exist as placeholders. The dependency chain (M1-007, M1-008, M1-009) is correct.

However, the task has **two major issues**, **two medium issues**, and **several minor observations**. The major issues involve a missing git commit step required by the system design and a missing constructor/execute signature that breaks consistency with all sibling tasks.

**Verdict:** Approve with required changes.

---

## 1. Correctness vs System Design

### ⚠️ MAJOR (GAP-1): Missing git commit on approval — contradicts system design §8.3

System design §8.3 (Operator Actions table) states:

```
Approve + advance | `ticket approve` | `[HUMAN][v1][advance]`
```

Every operator action that moves state must produce a `[human]` git commit. The task's use case steps (1–7) contain **no git commit call**. The `GitGateway` port is not mentioned as a dependency, not listed in the constructor, and not referenced in the Layer Mapping.

**Impact:** The approval action is untraceable in the artifact store's git history. The system design's auditability guarantee (PRD NFR-02: "All agent activity must be auditable via git history") is violated.

**Recommendation:** Add a git commit step after the successful transition:
```
7a. gitGateway.commitFiles(aeosDir, [], `[${ticketId}][HUMAN][v1][advance: ${currentColumn} → ${nextColumn}]`)
```
Add `GitGateway` to the constructor dependencies and Layer Mapping.

### ⚠️ MAJOR (GAP-2): No constructor or `execute()` method signature — breaks sibling consistency

Sibling tasks M2-010 and M2-011 both define explicit constructor dependencies and `execute()` method signatures. M2-012 defines neither. The use case steps reference `TicketRepository`, `StateMachineService`, and `COLUMN_ORDER` but never show how they are injected.

The `execute()` method needs `projectId`, `projectPath`, and `ticketId` — `projectId` is required by `ticketRepo.findById()` and `stateMachine.transition()`, and `projectPath` is needed if git commits are added (see GAP-1).

**Impact:** Implementer must guess the dependency list and method signature. Inconsistent with the pattern established by every other M2 use case.

**Recommendation:** Add explicit constructor and execute signature:
```typescript
export class TicketApproveUseCase {
  constructor(
    private ticketRepo: TicketRepository,
    private stateMachine: StateMachineService,
    private gitGateway: GitGateway,
  ) {}

  execute(
    projectId: string,
    projectPath: string,
    ticketId: string,
  ): TicketApproveResult
}
```

### ⚠️ MEDIUM (M1): No result type defined

Sibling tasks define typed result types (`TicketRunResult`, `TicketAnswerResult`, `TransitionResult`). M2-012 says "Return success result with next column name" without defining the shape. The CLI command needs to distinguish success, "already done", and error cases.

**Impact:** Implementer must invent the result type. Minor but inconsistent.

**Recommendation:** Define:
```typescript
type TicketApproveResult =
  | { status: 'advanced'; ticketId: string; fromColumn: Column; toColumn: Column }
  | { status: 'already_done'; ticketId: string }
  | { status: 'error'; ticketId: string; error: string };
```

### ⚠️ MEDIUM (M2): BLOCKED sub-state semantics overloaded

The task step 6 says: `setSubState(projectId, ticketId, 'BLOCKED')` — "new column starts blocked until run."

System design §7.1 defines BLOCKED specifically as: "Pre-flight pass found open questions. Operator must answer before main run starts."

Using BLOCKED to mean "waiting to be run for the first time" is a semantic overload. The task's Technical Notes acknowledge this as intentional, but it creates ambiguity: a ticket in BLOCKED could mean either "has unanswered questions" or "has never been run in this column." The operator cannot distinguish the two states from `aeos ticket show`.

**Impact:** Operator confusion in the dashboard. Not blocking for M2 but should be documented as a known limitation.

**Recommendation:** Accept for v1 but add a note to the task acknowledging the semantic overload. Consider a future `READY` or `QUEUED` sub-state for "entered column, not yet run."

### ✅ Column advance logic — ALIGNED

The task uses `COLUMN_ORDER.indexOf(currentColumn) + 1` to find the next column. This is consistent with M1-007's `COLUMN_ORDER` definition and M1-008's forward-adjacent rule (`targetIndex === currentIndex + 1`). ✓

### ✅ SIGNED_OFF guard — ALIGNED

System design §7.1 shows SIGNED_OFF as the terminal sub-state before advance. The task correctly gates on `subState === 'SIGNED_OFF'`. ✓

### ✅ DONE terminal check — ALIGNED

The task step 4 handles DONE as a terminal state, returning "already done." This matches M1-008's rule: "From DONE: only backward movement is allowed." ✓

---

## 2. Dependencies

### ✅ M1-008: `StateMachineService.transition()` — CORRECT
The `transition()` method exists with the expected signature: `transition(projectId, ticketId, targetColumn, comment?)`. ✓

### ✅ M1-009: `StateMachineService.setSubState()` — CORRECT
The `setSubState()` method exists with the expected signature: `setSubState(projectId, ticketId, subState)`. ✓

### ✅ M1-007: `COLUMN_ORDER` — CORRECT
`COLUMN_ORDER` is exported from `src/domain/model/column.ts` as a readonly tuple of 9 columns. ✓

### ⚠️ Missing dependency: `GitGateway`
Per GAP-1, the system design requires a git commit on approval. `GitGateway` is not listed as a dependency.

### ⚠️ Missing dependency: `ProjectRepository` (CLI layer)
The CLI command step 2 says "Resolve project context via `ProjectRepository`" but `ProjectRepository` is not listed in Dependencies. This is a CLI-layer concern (container provides it), but should be mentioned for completeness.

---

## 3. File Path Alignment with Hexagonal Scaffold


| Task path | Exists on disk | Content |
|-----------|---------------|---------|
| `src/cli/commands/ticket-approve.command.ts` | ✓ | Placeholder: `// CLI command — aeos ticket approve` |
| `src/application/ticket-approve.use-case.ts` | ✓ | Placeholder: `// Use case — TicketApprove (advance column)` |
| `src/domain/services/state-machine.ts` | ✓ | Full implementation with `transition()` + `setSubState()` |
| `src/domain/model/column.ts` | ✓ | Full implementation with `Column`, `COLUMN_ORDER`, `isValidColumn()` |
| `src/domain/ports/driving/ticket-approve.port.ts` | ✓ | Placeholder: `// Driving port — TicketApprove use case interface (advance column)` |

### ✅ Layer placement is correct
CLI → Application use case → Domain service → Domain model. The hexagonal architecture is respected. ✓

### ⚠️ INFO: Driving port not defined
The `ticket-approve.port.ts` placeholder exists but the task does not define the driving port interface. Sibling reviews flagged the same gap for M2-010 and M2-011. Should specify:
```typescript
export interface TicketApprovePort {
  execute(projectId: string, projectPath: string, ticketId: string): TicketApproveResult;
}
```

### ⚠️ INFO: Barrel export already exists
`src/application/index.ts` already re-exports `ticket-approve.use-case.js`. The task does not mention barrel export, but the scaffold is already correct. No action needed.

---

## 4. Consistency with Sibling Tasks

### vs M2-011 (ticket-run) — ✅ HANDOFF CORRECT
M2-011 sets `SIGNED_OFF` at its final step (step 13). M2-012 gates on `subState === 'SIGNED_OFF'`. The handoff is correct — `ticket run` produces the state that `ticket approve` consumes. ✓

### vs M2-010 (ticket-answer) — ✅ NO CONFLICT
Both tasks are operator-initiated commands that check sub-state preconditions. M2-010 requires BLOCKED, M2-012 requires SIGNED_OFF. No overlap. ✓

### vs M1-008 (transition) — ✅ ALIGNED
The task calls `stateMachine.transition(projectId, ticketId, nextColumn)`. M1-008's `transition()` validates forward-adjacent moves and records the transition. The `comment` parameter is optional — omitting it for approvals is correct per M1-008's technical notes. ✓

### vs M1-009 (setSubState) — ✅ ALIGNED
The task calls `stateMachine.setSubState(projectId, ticketId, 'BLOCKED')` after transition. M1-008's technical notes confirm: "Caller responsibility for non-BACKLOG transitions: after a successful forward transition, callers must call `setSubState()` to set the initial sub-state." ✓

### vs M2-010 / M2-011 — ⚠️ MISSING CONSTRUCTOR PATTERN
Both M2-010 and M2-011 (as amended per their reviews) define explicit constructor dependencies. M2-012 does not. See GAP-2.

### vs M2-010 / M2-011 — ⚠️ MISSING GIT COMMIT PATTERN
M2-011 commits artifacts via `GitGateway`. M2-010 (as amended per its review) commits the answered questions file. M2-012 makes no git commit despite the system design requiring one for approval. See GAP-1.

---

## 5. Gaps That Would Block Implementation

### ⚠️ BLOCKER (GAP-1): No git commit on approval — system design §8.3 requires `[HUMAN][v1][advance]`
Without a git commit, the approval is untraceable. The artifact store's git history would have a gap between the reviewer's sign-off commit and the next column's agent output.

### ⚠️ BLOCKER (GAP-2): No constructor or `execute()` signature — implementer cannot wire the use case
The container (`src/cli/container.ts`) must construct the use case with specific ports. Without a constructor, the container wiring is undefined.

---

## 6. Minor Issues and Recommendations

### m1: AC #3 — missing `<id>` argument
AC #3 says: "Given a DONE ticket, when running `aeos ticket approve`, then..." — missing `<id>`. Should be `aeos ticket approve AEOS-1`.

### m2: Container wiring not addressed
The existing `src/cli/container.ts` has no `TicketApproveUseCase`. The task does not specify what to add. Should document:
- Add `ticketApprove: TicketApprovePort` to `Container` interface
- Wire `TicketApproveUseCase` with `TicketRepository`, `StateMachineService`, and `GitGateway`

### m3: BACKLOG tickets produce confusing error
A BACKLOG ticket has `subState: null`. The error message template says: `"Ticket <id> is not signed off (current state: <subState>)"` — this would produce "current state: null" for BACKLOG tickets. Consider handling null explicitly: "current state: BACKLOG (no sub-state)".

### m4: Step 5 — `transition()` return value not checked
The task's use case step 5 calls `stateMachine.transition()` but doesn't mention handling the `{ ok: false }` result. While `transition()` should succeed if the ticket is SIGNED_OFF and the next column is adjacent, edge cases (ticket deleted between steps, concurrent modification) could cause failure. The use case should check the return value.

### m5: Driving port not defined
`src/domain/ports/driving/ticket-approve.port.ts` is a placeholder. The task should define the interface for consistency with the hexagonal pattern.

---

## Findings Summary

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| GAP-1 | **Major** | No git commit on approval — system design §8.3 requires `[HUMAN][v1][advance]` | Add `GitGateway` dependency and commit step after transition |
| GAP-2 | **Major** | No constructor or `execute()` signature — breaks sibling pattern | Define constructor with injected ports and `execute(projectId, projectPath, ticketId)` |
| M1 | Medium | No result type defined — CLI cannot distinguish success/done/error | Define `TicketApproveResult` union type |
| M2 | Medium | BLOCKED sub-state semantics overloaded — "waiting to run" vs "has questions" | Accept for v1, document as known limitation |
| m1 | Minor | AC #3 missing `<id>` argument | Fix: `aeos ticket approve AEOS-1` |
| m2 | Minor | Container wiring not specified | Document additions to `src/cli/container.ts` |
| m3 | Minor | BACKLOG null sub-state produces confusing error message | Handle null explicitly in error template |
| m4 | Minor | `transition()` return value not checked in use case | Add error handling for `{ ok: false }` |
| m5 | Minor | Driving port interface not defined | Define `TicketApprovePort` in placeholder |
| — | Info | Barrel export already exists in `src/application/index.ts` | ✓ No action needed |
| — | Info | COLUMN_ORDER, transition(), setSubState() all verified in source | ✓ |

---

## Recommended Task Amendments

### 1. Add constructor and `execute()` signature

```typescript
export class TicketApproveUseCase {
  constructor(
    private ticketRepo: TicketRepository,
    private stateMachine: StateMachineService,
    private gitGateway: GitGateway,
  ) {}

  execute(
    projectId: string,
    projectPath: string,
    ticketId: string,
  ): TicketApproveResult
}
```

### 2. Define result type

```typescript
type TicketApproveResult =
  | { status: 'advanced'; ticketId: string; fromColumn: Column; toColumn: Column }
  | { status: 'already_done'; ticketId: string }
  | { status: 'error'; ticketId: string; error: string };
```

### 3. Add git commit step

Insert after step 6 (setSubState):
```
7. gitGateway.commitFiles(
     path.join(projectPath, '.aeos'),
     [],
     `[${ticketId}][HUMAN][v1][advance: ${currentColumn} → ${nextColumn}]`
   )
```

### 4. Add error handling for `transition()` result

Replace step 5:
```
5. const result = stateMachine.transition(projectId, ticketId, nextColumn)
   If result.ok is false: return { status: 'error', ticketId, error: result.reason }
```

### 5. Update Dependencies

Add:
```
- GitGateway: commit approval action per system design §8.3
- ProjectRepository: CLI layer needs to resolve projectPath
```

### 6. Update Layer Mapping

Add `GitGateway` to the domain ports line:
```
Domain ports:    src/domain/ports/driven/git-gateway.port.ts     — GitGateway (commit approval)
```

### 7. Fix AC #3

Change from:
```
Given a DONE ticket, when running `aeos ticket approve`, then "already done" message and exit 0
```
To:
```
Given a DONE ticket, when running `aeos ticket approve AEOS-1`, then "already done" message and exit 0
```

---

## Verdict

**Approve with required changes:**

1. **Add git commit step** — system design §8.3 explicitly requires a `[HUMAN][v1][advance]` commit on approval. Without it, the approval is untraceable in the artifact store's git history.
2. **Define constructor and `execute()` signature** — match the pattern from M2-010 and M2-011. Without this, the container cannot wire the use case and the implementer must guess the dependency list.
3. **Define `TicketApproveResult` type** — the CLI command needs typed result variants to render the correct output and set the exit code.
4. **Check `transition()` return value** — the use case must handle the `{ ok: false }` case from `StateMachineService.transition()`.

The task's concept is correct and well-scoped. The column advance logic using `COLUMN_ORDER` is sound. The SIGNED_OFF guard is aligned with the system design's sub-state model. The dependency chain (M1-007, M1-008, M1-009) is accurate. After the amendments above, the task should be implementable without ambiguity.