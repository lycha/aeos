# Task: Run `ClaudeCodeCliExecutor` Smoke Test

**Milestone:** M2 — Dogfood Harness
**Agent:** tdd-orchestrator
**Method:** Manual (last manual milestone)

## Context
Validates the real `ClaudeCodeCliExecutor` end-to-end before M3 depends on it. Without this smoke test, a subtle executor bug (wrong path, wrong CLI flag, encoding issue) will only surface mid-M3 after expensive debugging. This is an integration test — it makes a real `claude` CLI call.

## What needs to be done
Create `src/executor/claude-cli-executor.smoke-test.ts` (excluded from `npm test` — runs via explicit script):

The smoke test must verify:
1. **Invocation:** Call `ClaudeCodeCliExecutor.run()` with prompt: `"Write one sentence about software engineering."`
2. **Artifact written:** The output file exists at the specified path
3. **Non-empty output:** `artifactPath` file content length > 0
4. **Valid text:** Output does not start with `ERROR:` and is valid UTF-8
5. **Structured git commit:** Call `gitCommit()` with the artifact and verify a commit is produced in a temp `.git` repo

Add to `package.json`:
```json
"smoke-test": "npx tsx src/executor/claude-cli-executor.smoke-test.ts"
```

The smoke test should print clearly on pass:
```
✓ ClaudeCodeCliExecutor: artifact written (123 bytes)
✓ ClaudeCodeCliExecutor: output is non-empty valid text
✓ gitCommit: commit produced in artifact repo
All smoke tests passed.
```
And exit with code 0.

## Acceptance Criteria
- [ ] Given `claude` CLI on PATH, when running `npm run smoke-test`, then exit code is 0 and all 3 checks print ✓
- [ ] Given the artifact file, when reading it, then content is non-empty valid text (a sentence about software engineering)
- [ ] Given the temp git repo after `gitCommit()`, when running `git log --oneline`, then exactly one commit appears
- [ ] Given `claude` NOT on PATH, when running the smoke test, then it exits with code 1 and prints: `✗ claude CLI not found on PATH`

## Out of Scope
- Running this test in CI (it requires a live `claude` CLI and credentials — not appropriate for automated CI)
- Testing error paths of `ClaudeCodeCliExecutor` (covered in M2-003 unit tests)

## Technical Notes / Hints
- Use `tsx` for running TypeScript directly: `npm install -D tsx`
- The smoke test is not a Vitest test file — it is a standalone script
- Use a `tmp` directory under `os.tmpdir()` for all file I/O; clean up after the test completes

## Dependencies
- M2-003: `ClaudeCodeCliExecutor` implemented
- M1-014: `gitCommit()` helper
- `claude` CLI installed and authenticated on the development machine

## Definition of Done
- [ ] Smoke test script exists at `src/executor/claude-cli-executor.smoke-test.ts`
- [ ] `npm run smoke-test` exits 0 on a machine with `claude` CLI
- [ ] All 3 assertions print ✓
- [ ] Smoke test excluded from `npm test` (not in Vitest `include` glob)
- [ ] Code reviewed and approved
