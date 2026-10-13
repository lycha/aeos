# Code Review: M2-012 — `aeos ticket approve` (CLI + Use Case + Port)

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Uncommitted changes — 5 modified files + 1 untracked test file, +149 lines

---

## Overall Assessment

This changeset implements the `aeos ticket approve` command end-to-end: driving port (`TicketApprovePort`), use case (`TicketApproveUseCase`), CLI command, container wiring, and barrel exports. The architecture follows the established hexagonal pattern, the discriminated union result type is well-designed, and the test suite (10 cases) provides thorough coverage.

**One critical bug** exists: the `commitFiles()` call passes an empty file array `[]`, which causes `SimpleGitGateway.commitFiles()` to return immediately without staging or committing anything — the audit trail is silently lost. **Two major issues**: the `setSubState()` return value is ignored (potential silent failure), and there is no compensation/rollback if the git commit step fails after state has been mutated.

**Verdict:** Request changes

---

## Critical Issues

### C1. Git commit is silently skipped — empty files array causes `commitFiles()` to no-op

**File:** `src/application/ticket-approve.use-case.ts` (lines 57–61)

**Problem:**
The use case calls:
```typescript
this.gitGateway.commitFiles(
  aeosDir,
  [],  // ← empty array
  `[${ticketId}][HUMAN][v1][advance: ${currentColumn} → ${nextColumn}]`,
);
```

`SimpleGitGateway.commitFiles()` has an early return on line 26:
```typescript
if (files.length === 0) return;
```

This means **every approval operation completes without recording any git commit**. The column transition and sub-state change are persisted in SQLite, but the audit trail is lost. The project design requires all state changes to be auditable via git history.

The unit test mocks `gitGateway.commitFiles`, so the bug is invisible there.

**Impact:** Complete loss of git audit trail for all approval operations. Data integrity violation.

**Recommendation:**
Use `this.gitGateway.commit(aeosDir, message)` instead, which stages all changes (including the modified SQLite DB file) via `git add .`:
```typescript
this.gitGateway.commit(
  aeosDir,
  `[${ticketId}][HUMAN][v1][advance: ${currentColumn} → ${nextColumn}]`,
);
```
Alternatively, if only specific files should be committed, compute the actual file paths (e.g., the SQLite DB file) and pass them to `commitFiles()`.

---

## Major Issues

### M1. `setSubState()` return value is ignored — silent failure

**File:** `src/application/ticket-approve.use-case.ts` (line 53)

**Problem:**
```typescript
this.stateMachine.setSubState(projectId, ticketId, 'BLOCKED');
```
The return value (`SetSubStateResult`) is discarded. `setSubState()` can fail (e.g., ticket not found after a race, BACKLOG guard). Compare with `TicketRunUseCase` (lines 102–109) and `TicketAnswerUseCase` (lines 60–63), which both check the result:
```typescript
const workingResult = this.stateMachine.setSubState(projectId, ticketId, 'WORKING');
if (!workingResult.ok) {
  return { status: 'failed', ticketId, error: `Failed to set WORKING state: ${workingResult.reason}` };
}
```

**Impact:** If `setSubState` fails, the ticket is moved to the next column but left with an inconsistent sub-state. The error is swallowed.

**Recommendation:**
Check the result and return an error if it fails:
```typescript
const subStateResult = this.stateMachine.setSubState(projectId, ticketId, 'BLOCKED');
if (!subStateResult.ok) {
  return { status: 'error', ticketId, error: `Failed to set BLOCKED state: ${subStateResult.reason}` };
}
```

### M2. No compensation/rollback on git commit failure

**File:** `src/application/ticket-approve.use-case.ts` (lines 57–61)

**Problem:**
Steps 5–6 transition the column and set the sub-state, then step 7 commits to git. If the git commit throws, the state changes are persisted in SQLite but no audit commit is recorded. Compare with `TicketAnswerUseCase` (lines 66–78), which wraps the git commit in a try/catch with compensation:
```typescript
try {
  this.gitGateway.commitFiles(aeosDir, [questionsFilePath], message);
} catch (err) {
  this.stateMachine.setSubState(projectId, ticketId, 'BLOCKED');
  throw err;
}
```

**Impact:** Data integrity — the ticket's column/sub-state and the git audit trail can diverge on git failure.

**Recommendation:**
Wrap the git commit in a try/catch. On failure, compensate by reverting the column transition and sub-state:
```typescript
try {
  this.gitGateway.commit(aeosDir, `[${ticketId}][HUMAN][v1][advance: …]`);
} catch (err) {
  // Compensate: revert column back
  this.stateMachine.transition(projectId, ticketId, currentColumn);
  this.stateMachine.setSubState(projectId, ticketId, 'SIGNED_OFF');
  throw err;
}
```

---

## Minor Issues

### m1. Unsafe `as unknown as StateMachineService` cast in test mock

**File:** `src/application/ticket-approve.use-case.test.ts` (line 40)

**Problem:**
```typescript
return mock as unknown as StateMachineService;
```
This double cast bypasses structural checking. If `StateMachineService` adds methods, the mock won't fail at compile time. This is a known pattern in the codebase (flagged in REVIEW-M2-010) but worth tracking.

