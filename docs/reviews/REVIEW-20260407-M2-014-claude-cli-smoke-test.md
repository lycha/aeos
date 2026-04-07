# Deep Review: M2-014 — Run `ClaudeCodeCliExecutor` Smoke Test

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Task specification — `docs/tasks/M2-014-claude-cli-smoke-test.md`
**Cross-referenced against:** System design (03-system-design.md §4.1–§4.2, §3.3), PRD (02-prd.md), Action plan (05-action-plan-v1.md §M2), sibling tasks M2-001, M2-003, M1-014, M2-011, existing scaffold in `src/`, prior reviews (M2-003, M1-014, M2-013)

---

## Overall Assessment

The task correctly identifies the need for an end-to-end integration smoke test of `ClaudeCodeCliExecutor` before M3 depends on it. The rationale is sound — catching executor bugs (wrong path, wrong CLI flag, encoding issues) before they surface mid-M3 is a clear risk mitigation. The acceptance criteria are testable and the scope is appropriately narrow.

However, the task has **one major issue**, **two medium issues**, and **several minor observations**. The major issue is a file path that does not match the hexagonal scaffold. The medium issues involve an incorrect dependency reference and a mismatch between the task's `gitCommit()` call and the actual `GitGateway` port interface.

**Verdict:** Approve with required changes.

---

## 1. Correctness vs System Design

### ✅ Executor contract — ALIGNED

The smoke test calls `ClaudeCodeCliExecutor.run()` with a prompt and asserts artifact output. This aligns with system design §4.1 (`Executor.run(invocation): Promise<ExecutorResult>`) and §4.2 (Claude Code CLI captures stdout, writes to file). ✓

### ✅ Integration test rationale — ALIGNED with action plan

Action plan §M2 explicitly lists: "Run a trivial prompt through `ClaudeCodeCliExecutor` directly... and assert: (a) artifact written to correct path, (b) output is non-empty valid text, (c) structured git commit produced." The task faithfully expands this into 5 verification points. ✓

### ✅ Exclusion from `npm test` — CORRECT

The task correctly excludes the smoke test from Vitest's `include` glob. This is an integration test requiring a live `claude` CLI — not appropriate for automated CI. ✓

### ✅ Non-empty valid text check — ALIGNED

Verification points 3–4 (non-empty content, valid UTF-8, no `ERROR:` prefix) match the system design's output validation concept (§7.5: "File is non-empty"). ✓

---

## 2. File Path Alignment with Hexagonal Scaffold

### ⚠️ MAJOR (GAP-1): Smoke test file path misaligned with hexagonal scaffold

**Task says:** `src/executor/claude-cli-executor.smoke-test.ts`
**Hexagonal scaffold:** `src/infrastructure/executor/` (where `claude-cli-executor.adapter.ts` lives)

The path `src/executor/` does not exist in the scaffold. The executor lives at `src/infrastructure/executor/`. The smoke test must be co-located with the adapter it tests:

```
src/infrastructure/executor/claude-cli-executor.smoke-test.ts
```

This was already flagged as an info item in the M2-003 review (REVIEW-20260407-M2-003, §3: "M2-014 smoke test path misaligned with scaffold"). The M2-003 review noted: "This is a bug in M2-014, not M2-003."

**Impact:** The `package.json` script path would also be wrong:
- ❌ `"smoke-test": "npx tsx src/executor/claude-cli-executor.smoke-test.ts"`
- ✅ `"smoke-test": "npx tsx src/infrastructure/executor/claude-cli-executor.smoke-test.ts"`

### ✅ No scaffold placeholder exists yet

Unlike other M2 tasks, no placeholder file exists at either path. The smoke test is a new file — no conflict. ✓

---

## 3. Dependencies

### ✅ M2-003 (`ClaudeCodeCliExecutor`) — CORRECT

The smoke test is the direct consumer of M2-003. The dependency is explicit and correct. ✓

### ⚠️ MEDIUM (GAP-2): Dependency lists `M1-014: gitCommit() helper` — name and API mismatch

The task lists:
> M1-014: `gitCommit()` helper

**Problems:**
1. **Name mismatch:** M1-014 implements `GitGateway.commitFiles()`, not a free function `gitCommit()`. The M1-014 review (REVIEW-20260407-M1-014, §2) confirmed the implementation diverged: the codebase uses a class-based `GitGateway` port with `commitFiles(dir, files, message)`, not a free function.
2. **Smoke test step 5** says: "Call `gitCommit()` with the artifact and verify a commit is produced in a temp `.git` repo." This should be `GitGateway.commitFiles()` (or the `SimpleGitGateway` adapter).

**Actual interface** (from `src/domain/ports/driven/git-gateway.port.ts`):
```typescript
interface GitGateway {
  init(dir: string): void;
  commit(dir: string, message: string): void;
  commitFiles(dir: string, files: string[], message: string): void;
}
```

