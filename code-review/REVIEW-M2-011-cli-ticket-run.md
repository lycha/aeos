# Code Review: M2-011 — `aeos ticket run` CLI Command & Use Case

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Uncommitted changes — 5 files, +330 lines

---

## Overall Assessment

The `ticket run` implementation delivers a coherent end-to-end orchestration flow: preflight → executor → validate → review → sign-off. The CLI command follows the established pattern from `ticket-answer`, the driving port uses a clean discriminated union result type, and the container wiring is consistent with existing use cases. TypeScript strict mode passes, ESLint is clean, and all 298 existing tests pass.

However, the use case contains a **Major hexagonal architecture violation** — it directly imports `node:fs` to read rubric files instead of going through a driven port. There is also a thrown exception in an otherwise result-type-based error flow, and no unit tests for the new 220-line use case.

**Verdict:** Request changes (2 Major, 4 Minor)

---

## Critical Issues

_None._

---

## Major Issues

### M1. Direct `node:fs` import in application layer — hexagonal violation

**File:** `src/application/ticket-run.use-case.ts` (lines 141–148, step 11a)

**Problem:**
The use case dynamically imports `node:fs` to read rubric files:
```typescript
const fs = await import('node:fs');
rubricContents.push(fs.readFileSync(rubricFullPath, 'utf-8'));
```
This bypasses the port abstraction. The application layer should never perform direct I/O — all filesystem access must go through a driven port (`ArtifactStore` or a new `RubricLoader` port).

Additionally, `readFileSync` is a synchronous call inside an `async` orchestration flow, violating the "No synchronous file I/O in async orchestration flows" performance rule.

**Impact:**
- Breaks the dependency direction contract: application layer now depends on Node.js runtime internals.
- Makes the use case untestable without filesystem fixtures — cannot mock `node:fs` through DI.
- Blocks future adapters (e.g. S3-backed rubric storage).

**Recommendation:**
Option A (preferred): Read rubrics through `ArtifactStore` by treating them as project-level artifacts, or add a `readFile(absolutePath): string` method to an existing port.
Option B: Create a minimal `RubricLoader` driven port:
```typescript
// src/domain/ports/driven/rubric-loader.port.ts
export interface RubricLoader {
  load(rubricPath: string, projectPath: string): string | null;
}
```
Inject it into `TicketRunUseCase` and use it in step 11a. Implement as `FsRubricLoader` in infrastructure.

### M2. No unit tests for `TicketRunUseCase`

**File:** `src/application/ticket-run.use-case.ts` (entire file)

**Problem:**
Every other use case has a co-located `*.test.ts` file (`ticket-create.use-case.test.ts`, `ticket-answer.use-case.test.ts`, etc.). This 220-line orchestration use case — the most complex in the codebase — has none.

**Impact:**
- The 13-step orchestration flow has zero automated regression coverage.
- Edge cases (missing ticket, BLOCKED state, executor failure, validation failure, reviewer failure) are untested.
- Refactoring is unsafe without tests.

**Recommendation:**
Create `src/application/ticket-run.use-case.test.ts` with tests covering at minimum:
1. Happy path: success result with correct artifact and review paths
2. Ticket not found → failed result
3. Invalid column (BACKLOG, DONE, DOD_GATE) → failed result
4. Already WORKING → failed result
5. BLOCKED state → blocked result
6. Preflight blocked → blocked result
7. Executor failure → failed result + FAILED sub-state + artifact cleanup
8. Validation failure → failed result + FAILED sub-state + artifact cleanup
9. Reviewer failure → still succeeds (review is best-effort)

---

## Minor Issues

### m1. `resolveColumn` throws instead of returning a typed result

**File:** `src/application/ticket-run.use-case.ts` (lines 210–215, `resolveColumn`)

**Problem:**
```typescript
private resolveColumn(columnString: string): Column {
  if (isValidColumn(columnString)) return columnString;
  throw new Error(`Invalid column value: ${columnString}`);
}
```
The rest of the use case uses typed result objects (`TicketRunResult`) for all error paths. This `throw` breaks the pattern and will surface as an unhandled exception in the CLI catch block rather than a structured `failed` result.

**Recommendation:**
Call `resolveColumn` early (before step 3) and return a `{ status: 'failed' }` result on invalid column, consistent with the other guard clauses.

