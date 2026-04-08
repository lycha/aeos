# Code Review: M2-003 — Claude CLI Executor Adapter

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Uncommitted changes — `src/infrastructure/executor/claude-cli-executor.adapter.ts` (+112 lines)

---

## Overall Assessment

Solid implementation of the `ClaudeCodeCliExecutor` adapter. The code correctly uses `execFile` (not `exec`) to prevent shell injection, implements both `run()` and `interrupt()` from the `Executor` port, and follows the hexagonal architecture pattern. The test file is thorough (10 tests, co-located, using temp directories and proper mocks). TypeScript compiles cleanly, ESLint passes, and all 202 tests pass.

Two major issues identified: a race condition in the `interrupt()` flow that can leak a timer, and a missing `usage` field on the success result that peer adapters (`StubExecutor`) already return. One minor issue around `outputPath` not being validated against path traversal. Overall quality is high — approve with the two major fixes applied.

**Verdict:** Approve with changes

---

## Critical Issues

_None._

---

## Major Issues

### M1. Timer leak on `interrupt()` — `clearTimeout(timer)` never fires

**File:** `src/infrastructure/executor/claude-cli-executor.adapter.ts` (`interrupt()` + `run()`)

**Problem:**
When `interrupt()` is called, it sets `this.runningProcess = null` immediately (line 96). However, the `execFile` callback still holds a reference to `timer` via closure. If the child process exits after `interrupt()` kills it, the callback fires and calls `clearTimeout(timer)` — but `timer` is still pending during the gap between `kill('SIGTERM')` and the callback firing. If the process doesn't exit promptly after SIGTERM, `timer` fires, sets `timedOut = true`, and calls `child.kill('SIGKILL')` on an already-killed process. While not catastrophic, this means the resolve can be called with a **timeout** reason instead of **interrupted** reason, which is incorrect.

More importantly, if `interrupt()` is called and the child never invokes the callback (edge case with SIGTERM), `timer` leaks and the Promise never resolves.

**Impact:**
Incorrect error classification (timeout vs. interrupted). Potential memory/timer leak on edge-case process termination.

**Recommendation:**
Store `timer` as an instance field so `interrupt()` can clear it:

```typescript
private timer: ReturnType<typeof setTimeout> | null = null;

async interrupt(): Promise<void> {
  if (this.runningProcess) {
    this.interrupted = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.runningProcess.kill('SIGTERM');
    this.runningProcess = null;
  }
}
```

And in `run()`, assign `this.timer = setTimeout(...)` instead of `const timer = setTimeout(...)`, and clear `this.timer` in the callback.

### M2. Missing `usage` field on success result — inconsistent with `StubExecutor`

**File:** `src/infrastructure/executor/claude-cli-executor.adapter.ts` (line 67)

**Problem:**
On success, the adapter returns `{ ok: true, artifactPath }` without a `usage` field. The `StubExecutor` returns `{ ok: true, artifactPath, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } }`. While `usage` is optional on `ExecutorSuccess`, downstream consumers (cost tracking in M2-007) will need to handle the missing case. Since the Claude CLI `--print` mode does not expose token counts, the adapter should explicitly document this gap.

**Impact:**
Downstream cost-tracking logic may silently skip cost attribution for real Claude CLI runs.

**Recommendation:**
This is acceptable as-is since `usage` is optional on the type, but add a TODO comment at the resolve site:

```typescript
// TODO(M2-007): Parse usage from Claude CLI JSON output mode when available
resolve({ ok: true, artifactPath: invocation.outputPath });
```

---

## Minor Issues

### m1. No `outputPath` boundary validation — path traversal risk

**File:** `src/infrastructure/executor/claude-cli-executor.adapter.ts` (`run()`, line 65)

**Problem:**
`invocation.outputPath` is written to directly via `fs.writeFile` without validating it stays within the expected `.aeos/` project boundary. While the caller (application layer) should construct safe paths, defense-in-depth suggests the adapter should validate.

**Recommendation:**
Validate at the boundary, or document that the caller is responsible. At minimum add a comment:

```typescript
// outputPath is constructed by the application layer — trusted input
```

A full fix would assert the path is under the project's `.aeos/artifacts/` directory.

### m2. `execFile` callback typed as `async` — subtle risk

**File:** `src/infrastructure/executor/claude-cli-executor.adapter.ts` (line 37)

**Problem:**
The `execFile` callback is declared `async` (line 37). If the `await fs.mkdir(...)` or `await fs.writeFile(...)` throw, the rejection is caught by the `try/catch` block — so this is fine in practice. However, `execFile` does not expect an async callback and will not handle a rejected promise from it. If future edits add code after the try/catch that throws, it would be an unhandled rejection.

**Recommendation:**
This is acceptable as-is since all async paths are within the try/catch. No action needed, but worth noting for future maintainers.

---

## Positive Observations

1. **Correct use of `execFile`** — prevents shell injection per security checklist. ✓
2. **Proper discriminated union returns** — `{ ok: true, artifactPath }` and `{ ok: false, reason }` match the `ExecutorResult` type. ✓
3. **ENOENT handling** — specific, actionable error message when `claude` binary is not found. ✓
4. **Config-driven args** — `model`, `maxTokens`, `timeoutMs` are cleanly separated into a config interface. ✓
5. **Stdin piping** — prompt sent via stdin (not CLI arg) avoids ARG_MAX limits on large prompts. ✓
6. **Thorough test suite** — 10 well-structured tests covering success, error, ENOENT, timeout, interrupt, stdin piping, and directory creation. Tests use `os.tmpdir()` and clean up after themselves. ✓
7. **Co-located tests** — `*.test.ts` next to source file per project convention. ✓
8. **ESM compliance** — all imports use `.js` extension. ✓

---

## Architecture Compliance

- [x] Dependency direction: `cli → application → domain ← infrastructure` — adapter imports from domain only ✓
- [x] Domain layer purity: no I/O in `src/domain/` — this change only touches `src/infrastructure/` ✓
- [x] Barrel exports updated: `src/infrastructure/executor/index.ts` already exports this adapter ✓
- [ ] Composition root (`container.ts`) updated — **Not yet wired**. This is expected; container wiring will happen when the `ticket-run` use case is implemented.

---

## Verification Notes

- `npx tsc --noEmit` — **PASS** ✓
- `npx eslint src/infrastructure/executor/claude-cli-executor.adapter.ts` — **PASS** ✓
- `npx vitest run` — **PASS** (19 test files, 202 tests passing) ✓

---

## Draft PR Summary

**Summary:**
- Implement `ClaudeCodeCliExecutor` adapter in `src/infrastructure/executor/claude-cli-executor.adapter.ts`
- Adapter implements `Executor` port (`run()` + `interrupt()`) using `node:child_process.execFile`
- Sends prompt via stdin, writes stdout to `invocation.outputPath`
- Supports configurable `model`, `maxTokens`, and `timeoutMs` via `ClaudeCliExecutorConfig`
- Handles ENOENT (missing binary), timeout (SIGKILL), interruption (SIGTERM), and write errors
- Add comprehensive test suite with 10 test cases (`claude-cli-executor.adapter.test.ts`)

**Testing:**
- `tsc --noEmit` ✅ | `eslint` ✅ | `vitest run` ✅ (202 tests, 202 passing)

Please review this summary and confirm it matches the intended changes.