**Impact:** An implementer following the task literally would look for a `gitCommit()` function that doesn't exist. They would need to discover the `GitGateway` port and `SimpleGitGateway` adapter independently.

**Recommendation:** Update dependency reference to: "M1-014: `SimpleGitGateway.commitFiles()` (implements `GitGateway` port)". Update step 5 to: "Instantiate `SimpleGitGateway`, call `commitFiles(tmpDir, [artifactPath], message)` and verify a commit is produced."

### ✅ `claude` CLI dependency — CORRECT

Correctly listed as a runtime dependency. AC4 covers the `claude` not on PATH scenario. ✓

### ✅ No circular dependencies

M2-001 → M2-003 → M2-014. Clean DAG. ✓

---

## 4. Consistency with Sibling Tasks

### vs M2-003 (ClaudeCodeCliExecutor) — ⚠️ MEDIUM (GAP-3): `run()` invocation shape unclear

M2-003 (as amended by its review) defines:
```typescript
export class ClaudeCodeCliExecutor implements Executor {
  constructor(private readonly config: ClaudeCliExecutorConfig = {}) {}
  async run(invocation: ExecutorInvocation): Promise<ExecutorResult>
  async interrupt(): Promise<void>
}
```

The smoke test's step 1 says: "Call `ClaudeCodeCliExecutor.run()` with prompt: `'Write one sentence...'`"

But `run()` takes an `ExecutorInvocation`, not a raw prompt string. The `ExecutorInvocation` type (M2-001) requires at minimum `prompt` and `outputPath`. The smoke test must construct a proper invocation object:

```typescript
const result = await executor.run({
  prompt: 'Write one sentence about software engineering.',
  outputPath: path.join(tmpDir, 'smoke-test-output.md'),
  ticketId: 'SMOKE-1',
  column: 'SMOKE_TEST',
});
```

**Assessment:** This is a specification precision issue, not a functional gap. An implementer would figure it out. But specifying the invocation shape would eliminate ambiguity.

### vs M2-001 (Executor interface) — ✅ CONSISTENT

The smoke test validates the real adapter against the `Executor` interface contract. ✓

### vs M2-002 (StubExecutor) — ✅ CONSISTENT

StubExecutor tests the state machine flow; smoke test tests real CLI execution. Complementary. ✓


### vs M2-011 (ticket run) — ✅ NO CONFLICT

M2-011 is the orchestration command that uses the executor indirectly. The smoke test validates the executor independently — correct separation. ✓

### vs M2-013 (reviewer-agent.yaml) — ✅ NO DEPENDENCY

The smoke test does not involve the reviewer. No relationship expected. ✓

### vs M1-014 review — ⚠️ INCONSISTENT (see GAP-2)

The M1-014 review confirmed the implementation uses `GitGateway.commitFiles()`, not `gitCommit()`. The smoke test task has not been updated to reflect this. ✓ (finding documented above)

---

## 5. Gaps That Would Block Implementation

### GAP-1: File path wrong (BLOCKING)

`src/executor/` does not exist. The implementer would either create a non-standard directory or have to discover the correct path independently. The `package.json` script would also point to a non-existent file.

### GAP-2: `gitCommit()` does not exist (BLOCKING)

Step 5 references a function that was never implemented. The actual API is `SimpleGitGateway.commitFiles(dir, files, message)`. An implementer would waste time searching for `gitCommit()` before finding the correct class.

### GAP-3: `run()` invocation shape unspecified (NON-BLOCKING but imprecise)

The implementer must construct an `ExecutorInvocation` object, not pass a raw string. The task should specify the invocation shape to eliminate ambiguity.

---

## 6. Minor Issues and Recommendations

### m1: Verification count inconsistency

The task lists 5 verification points (numbered 1–5) but the printed output shows only 3 check marks. AC says "all 3 checks print ✓". The DoD says "All 3 assertions print ✓". This implies verification points 1–4 are collapsed into 2 checks (artifact written + valid text) plus 1 check (git commit). The task should either list 3 verification points matching the output, or show 5 check marks matching the verification list.

### m2: `tsx` installation not in task scope

The task says "Use `tsx` for running TypeScript directly: `npm install -D tsx`" but does not include `tsx` installation as a step. The task should either include a step to install `tsx` or note it as a prerequisite. Currently `tsx` is not in `package.json` `devDependencies`.

### m3: Cleanup not specified as mandatory

The Technical Notes say "Use a `tmp` directory under `os.tmpdir()` for all file I/O; clean up after the test completes." This should be an explicit step and an AC, not a hint — leftover temp directories with git repos can accumulate over repeated runs.

### m4: No timeout for the smoke test itself