### m2. Silent error swallowing on rubric file loading

**File:** `src/application/ticket-run.use-case.ts` (lines 141–148)

**Problem:**
```typescript
catch {
  // Skip missing rubric files
}
```
This catches **all** errors, including permission errors, encoding errors, and out-of-memory. Missing files should be checked explicitly; other errors should propagate or be logged.

**Recommendation:**
Check file existence before reading, or catch only `ENOENT`:
```typescript
catch (err: unknown) {
  if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
    continue; // Skip missing rubric
  }
  throw err; // Re-throw unexpected errors
}
```
(This becomes moot once rubric loading moves to a port per M1.)

### m3. `PreflightService` instantiated inside `execute()` instead of injected

**File:** `src/application/ticket-run.use-case.ts` (line 73)

**Problem:**
```typescript
const preflight = new PreflightService(this.executor, this.artifactStore, this.stateMachine);
```
All other dependencies are injected via constructor, but `PreflightService` is instantiated inline. This creates a hidden dependency and makes it harder to mock in tests.

**Recommendation:**
Inject `PreflightService` (or a `PreflightPort`) through the constructor, matching the DI pattern used for all other collaborators.

### m4. Mutating `reviewContext.priorArtifacts` returned by `ContextAssembler`

**File:** `src/application/ticket-run.use-case.ts` (lines 159–163)

**Problem:**
```typescript
reviewContext.priorArtifacts.push({
  name: 'reviewer-rubrics.md',
  content: rubricContents.join('\n\n---\n\n'),
});
```
This mutates the `AssembledContext` object returned by `contextAssembler.assemble()`. While not currently causing bugs (the object isn't reused), it sets a precedent for mutation of returned value objects.

**Recommendation:**
Spread into a new array:
```typescript
const enrichedArtifacts = [
  ...reviewContext.priorArtifacts,
  { name: 'reviewer-rubrics.md', content: rubricContents.join('\n\n---\n\n') },
];
const enrichedContext = { ...reviewContext, priorArtifacts: enrichedArtifacts };
```

---

## Positive Observations

1. **Clean discriminated union result type** — `TicketRunResult` with `'success' | 'failed' | 'blocked'` is well-designed and follows project conventions.
2. **Comprehensive guard clauses** — All invalid states (BACKLOG, DONE, DOD_GATE, WORKING, BLOCKED) are checked early with descriptive error messages.
3. **Compensating rollback on failure** — Steps 8 and 9 correctly remove artifacts and set FAILED sub-state when executor or validation fails.
4. **CLI command follows established pattern** — Registration, lazy use-case resolution, `process.exitCode` (not `process.exit()`), and error formatting match `ticket-answer.command.ts`.
5. **Container wiring is consistent** — Lazy `get` accessor with local dependency construction matches the existing `ticketAnswer` pattern.

---

## Architecture Compliance

- [x] Dependency direction: `cli → application → domain ← infrastructure` — **violated in M1** (`node:fs` in application)
- [x] Domain layer purity: no I/O in `src/domain/` — ✅ domain port file is clean
- [x] Barrel exports updated — `src/cli/index.ts` re-exports the new command ✅
- [x] Composition root updated — `container.ts` wires the new use case ✅

---

## Verification Notes

- `npm run typecheck` — **PASS**
- `npm run lint` — **PASS**
- `npm test` — **PASS** (28 files, 298 tests)
- No new tests added for the use case (see M2)

---

## Draft PR Summary

**Summary:**
- Added `TicketRunPort` driving port with discriminated union result type (`success | failed | blocked`)
- Implemented `TicketRunUseCase` — 13-step orchestration: guard clauses → column/agent spec loading → preflight → set WORKING → assemble context → build prompt → execute → validate → persist & commit → reviewer agent → sign-off
- Added `aeos ticket run <id>` CLI command following established command registration pattern
- Wired `TicketRunUseCase` into composition root with `StubExecutor`, `YamlColumnSpecLoader`, `YamlAgentSpecLoader`

**Testing:**
- Existing 298 tests pass; typecheck and lint clean
- ⚠️ No new unit tests for the use case — required before merge (M2)

**Fixes required before merge:**
1. **M1** — Remove `node:fs` import from use case; read rubrics through a driven port
2. **M2** — Add co-located unit tests for `TicketRunUseCase`

Please review this summary and confirm it matches the intended changes.
