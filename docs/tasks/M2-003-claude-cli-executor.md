# Task: Implement `ClaudeCodeCliExecutor`

**Milestone:** M2 — Dogfood Harness
**Agent:** typescript-pro
**Method:** Manual (last manual milestone)

## Context
The real executor that shells out to the `claude` CLI with the assembled prompt, captures stdout, and writes the artifact to disk. This is the primary LLM integration point for v1. Must be smoke-tested independently (M2-014) before M3 depends on it. Requires M2-001 (Executor interface).

## What needs to be done
Implement in `src/infrastructure/executor/claude-cli-executor.adapter.ts`:

```typescript
export class ClaudeCodeCliExecutor implements Executor {
  async run(invocation: ExecutorInvocation): Promise<ExecutorResult>
}
```

Implementation:
1. Shell out: `claude -p "<escaped prompt>"` using `node:child_process` `execFile` (not `exec`) to avoid shell injection
2. Capture `stdout` as the model output
3. Ensure output directory exists
4. Write `stdout` to `invocation.outputPath` (UTF-8)
5. On non-zero exit code: return `{ success: false, artifactPath: invocation.outputPath, error: stderr }`
6. On success: return `{ success: true, artifactPath: invocation.outputPath }`
   - `usage` can be `undefined` for v1 (token tracking is a future concern)
7. Set a timeout of 300 seconds (5 minutes) on the child process; on timeout: kill process, return `{ success: false, error: 'Executor timeout after 300s' }`

## Acceptance Criteria
- [ ] Given a valid prompt, when calling `run()`, then `claude` CLI is invoked and stdout is written to `outputPath`
- [ ] Given `claude` exits 0, when checking `ExecutorResult`, then `success` is `true` and file exists
- [ ] Given `claude` exits non-zero, when checking `ExecutorResult`, then `success` is `false` and `error` contains stderr
- [ ] Given a prompt longer than shell limits, when using `execFile`, then no shell injection or truncation occurs
- [ ] Given 300s timeout exceeded, when checking result, then `success` is `false` with timeout error message

## Out of Scope
- Token usage parsing (not available from CLI stdout in v1)
- Retry logic (v2 concern)
- API-based executor (swap via executor abstraction if CLI changes)

## Technical Notes / Hints
- Use `util.promisify(execFile)` or the native `Promise`-based child process APIs
- Pass the prompt via `stdin` or a temp file if it exceeds shell argument length limits — prefer temp file approach for safety
- `claude` binary must be on `$PATH`; if not found, return a clear `{ success: false, error: 'claude CLI not found on PATH' }`

## Dependencies
- M2-001: `Executor` interface

## Layer Mapping
```
Infrastructure:  src/infrastructure/executor/claude-cli-executor.adapter.ts  — ClaudeCodeCliExecutor adapter
Domain port:     src/domain/ports/driven/executor.port.ts                    — Executor interface
```

## Definition of Done
- [ ] `ClaudeCodeCliExecutor` implements `Executor` interface
- [ ] Non-zero exit handled gracefully (no thrown exception)
- [ ] Timeout handled without hanging process
- [ ] Smoke test (M2-014) passes against real `claude` CLI
- [ ] Code reviewed and approved
