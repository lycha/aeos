# Code Review: M2-010 — `aeos ticket answer` (CLI + Use Case)

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Uncommitted changes — 11 files, +237 lines

---

## Overall Assessment

This changeset implements the `aeos ticket answer` command end-to-end: driving port, use case, CLI command, two new `ArtifactStore` port methods (`artifactExists`, `getArtifactMtime`) with their `FsArtifactStore` adapter implementations, container wiring, and a comprehensive test suite (8 test cases). The architecture follows the established hexagonal pattern and the code is well-structured with good test coverage.

**One critical bug** exists in the git commit step: the file path passed to `commitFiles()` is relative to the project root, but `git add` runs with `cwd` set to the `.aeos/` directory, meaning the path will resolve to a non-existent location and the commit will silently fail or throw. **One major issue**: no compensation/rollback if the git commit fails after the sub-state has already been transitioned to WORKING.

**Verdict:** Request changes

---

## Critical Issues

### C1. Incorrect relative path passed to `commitFiles()` — git commit will fail at runtime

**File:** `src/application/ticket-answer.use-case.ts` (lines 66–71)

**Problem:**
The use case constructs the file path as:
```typescript
const questionsFilePath = path.join('.aeos', 'tickets', ticketId, questionsFilename);
```
Then calls:
```typescript
this.gitGateway.commitFiles(aeosDir, [questionsFilePath], message);
```
where `aeosDir = path.join(projectPath, '.aeos')`.

The `SimpleGitGateway.commitFiles()` adapter runs `git add ...files` with `{ cwd: dir }` (i.e., `cwd: aeosDir`). Since `questionsFilePath` starts with `.aeos/`, git will look for `.aeos/.aeos/tickets/...` — a path that does not exist. Additionally, the `realpathSync` validation will either throw ENOENT or reject the file as outside the directory.

Existing tests for `commitFiles()` all pass **absolute** file paths (see `simple-git-gateway.adapter.test.ts`). The unit test for this use case mocks `gitGateway.commitFiles`, so the bug is invisible there.

**Impact:** Every invocation of `aeos ticket answer` will fail at the git commit step. The sub-state will have already been transitioned to WORKING (step 5), leaving the system in an inconsistent state (sub-state changed but no git commit recorded).

**Recommendation:**
Pass an absolute path to `commitFiles()`:
```typescript
const questionsFilePath = path.join(aeosDir, 'tickets', ticketId, questionsFilename);
this.gitGateway.commitFiles(aeosDir, [questionsFilePath], `[${ticketId}][QUESTIONS][v1][human][answered]`);
```
Also update the test assertion in `ticket-answer.use-case.test.ts` (line 98) to expect the absolute path.

---

## Major Issues

### M1. No compensation/rollback on git commit failure

**File:** `src/application/ticket-answer.use-case.ts` (lines 59–72)

**Problem:**
Step 5 transitions the sub-state to WORKING, then step 6 commits to git. If the git commit throws (corrupt `.git`, disk error, path issue), the sub-state change is already persisted in SQLite but no commit is recorded. Compare with `ticket-create.use-case.ts` (lines 67–74), which wraps the git commit in a try/catch and performs compensating rollback on failure.

**Impact:** Data integrity — the ticket's sub-state and the git audit trail can become inconsistent. The system design requires all state changes to be auditable via git history (PRD NFR-02).

**Recommendation:**
Wrap the git commit in a try/catch with compensation:
```typescript
try {
  this.gitGateway.commitFiles(aeosDir, [questionsFilePath], message);
} catch (err) {
  // Compensate: revert sub-state back to BLOCKED
  this.stateMachine.setSubState(projectId, ticketId, 'BLOCKED');
  throw err;
}
```

### M2. Unsafe `as unknown as StateMachineService` cast in test mock

**File:** `src/application/ticket-answer.use-case.test.ts` (line 47)

**Problem:**
```typescript
} as unknown as StateMachineService;
```
This double cast bypasses TypeScript's structural checking entirely. If `StateMachineService` adds new methods, the mock won't break at compile time — the test will silently pass with an incomplete mock and fail with a confusing runtime error.

**Impact:** Reduced type safety in tests. Future refactors to `StateMachineService` won't be caught at compile time.

**Recommendation:**
Extract a port interface (e.g., `StateMachinePort`) from `StateMachineService` in the domain layer and depend on that interface in the use case. Alternatively, if that's out of scope, at minimum use `Partial<StateMachineService>` with a comment explaining which methods are required:
```typescript
function createMockStateMachine(): Pick<StateMachineService, 'transition' | 'setSubState'> {
  return {
    transition: vi.fn().mockReturnValue({ ok: true }),
    setSubState: vi.fn().mockReturnValue({ ok: true }),
  };
}
```
This requires updating the `TicketAnswerUseCase` constructor to accept the picked type or an interface.

---

## Minor Issues

### m1. Duplicate success message in CLI command

**File:** `src/cli/commands/ticket-answer.command.ts` (lines 75 and 87)

**Problem:** The success message `✓ Ticket ${ticketId} unblocked — sub-state set to WORKING` is duplicated in both the confirmation-retry branch and the happy-path branch.

**Recommendation:** Extract to a local constant or helper:
```typescript
const successMsg = (id: string) => `✓ Ticket ${id} unblocked — sub-state set to WORKING`;
```

