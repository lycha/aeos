# Deep Review: M2-003 — Implement `ClaudeCodeCliExecutor`

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Task specification — `docs/tasks/M2-003-claude-cli-executor.md`
**Cross-referenced against:** System design (03-system-design.md §5/4.1–4.2), PRD (02-prd.md FR-13, FR-30), Action plan (05-action-plan-v1.md M2), sibling tasks M2-001, M2-002, M2-011, M2-014, existing scaffold in `src/`, prior reviews REVIEW-20260407-M2-001 and REVIEW-20260407-M2-002

---

## Overall Assessment

The task correctly identifies the file path, hexagonal layer placement, and the dependency on M2-001. The implementation steps cover the core happy path (shell out → capture stdout → write file) and two error paths (non-zero exit, timeout). The acceptance criteria are testable and cover the key scenarios.

However, the task has **two major gaps**, **one medium gap**, and **several minor issues** that would cause rework or block downstream tasks if not addressed before implementation.

**Verdict:** Approve with required changes.

---

## 1. Correctness vs System Design

### ⚠️ MAJOR (inherited): Missing `interrupt()` method

The M2-001 review identified that `Executor` must include `interrupt(): Promise<void>` per system design §4.1, PRD FR-13 (`aeos ticket interrupt`), and the state machine's INTERRUPTED sub-state (§7.1). The M2-001 and M2-002 tasks have been updated to include it.

**M2-003 does not mention `interrupt()` at all.** For `ClaudeCodeCliExecutor`, this is non-trivial — it must kill the child process spawned by `execFile`. The implementation needs:
- A class-level reference to the running `ChildProcess` (set during `run()`, cleared on completion)
- `interrupt()` calls `childProcess.kill('SIGTERM')` (or `SIGKILL` after a grace period)
- `run()` must detect the kill signal and return `{ success: false, error: 'Execution interrupted by operator' }`

**Impact if missed:** `aeos ticket interrupt` (M2-011) would have no way to stop a running Claude CLI invocation. The process would continue consuming tokens and wall-clock time while the state machine shows INTERRUPTED.

### ⚠️ MAJOR: Model and max_tokens configuration not addressed

System design §4.2 specifies executor config per column spec:
```yaml
executor:
  type: claude-code-cli
  model: claude-opus-4-6         # passed as --model flag
  max_tokens: 8000               # passed as flag
```

The task's implementation step 1 shows `claude -p "<escaped prompt>"` with no `--model` or `--max_tokens` flags. The `ExecutorInvocation` interface (M2-001) carries only `prompt`, `outputPath`, `ticketId`, and `column` — no model config.

**The executor needs model configuration.** Two valid approaches:
1. **Constructor injection:** Pass model/maxTokens at construction time via the DI container, sourced from the column spec
2. **Add fields to `ExecutorInvocation`:** Extend with optional `model?` and `maxTokens?`

The task must specify which approach to use. Constructor injection is cleaner (avoids polluting the domain model with CLI-specific config), and aligns with the container wiring described in M2-011.

**Impact if missed:** All executor invocations would use the `claude` CLI's default model, ignoring per-column model configuration — violating system design §4.2 and making per-column model selection impossible.

### ⚠️ MEDIUM: Contradictory prompt delivery strategy

The task has an internal contradiction:
- **Step 1** says: `claude -p "<escaped prompt>"` (prompt as CLI argument)
- **Technical Notes** say: "Pass the prompt via `stdin` or a temp file if it exceeds shell argument length limits — prefer temp file approach for safety"

These are different implementation strategies. The task should pick one and specify it clearly. Key considerations:
- `execFile` bypasses the shell, so there is no shell argument length limit — but the OS still has `ARG_MAX` (~262,144 bytes on macOS). Assembled prompts with full context (ticket + prior artifacts + CONSTRAINTS.md + codebase index) will regularly exceed this.
- **Recommendation:** Use stdin piping as the primary strategy. `execFile` supports writing to the child process's stdin. This avoids both ARG_MAX limits and temp file cleanup concerns:
  ```typescript
  const child = execFile('claude', ['-p', '-'], { ... });
  child.stdin.write(prompt);
  child.stdin.end();
  ```
  If `claude -p -` (read from stdin) is not supported, fall back to the temp file approach.

### ✅ stdout capture and file write — ALIGNED

The task's steps 2–4 (capture stdout → ensure output dir → write to outputPath) match system design §4.2: "captures stdout, writes it to a temp file, validates it, then commits it to the artifact store."

### ✅ Error handling pattern — ALIGNED

The task's non-zero exit → `{ success: false, error: stderr }` matches the `ExecutorResult` interface and the system design's expectation that executor failure maps to the FAILED sub-state (§7.1).

### ✅ Timeout — ALIGNED

The 300-second timeout with kill + error return matches system design §7.4 (failure → FAILED sub-state with reason).