**Recommendation:** When a `StateMachinePort` interface is extracted (per prior review recommendation), update this mock to use the interface type.

### m2. Port interface signature inconsistency — positional args vs. input object

**File:** `src/domain/ports/driving/ticket-approve.port.ts` (line 11)

**Problem:**
```typescript
execute(projectId: string, projectPath: string, ticketId: string): TicketApproveResult;
```
Some driving ports use an input object (e.g., `TicketShowPort` uses `TicketShowInput`, `TicketAnswerPort` uses `TicketAnswerInput`), while others use positional parameters (e.g., `TicketRunPort`). This is inconsistent but matches the pattern used by `TicketRunPort`.

**Recommendation:** No action needed now, but consider standardizing to input objects in a future cleanup pass.

---

## Positive Observations

1. **Well-designed discriminated union** — `TicketApproveResult` has three clear variants (`advanced`, `already_done`, `error`) with appropriate type narrowing in the CLI switch.
2. **Comprehensive test coverage** — 10 test cases covering: happy path, transition call verification, sub-state change, git commit message, not-found, wrong sub-state (WORKING), null sub-state, already DONE, transition failure, and multi-column advance (BACKLOG → PRODUCT_SCOPING).
3. **CLI follows established pattern** — Matches the `ticket-run.command.ts` structure exactly: `findRoot()` → `read()` → factory invocation → switch on result status.
4. **Container wiring correct** — Lazy getter pattern consistent with `ticketAnswer` and `ticketRun`. `StateMachineService` and `SqliteTransitionRepository` correctly instantiated.
5. **COLUMN_ORDER usage** — Direct index arithmetic on the readonly tuple is clean and type-safe.
6. **Domain purity preserved** — Port file imports only `Column` from the domain model. No external dependencies.

---

## Architecture Compliance

- [x] Dependency direction: `cli → application → domain ← infrastructure`
- [x] Domain layer purity: `ticket-approve.port.ts` has only domain model imports
- [x] ESM compliance: all imports use `.js` extensions
- [x] Barrel exports updated in `src/cli/index.ts`
- [x] Composition root (`container.ts`) updated with lazy getter
- [x] `node:path` in application layer — consistent with existing use cases

---

## Verification Notes

- `npx tsc --noEmit` — **PASS**
- `npx eslint` (changed files) — **PASS**
- `npx vitest run src/application/ticket-approve.use-case.test.ts` — **PASS** (10 tests)
- **Runtime validation needed:** C1 is invisible in unit tests due to mocking. Manual test with a real `.aeos/.git` repo required.

---

## Fixes Required

### Fix C1 — Use `commit()` instead of `commitFiles()` with empty array

**File:** `src/application/ticket-approve.use-case.ts`
```diff
-    this.gitGateway.commitFiles(
+    this.gitGateway.commit(
       aeosDir,
-      [],
       `[${ticketId}][HUMAN][v1][advance: ${currentColumn} → ${nextColumn}]`,
     );
```

**File:** `src/application/ticket-approve.use-case.test.ts` (line ~95)
Update the assertion to expect `commit` instead of `commitFiles`:
```diff
-    expect(gitGateway.commitFiles).toHaveBeenCalledWith(
+    expect(gitGateway.commit).toHaveBeenCalledWith(
       path.join(PROJECT_PATH, '.aeos'),
-      [],
       `[${TICKET_ID}][HUMAN][v1][advance: PRODUCT_SCOPING → ARCH_SPIKE]`,
     );
```

### Fix M1 — Check `setSubState()` return value

**File:** `src/application/ticket-approve.use-case.ts`
```diff
-    this.stateMachine.setSubState(projectId, ticketId, 'BLOCKED');
+    const subStateResult = this.stateMachine.setSubState(projectId, ticketId, 'BLOCKED');
+    if (!subStateResult.ok) {
+      return { status: 'error', ticketId, error: `Failed to set BLOCKED state: ${subStateResult.reason}` };
+    }
```

### Fix M2 — Add compensation on git commit failure

**File:** `src/application/ticket-approve.use-case.ts`
Wrap the git commit in a try/catch after fixing C1:
```diff
+    try {
       this.gitGateway.commit(aeosDir, `[${ticketId}][HUMAN][v1][advance: ${currentColumn} → ${nextColumn}]`);
+    } catch (err) {
+      // Compensate: revert column and sub-state
+      this.stateMachine.transition(projectId, ticketId, currentColumn);
+      this.stateMachine.setSubState(projectId, ticketId, 'SIGNED_OFF');
+      throw err;
+    }
```

---

## Draft PR Summary

**Summary:**
- Added `aeos ticket approve` CLI command to advance SIGNED_OFF tickets to the next pipeline column
- Implemented `TicketApproveUseCase` with COLUMN_ORDER-based forward progression and DONE terminal state detection
- Defined `TicketApprovePort` driving port with discriminated union result type (`advanced | already_done | error`)
- Wired use case in `container.ts` with `StateMachineService`, `SqliteTransitionRepository`, and `GitGateway`
- Added 10 unit tests covering happy paths, guard conditions, and edge cases

**Testing:**
- 10 new tests passing
- typecheck and lint clean

Please review this summary and confirm it matches the intended changes.
