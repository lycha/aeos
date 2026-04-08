# Code Review — M2-009 Preflight Pass

**Reviewer:** Augment Agent (Staff SWE)
**Date:** 2026-04-08
**Scope:** Uncommitted changes — `PreflightService` implementation + `ExecutorResult` extension
**Verdict:** ⚠️ CONDITIONAL PASS — 1 Major issue must be fixed before merge

---

## Files Reviewed

| File | Status | Lines |
|------|--------|-------|
| `src/application/services/preflight.ts` | New | 78 |
| `src/application/services/preflight.test.ts` | New | 154 |
| `src/application/services/index.ts` | Modified | +1 |
| `src/domain/model/executor-result.ts` | Modified | +2 |
| `.node-version` | New (untracked) | 1 |

---

## Findings

### F-001 · 🔴 MAJOR — Executor adapters never populate `content`, preflight always blocks

**File:** `src/infrastructure/executor/stub-executor.adapter.ts` (L26–30), `src/infrastructure/executor/claude-cli-executor.adapter.ts` (L73)
**Problem:** The new `content?: string` field was added to `ExecutorSuccess`, but neither existing adapter returns it. `StubExecutor` returns `{ ok: true, artifactPath, usage }` and `ClaudeCodeCliExecutor` returns `{ ok: true, artifactPath }`. Since `content` is optional, this compiles without error, but at runtime `result.content` is always `undefined`.

In `preflight.ts` line 54: `const content = result.content ?? '';` always evaluates to `''`, so the `NO_BLOCKERS` check on line 57 never matches. **Every preflight run will report `blocked: true`**, writing an empty questions artifact.

**Impact:** Preflight is non-functional with both existing executor adapters. All tickets will be incorrectly blocked.

**Fix required:**
1. **`StubExecutor`** — include `content` in the returned result:
   ```typescript
   return { ok: true, artifactPath: invocation.outputPath, content, usage: { ... } };
   ```
2. **`ClaudeCodeCliExecutor`** — include `content: stdout` in the success result (L73):
   ```typescript
   resolve({ ok: true, artifactPath: invocation.outputPath, content: stdout });
   ```

---

### F-002 · 🟡 MINOR — `setSubState()` return value silently discarded

**File:** `src/application/services/preflight.ts` (L64)
**Problem:** `StateMachineService.setSubState()` returns `SetSubStateResult` (`{ ok: true } | { ok: false; reason: string }`). The call `this.stateMachine.setSubState(projectId, ticketId, 'BLOCKED')` discards this result. If the ticket is not found or is in BACKLOG, the sub-state update fails silently while the method still returns `{ blocked: true, questionsPath }`.

**Impact:** Inconsistent state — the questions artifact is written but the ticket sub-state is not updated. Downstream orchestrator may assume BLOCKED sub-state is set.

**Recommendation:** Check the result and throw or return an error:
```typescript
const subStateResult = this.stateMachine.setSubState(projectId, ticketId, 'BLOCKED');
if (!subStateResult.ok) {
  throw new Error(`Failed to set BLOCKED sub-state: ${subStateResult.reason}`);
}
```

---

### F-003 · 🟡 MINOR — Thrown exceptions break the Result pattern

**File:** `src/application/services/preflight.ts` (L50, L76)
**Problem:** The service throws `Error` on executor failure (L50) and invalid column (L76), while the rest of the codebase uses discriminated union results (`{ ok: true } | { ok: false; reason }`). Callers must wrap `preflight.run()` in try/catch instead of pattern-matching on the result.

**Impact:** Inconsistent error handling convention. Higher-level orchestrator (M2-011) must remember to catch thrown errors rather than check `.ok`.

**Recommendation:** Consider returning `PreflightResult` as a discriminated union that includes a failure case:
```typescript
export type PreflightResult =
  | { blocked: false }
  | { blocked: true; questionsPath: string }
  | { ok: false; reason: string };
```
Or keep throws for truly exceptional cases but document this decision.

---

### F-004 · ℹ️ INFO — Temp file in `tmpdir()` never cleaned up

**File:** `src/application/services/preflight.ts` (L48)
**Problem:** The executor writes output to a temp file at `join(tmpdir(), ...)`. This file is never deleted after the content is read. Over many preflight runs, temp files accumulate.

**Impact:** Minor disk space concern; no correctness issue. OS tmp cleanup typically handles this.

**Recommendation:** Add cleanup after reading content, or use the artifact store directly instead of temp files.

---

### F-005 · ℹ️ INFO — `.node-version` file added (untracked)

**File:** `.node-version`
**Content:** `22`
**Assessment:** Harmless. Aligns with the project's Node 22+ requirement. Consider committing it with this changeset.

---

## Positive Observations

### ✅ Clean hexagonal architecture
`PreflightService` lives in `src/application/services/` and depends only on domain ports (`Executor`, `ArtifactStore`) and domain services (`StateMachineService`). No infrastructure imports. Dependency direction is correct.

### ✅ Thorough test coverage
7 tests covering: disabled preflight, NO_BLOCKERS, whitespace-trimmed NO_BLOCKERS, blocked path with artifact write + sub-state update, prompt construction verification, executor failure, and empty content edge case. All tests pass.

### ✅ Correct ESM compliance
All imports use `.js` extensions. No CommonJS patterns.

### ✅ Type-safe discriminated union for `PreflightResult`
`PreflightResult` uses `{ blocked: false } | { blocked: true; questionsPath: string }` — clean tagged union.

### ✅ Domain model extension is minimal and backward-compatible
Adding `content?: string` to `ExecutorSuccess` is additive and optional — no existing code breaks at compile time.

### ✅ Proper use of `isValidColumn` type guard
Runtime validation of column string with narrowing type guard — prevents invalid column values from propagating.

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Major | 1 |
| 🟡 Minor | 2 |
| ℹ️ Info | 2 |

---

## Fixes Required Before Merge

### Fix F-001 (Major): Update both executor adapters to return `content`

**File 1: `src/infrastructure/executor/stub-executor.adapter.ts`** — Line 26-30:
Change the return to include `content`:
```typescript
return {
  ok: true,
  artifactPath: invocation.outputPath,
  content,
  usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
};
```

**File 2: `src/infrastructure/executor/claude-cli-executor.adapter.ts`** — Line 73:
Change:
```typescript
resolve({ ok: true, artifactPath: invocation.outputPath });
```
To:
```typescript
resolve({ ok: true, artifactPath: invocation.outputPath, content: stdout });
```

---

## Draft PR Summary

**M2-009: Add PreflightService for pre-flight blocking-questions pass**

Introduces `PreflightService` — an application service that runs a requirements-analysis prompt before the main column worker. If the model identifies blocking questions, it writes a questions artifact and sets the ticket sub-state to BLOCKED. If the model responds with `NO_BLOCKERS`, the pipeline proceeds unblocked.

**Changes:**
- New `PreflightService` in `src/application/services/preflight.ts`
- New test suite with 7 tests in `src/application/services/preflight.test.ts`
- Extended `ExecutorSuccess` with optional `content` field for raw output access
- Barrel export updated in `src/application/services/index.ts`

**Depends on:** M2-001 (Executor port), M1-008/M1-009 (StateMachineService), M2-007 (ColumnSpec)