---

## 2. Dependencies

### ✅ M2-001 (Executor interface) — CORRECT and only listed dependency

`ClaudeCodeCliExecutor implements Executor` requires M2-001. Clean dependency. ✓

### ⚠️ Missing implicit dependency: Column spec / executor config

If model configuration is passed via constructor injection (recommended), the DI container (M2-011) must extract executor config from the loaded column spec (M2-008). This is an implicit dependency that should be documented.

### ✅ No circular dependencies

M2-001 → M2-003. M2-003 → M2-014 (smoke test). Clean DAG. ✓

---

## 3. File Path Alignment with Hexagonal Scaffold

### ✅ Target file exists as scaffolded placeholder

| Task path | Exists on disk | Content |
|-----------|---------------|---------|
| `src/infrastructure/executor/claude-cli-executor.adapter.ts` | ✓ | `// Adapter — Claude CLI (child_process) implementation of Executor port` |

### ✅ Barrel export pre-wired

`src/infrastructure/executor/index.ts` line 3: `export * from './claude-cli-executor.adapter.js'` ✓

### ✅ Layer placement is correct

Infrastructure adapter implementing a driven domain port. Correct per hexagonal architecture. ✓

### ⚠️ M2-014 smoke test path misaligned with scaffold

M2-014 specifies the smoke test at `src/executor/claude-cli-executor.smoke-test.ts`. This path does not match the hexagonal scaffold — it should be `src/infrastructure/executor/claude-cli-executor.smoke-test.ts`. This is a bug in M2-014, not M2-003, but noted here for context since M2-014 is a direct downstream consumer.


---

## 4. Consistency with Sibling Tasks

### vs M2-001 (Executor interface) — ⚠️ INCONSISTENT (interrupt gap)

- `run()` signature matches ✓
- `ExecutorResult` shape matches (success/artifactPath/error) ✓
- `usage` is `undefined` for v1 — compatible with optional `usage?` ✓
- **Gap:** `interrupt()` not mentioned — inherited from M2-001 review

### vs M2-002 (StubExecutor) — ✅ CONSISTENT

Both implement the same interface. Complementary: StubExecutor always succeeds; ClaudeCodeCliExecutor can fail. Same layer placement. ✓

### vs M2-011 (ticket run) — ✅ CONSISTENT

M2-011 receives `executor: Executor` via constructor injection and calls `executor.run()`. Container wiring determines which executor is used. M2-011's orchestration sequence (step 7–8) handles `ExecutorResult.success === false` by setting FAILED sub-state — matches M2-003's error return shape. ✓

### vs M2-014 (smoke test) — ✅ CONSISTENT (with path caveat)

M2-014 is the direct consumer of `ClaudeCodeCliExecutor`. It calls `run()` with a trivial prompt and asserts artifact written + non-empty. The acceptance criteria align. Path discrepancy noted in §3. ✓

### vs M2-001 review and M2-002 review — ✅ CONSISTENT

Both prior reviews identified the `interrupt()` gap and recommended the same fix. This review inherits and amplifies that recommendation for M2-003 specifically, where the implementation is non-trivial (child process kill).

---

## 5. Gaps That Would Block Implementation

### GAP-1: `interrupt()` method (BLOCKING)

Without `interrupt()`, the class will not compile against the updated `Executor` interface (post-M2-001 review fix). The implementer would either skip it (compilation error) or add it ad-hoc without guidance.

### GAP-2: Model/maxTokens configuration (BLOCKING for M3+)

M3 requires `ClaudeCodeCliExecutor` to invoke `claude` with the correct model. Without a configuration mechanism, all calls use the CLI default. This doesn't block M2-003 implementation itself, but blocks M3's first real agent run.

### GAP-3: No unit tests specified (NON-BLOCKING but significant)

The Definition of Done does not mention unit tests. M2-014 covers integration (happy path with real CLI), but the following error paths are only testable via unit tests with a mocked `child_process`:
- Non-zero exit code handling
- Timeout handling (without waiting 300 seconds)
- `claude` CLI not found on PATH
- Output directory creation

M2-002 (StubExecutor) specifies unit tests in its DoD. M2-003 should be consistent. Recommended test file: `src/infrastructure/executor/claude-cli-executor.adapter.test.ts`.

---

## 6. Minor Issues and Recommendations

### m1: "escaped prompt" in Step 1 is misleading

Step 1 says `claude -p "<escaped prompt>"`. Since `execFile` passes arguments as an array (not through a shell), no escaping is needed. The quotes around the prompt are not shell quotes — they are `execFile` array elements. The task text may mislead the implementer into adding unnecessary escaping logic.

### m2: No guidance on `claude` binary resolution

The Technical Notes say "claude binary must be on $PATH; if not found, return a clear error." This is correct, but the detection strategy is unspecified. Recommendation: Let `execFile` fail naturally with `ENOENT` and catch the error — simplest approach, no race condition.