### m2. `needsConfirmation` narrowing uses `in` operator instead of discriminated union

**File:** `src/cli/commands/ticket-answer.command.ts` (line 51)

**Problem:** The check `!result.ok && 'needsConfirmation' in result && result.needsConfirmation` relies on the `in` operator for narrowing. The `TicketAnswerResult` union already defines `needsConfirmation` as a discriminant — TypeScript can narrow on `result.ok === false` and then on `result.needsConfirmation === true` without `in`.

**Recommendation:**
```typescript
if (!result.ok && result.needsConfirmation) {
```
TypeScript 5.x narrows this correctly with the existing discriminated union definition.

### m3. Error output goes to `console.error` but abort goes to `console.log`

**File:** `src/cli/commands/ticket-answer.command.ts` (line 57)

**Problem:** When the user declines confirmation, the message `Aborted.` is written to `stdout` via `console.log`. Per the verification checklist, errors/warnings should go to `stderr`.

**Recommendation:** Use `console.error('Aborted.')` for consistency — abort is a non-success outcome.

---

## Positive Observations

1. **Well-designed driving port** — `TicketAnswerResult` uses a proper discriminated union with three variants (`ok: true`, `needsConfirmation`, and `error`). Clean, type-safe result handling.
2. **Comprehensive test coverage** — 8 test cases covering happy path, not-found, wrong sub-state, missing file, unmodified file, confirmed bypass, null sub-state. Good edge case coverage.
3. **Path traversal prevention** — Both new `FsArtifactStore` methods (`artifactExists`, `getArtifactMtime`) call `validatePathComponent` before constructing file paths. Consistent with existing methods.
4. **ENOENT handling in `getArtifactMtime`** — Properly distinguishes between "file not found" (returns `null`) and other filesystem errors (re-throws). Matches the project's error handling pattern.
5. **Existing mock updates** — All four existing test files that create `ArtifactStore` mocks were updated with the new methods. No mock drift.
6. **Container wiring** — Lazy getter pattern in `container.ts` is consistent with sibling entries. `StateMachineService` and `SqliteTransitionRepository` correctly instantiated.

---

## Architecture Compliance

- [x] Dependency direction: `cli → application → domain ← infrastructure`
- [x] Domain layer purity: `ticket-answer.port.ts` has zero external imports; `artifact-store.port.ts` uses only `Date` (JS built-in)
- [x] Barrel exports updated in `src/cli/index.ts`
- [x] Composition root (`container.ts`) updated with new use case wiring
- [x] `node:path` in application layer — consistent with `project-init.use-case.ts` and `ticket-create.use-case.ts`

---

## Verification Notes

- `npm run typecheck` — **PASS**
- `npm run lint` — **PASS**
- `npm test` — **PASS** (28 files, 297 tests, all passing)
- **Runtime validation needed:** The C1 path bug is invisible in unit tests due to mocking. Manual or integration test with a real `.aeos/.git` repo required.

---

## Fixes Required

### Fix C1 — Correct the file path in `commitFiles()` call

**File:** `src/application/ticket-answer.use-case.ts`
```diff
-    const questionsFilePath = path.join('.aeos', 'tickets', ticketId, questionsFilename);
+    const questionsFilePath = path.join(aeosDir, 'tickets', ticketId, questionsFilename);
```

**File:** `src/application/ticket-answer.use-case.test.ts` (line 98)
```diff
-      [path.join('.aeos', 'tickets', TICKET_ID, `${TICKET_ID}-questions.md`)],
+      [path.join(PROJECT_PATH, '.aeos', 'tickets', TICKET_ID, `${TICKET_ID}-questions.md`)],
```

### Fix M1 — Add compensation on git commit failure

**File:** `src/application/ticket-answer.use-case.ts` (after line 65)
```diff
     // 6. Commit the answered questions file
     const aeosDir = path.join(projectPath, '.aeos');
     const questionsFilePath = path.join(aeosDir, 'tickets', ticketId, questionsFilename);
-    this.gitGateway.commitFiles(
-      aeosDir,
-      [questionsFilePath],
-      `[${ticketId}][QUESTIONS][v1][human][answered]`,
-    );
+    try {
+      this.gitGateway.commitFiles(
+        aeosDir,
+        [questionsFilePath],
+        `[${ticketId}][QUESTIONS][v1][human][answered]`,
+      );
+    } catch (err) {
+      this.stateMachine.setSubState(projectId, ticketId, 'BLOCKED');
+      throw err;
+    }
```

---

## Draft PR Summary

**Summary:**
- Added `aeos ticket answer` CLI command to unblock BLOCKED tickets after preflight questions are answered
- Implemented `TicketAnswerUseCase` with mtime-based modification check and interactive confirmation
- Extended `ArtifactStore` port with `artifactExists()` and `getArtifactMtime()` methods
- Implemented both new methods in `FsArtifactStore` adapter with path traversal validation
- Wired use case in `container.ts` with `StateMachineService` and `SqliteTransitionRepository`
- Added 8 unit tests covering happy path, error cases, and confirmation bypass
- Updated 4 existing test files with new `ArtifactStore` mock methods

**Testing:**
- 297 tests passing (28 files)
- typecheck and lint clean

Please review this summary and confirm it matches the intended changes.
