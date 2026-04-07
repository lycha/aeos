# Task: Run `ClaudeCodeCliExecutor` Smoke Test

**Milestone:** M2 — Dogfood Harness
**Agent:** tdd-orchestrator
**Method:** Manual (last manual milestone)

## Context
Validates the real `ClaudeCodeCliExecutor` end-to-end before M3 depends on it. Without this smoke test, a subtle executor bug (wrong path, wrong CLI flag, encoding issue) will only surface mid-M3 after expensive debugging. This is an integration test — it makes a real `claude` CLI call.

## What needs to be done
Create `src/infrastructure/executor/claude-cli-executor.smoke-test.ts` (excluded from `npm test` — runs via explicit script):

### Prerequisites
- `tsx` must be installed as a dev dependency: `npm install -D tsx`

The smoke test must construct a proper `ExecutorInvocation` and verify the result:

```typescript
const invocation: ExecutorInvocation = {
  prompt: 'Write one sentence about software engineering.',
  outputPath: path.join(tmpDir, 'smoke-test-output.md'),
  ticketId: 'SMOKE-1',
  column: 'SMOKE_TEST',
};
const result = await executor.run(invocation);
```

Verification points:
1. **Artifact written:** The output file exists at `invocation.outputPath` and `result.artifactPath` matches
2. **Non-empty valid text:** `artifactPath` file content length > 0, is valid UTF-8, and does not start with `ERROR:`
3. **Structured git commit:** Instantiate `SimpleGitGateway`, call `init(tmpDir)` then `commitFiles(tmpDir, [artifactPath], message)` and verify a commit is produced via `git log --oneline` in the temp repo

### Temp directory cleanup
Create a temp directory under `os.tmpdir()` at the start. After the test completes (pass or fail), remove the temp directory in a `finally` block. This is mandatory — leftover temp directories with git repos accumulate over repeated runs.

### Script-level timeout
Wrap the entire smoke test in a top-level timeout of 60 seconds. If the `claude` CLI hangs or the network is slow, the script must exit with code 1 and print: `✗ Smoke test timed out after 60s`.

Add to `package.json`:
```json
"smoke-test": "npx tsx src/infrastructure/executor/claude-cli-executor.smoke-test.ts"
```

The smoke test should print clearly on pass:
```
✓ ClaudeCodeCliExecutor: artifact written (123 bytes)
✓ ClaudeCodeCliExecutor: output is non-empty valid text
✓ SimpleGitGateway.commitFiles: commit produced in artifact repo
All smoke tests passed.
```
And exit with code 0.

## Acceptance Criteria
- [ ] Given `claude` CLI on PATH, when running `npm run smoke-test`, then exit code is 0 and all 3 checks print ✓
- [ ] Given the artifact file, when reading it, then content is non-empty valid text (a sentence about software engineering)
- [ ] Given the temp git repo after `SimpleGitGateway.commitFiles()`, when running `git log --oneline`, then exactly one commit appears
- [ ] Given `claude` NOT on PATH, when running the smoke test, then it exits with code 1 and prints `ExecutorResult.error` containing `claude CLI not found on PATH` (validates M2-003's error handling, not a redundant PATH check)
- [ ] Temp directory is cleaned up after the test completes (pass or fail)

## Out of Scope
- Running this test in CI (it requires a live `claude` CLI and credentials — not appropriate for automated CI)
- Testing error paths of `ClaudeCodeCliExecutor` (covered in M2-003 unit tests)

## Technical Notes / Hints
- The smoke test is not a Vitest test file — it is a standalone script
- Use a `tmp` directory under `os.tmpdir()` for all file I/O; clean up in a `finally` block after the test completes
- The 60-second timeout guards against the `claude` CLI hanging indefinitely

## Dependencies
- M2-003: `ClaudeCodeCliExecutor` implemented
- M2-001: `ExecutorInvocation` / `ExecutorResult` types
- M1-014: `SimpleGitGateway.commitFiles()` (implements `GitGateway` port)
- `claude` CLI installed and authenticated on the development machine

## Definition of Done
- [ ] Smoke test script exists at `src/infrastructure/executor/claude-cli-executor.smoke-test.ts`
- [ ] `npm run smoke-test` exits 0 on a machine with `claude` CLI
- [ ] All 3 assertions print ✓
- [ ] Smoke test excluded from `npm test` (not in Vitest `include` glob)
- [ ] Temp directory cleaned up after test (pass or fail)
- [ ] Code reviewed and approved