The smoke test invokes a real `claude` CLI call. If the CLI hangs or the network is slow, the smoke test will hang indefinitely. Consider adding a top-level timeout (e.g., 60 seconds) for the entire smoke test script.

### m5: AC4 error message format not aligned with M2-003

AC4 says: "prints: `✗ claude CLI not found on PATH`"
M2-003 (as amended) says: executor returns `{ success: false, error: 'claude CLI not found on PATH' }`

The smoke test should check `ExecutorResult.error` for the expected message rather than re-detecting PATH availability. This ensures the smoke test validates M2-003's actual error handling, not a redundant PATH check.

---

## Findings Summary

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| GAP-1 | **Major** | File path `src/executor/` does not exist — should be `src/infrastructure/executor/` | Fix path in task spec and `package.json` script |
| GAP-2 | **Medium** | `gitCommit()` does not exist — actual API is `SimpleGitGateway.commitFiles()` | Update dependency reference and step 5 to use `GitGateway` port |
| GAP-3 | **Medium** | `run()` invocation shape unspecified — `ExecutorInvocation` required, not raw string | Specify full invocation object construction in step 1 |
| m1 | Minor | 5 verification points but "3 checks" in output/ACs — count mismatch | Reconcile: either 3 points or 5 check marks |
| m2 | Minor | `tsx` dependency not installed — not in `package.json` | Add `tsx` installation as a prerequisite or step |
| m3 | Minor | Temp directory cleanup is a hint, not a requirement | Make cleanup an explicit step |
| m4 | Minor | No top-level timeout for the smoke test script | Add 60s script-level timeout |
| m5 | Minor | AC4 error message check should validate M2-003's `ExecutorResult.error`, not re-detect PATH | Check `result.error` instead of independent PATH detection |
| — | Info | Correctly excluded from `npm test` / CI | No action needed |
| — | Info | Rationale aligns with action plan §M2 critical path | No action needed |

---

## Recommended Task Amendments

### 1. Fix file path

```diff
- Create `src/executor/claude-cli-executor.smoke-test.ts`
+ Create `src/infrastructure/executor/claude-cli-executor.smoke-test.ts`
```

Update `package.json` script:
```diff
- "smoke-test": "npx tsx src/executor/claude-cli-executor.smoke-test.ts"
+ "smoke-test": "npx tsx src/infrastructure/executor/claude-cli-executor.smoke-test.ts"
```

### 2. Fix `gitCommit()` reference to `GitGateway.commitFiles()`

Replace step 5:
```diff
- 5. **Structured git commit:** Call `gitCommit()` with the artifact and
-    verify a commit is produced in a temp `.git` repo
+ 5. **Structured git commit:** Instantiate `SimpleGitGateway`, call
+    `init(tmpDir)` then `commitFiles(tmpDir, [artifactPath], message)`
+    and verify a commit is produced via `git log --oneline` in the temp repo
```

Update dependency:
```diff
- M1-014: `gitCommit()` helper
+ M1-014: `SimpleGitGateway.commitFiles()` (implements `GitGateway` port)
```

### 3. Specify `ExecutorInvocation` construction in step 1

```typescript
const invocation: ExecutorInvocation = {
  prompt: 'Write one sentence about software engineering.',
  outputPath: path.join(tmpDir, 'smoke-test-output.md'),
  ticketId: 'SMOKE-1',
  column: 'SMOKE_TEST',
};
const result = await executor.run(invocation);
```

### 4. Reconcile verification count

Either reduce to 3 verification points matching the output format:
1. Artifact written (covers invocation + file existence + non-empty)
2. Output is non-empty valid text (covers UTF-8 + no ERROR prefix)
3. Git commit produced (covers commitFiles integration)

Or expand the output to 5 check marks — one per verification point.

### 5. Update Definition of Done file path

```diff
- [ ] Smoke test script exists at `src/executor/claude-cli-executor.smoke-test.ts`
+ [ ] Smoke test script exists at `src/infrastructure/executor/claude-cli-executor.smoke-test.ts`
```

---

## Verdict

**Approve with required changes:**

1. **Fix the file path** from `src/executor/` to `src/infrastructure/executor/` — the current path does not exist in the hexagonal scaffold and would create a non-standard directory.
2. **Replace `gitCommit()` with `SimpleGitGateway.commitFiles()`** — the free function `gitCommit()` was never implemented; the codebase uses the `GitGateway` port with a class-based adapter.
3. **Specify `ExecutorInvocation` construction** — `run()` takes an invocation object, not a raw string.
4. **Reconcile verification count** — 5 verification points but "3 checks" in output/ACs.

After these amendments, the task is implementation-ready. The scope is correct, the rationale is sound, the exclusion from CI is appropriate, and the dependency chain is clean. The smoke test fills a genuine gap — without it, executor bugs would only surface during M3's first real agent run.