### m3: Acceptance criterion 4 is redundant with `execFile` usage

AC4: "Given a prompt longer than shell limits, when using `execFile`, then no shell injection or truncation occurs." `execFile` by definition does not use a shell, so shell injection is impossible. If the prompt delivery strategy changes to stdin/temp file (per the recommendation in §1), this AC should be updated to test actual large-prompt delivery.

### m4: `artifactPath` set even on failure

Step 5 shows `{ success: false, artifactPath: invocation.outputPath, error: stderr }`. The file at that path may not exist on failure. M2-001's `ExecutorResult` says "Absolute path of the written artifact (same as outputPath on success)." Recommendation: Always set `artifactPath` to `invocation.outputPath` regardless — the caller checks `success` before reading. Current approach is acceptable; add a clarifying comment.

---

## Findings Summary

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| M1 | **Major** | `interrupt(): Promise<void>` missing — must kill child process; inherited from M2-001 review | Add `interrupt()` that stores `ChildProcess` reference and calls `.kill()`. Update task spec. |
| M2 | **Major** | Model/maxTokens CLI flags not addressed; system design §4.2 requires per-column model config | Specify constructor injection for executor config (`{ model, maxTokens }`). |
| M3 | **Medium** | Contradictory prompt delivery: Step 1 says CLI arg, Technical Notes say temp file / stdin | Pick stdin piping as primary strategy. Update Step 1. Remove "escaped prompt" phrasing. |
| G1 | **Medium** | No unit tests in Definition of Done; error paths untestable via smoke test alone | Add unit test requirement with mocked `child_process`. Test path: `src/infrastructure/executor/claude-cli-executor.adapter.test.ts`. |
| m1 | Minor | "escaped prompt" misleading with `execFile` (no shell, no escaping needed) | Remove "escaped" from Step 1 |
| m2 | Minor | `claude` binary detection strategy unspecified | Catch `ENOENT` from `execFile` — simplest approach |
| m3 | Minor | AC4 tests `execFile` behaviour, not implementation logic | Rewrite AC4 to test large-prompt delivery via stdin/temp file |
| m4 | Minor | `artifactPath` set on failure — file may not exist | Add clarifying comment; current approach is acceptable |
| — | Info | File path `src/infrastructure/executor/claude-cli-executor.adapter.ts` matches scaffold | No action needed |
| — | Info | Barrel export in `infrastructure/executor/index.ts` pre-wired | No action needed |
| — | Info | M2-014 smoke test path should be `src/infrastructure/executor/` not `src/executor/` (M2-014 bug) | Fix in M2-014 review |
| — | Info | `usage` left `undefined` for v1 — compatible with M2-001's optional `usage?` | No action needed |

---

## Recommended Task Amendments

### 1. Add `interrupt()` to the implementation spec

```typescript
export class ClaudeCodeCliExecutor implements Executor {
  private runningProcess: ChildProcess | null = null;

  async run(invocation: ExecutorInvocation): Promise<ExecutorResult> {
    // ... spawn child, store in this.runningProcess
    // ... on completion/error/timeout, set this.runningProcess = null
  }

  async interrupt(): Promise<void> {
    if (this.runningProcess) {
      this.runningProcess.kill('SIGTERM');
      this.runningProcess = null;
    }
  }
}
```

### 2. Add constructor config for model selection

```typescript
export interface ClaudeCliExecutorConfig {
  model?: string;      // e.g. 'claude-opus-4-6' → --model flag
  maxTokens?: number;  // e.g. 8000 → --max-tokens flag
  timeoutMs?: number;  // default 300_000
}

export class ClaudeCodeCliExecutor implements Executor {
  constructor(private readonly config: ClaudeCliExecutorConfig = {}) {}
}
```

### 3. Add unit test requirement to Definition of Done

```
- [ ] Unit tests (`src/infrastructure/executor/claude-cli-executor.adapter.test.ts`):
      non-zero exit returns { success: false }, timeout kills process,
      ENOENT returns { success: false, error: 'claude CLI not found on PATH' },
      output directory created if missing
```

---

## Verdict

**Approve with required changes:**

1. **Add `interrupt()`** — store `ChildProcess` reference, kill on interrupt. Without this, the class won't compile against the updated `Executor` interface.
2. **Specify model/maxTokens configuration** — constructor injection recommended. Without this, M3's first real agent run cannot select the correct model.
3. **Resolve prompt delivery strategy** — pick stdin piping or temp file; remove contradictory CLI-arg approach from Step 1.
4. **Add unit tests to Definition of Done** — error paths are not covered by M2-014's smoke test.

After these amendments, the task is implementation-ready. File paths, layer placement, dependency chain, and consistency with M2-001/M2-002 are all correct.
