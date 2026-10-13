# Task: Implement `ClaudeCodeCliExecutor`

**Milestone:** M2 — Dogfood Harness
**Agent:** typescript-pro
**Method:** Manual (last manual milestone)

## Context
The real executor that shells out to the `claude` CLI with the assembled prompt, captures stdout, and writes the artifact to disk. This is the primary LLM integration point for v1. Must be smoke-tested independently (M2-014) before M3 depends on it. Requires M2-001 (Executor interface).

## What needs to be done
Implement in `src/infrastructure/executor/claude-cli-executor.adapter.ts`:

```typescript
export interface ClaudeCliExecutorConfig {
  model?: string;      // e.g. 'claude-opus-4-6' → passed as --model flag
  maxTokens?: number;  // e.g. 8000 → passed as --max-tokens flag
  timeoutMs?: number;  // default 300_000
}

export class ClaudeCodeCliExecutor implements Executor {
  private runningProcess: ChildProcess | null = null;

  constructor(private readonly config: ClaudeCliExecutorConfig = {}) {}

  async run(invocation: ExecutorInvocation): Promise<ExecutorResult>
  async interrupt(): Promise<void>
}
```

Implementation:
1. Build CLI args array: `['--print', '-']` plus optional `['--model', config.model]` and `['--max-tokens', String(config.maxTokens)]` when set. The `-` flag reads the prompt from stdin. Spawn using `node:child_process` `execFile` (not `exec`) to avoid shell injection. Pipe the prompt into the child process's stdin via `child.stdin.write(prompt); child.stdin.end()`.
2. Store the spawned `ChildProcess` in `this.runningProcess` so `interrupt()` can kill it
3. Capture `stdout` as the model output
4. Ensure output directory exists (`mkdir -p` equivalent via `fs.mkdir({ recursive: true })`)
5. Write `stdout` to `invocation.outputPath` (UTF-8)
6. On non-zero exit code: return `{ success: false, artifactPath: invocation.outputPath, error: stderr }` — note: `artifactPath` is always set to `invocation.outputPath` regardless of success; the caller checks `success` before reading the file
7. On success: return `{ success: true, artifactPath: invocation.outputPath }`
   - `usage` can be `undefined` for v1 (token tracking is a future concern)
8. On completion (success, error, or timeout): set `this.runningProcess = null`
9. Set a timeout of `config.timeoutMs` (default 300_000 ms / 5 minutes) on the child process; on timeout: kill process, return `{ success: false, error: 'Executor timeout after 300s' }`
10. Implement `interrupt()`: if `this.runningProcess` is set, call `this.runningProcess.kill('SIGTERM')` and set `this.runningProcess = null`. The in-flight `run()` should detect the signal and return `{ success: false, error: 'Execution interrupted by operator' }`
11. If `execFile` fails with `ENOENT` (claude binary not found on PATH), catch the error and return `{ success: false, error: 'claude CLI not found on PATH' }` — let `execFile` fail naturally rather than pre-checking PATH

## Acceptance Criteria
- [ ] Given a valid prompt, when calling `run()`, then `claude` CLI is invoked via stdin piping and stdout is written to `outputPath`
- [ ] Given `claude` exits 0, when checking `ExecutorResult`, then `success` is `true` and file exists
- [ ] Given `claude` exits non-zero, when checking `ExecutorResult`, then `success` is `false` and `error` contains stderr
- [ ] Given a large prompt (exceeding OS `ARG_MAX`), when delivered via stdin piping, then the prompt is delivered without truncation
- [ ] Given 300s timeout exceeded, when checking result, then `success` is `false` with timeout error message
- [ ] Given `interrupt()` is called during a running invocation, when the process is killed, then `run()` returns `{ success: false, error: 'Execution interrupted by operator' }`
- [ ] Given `config.model` is set, when invoking `claude`, then `--model <model>` flag is passed
- [ ] Given `config.maxTokens` is set, when invoking `claude`, then `--max-tokens <maxTokens>` flag is passed

## Out of Scope
- Token usage parsing (not available from CLI stdout in v1)
- Retry logic (v2 concern)
- API-based executor (swap via executor abstraction if CLI changes)

## Technical Notes / Hints
- Use `node:child_process` `execFile` (not `exec`) to avoid shell injection
- Deliver the prompt via stdin piping: spawn with `['-p', '-']` and write the prompt to `child.stdin`. This avoids both OS `ARG_MAX` limits and temp file cleanup concerns
- If `claude -p -` (read from stdin) is not supported by the CLI version in use, fall back to writing a temp file and passing its path
- `claude` binary must be on `$PATH`; if not found, `execFile` will throw `ENOENT` — catch it and return `{ success: false, error: 'claude CLI not found on PATH' }`
- Model and max_tokens are injected via `ClaudeCliExecutorConfig` at construction time (sourced from column spec by the DI container in M2-011)

## Dependencies
- M2-001: `Executor` interface

## Layer Mapping
```
Infrastructure:  src/infrastructure/executor/claude-cli-executor.adapter.ts  — ClaudeCodeCliExecutor adapter
Domain port:     src/domain/ports/driven/executor.port.ts                    — Executor interface
```

## Definition of Done
- [ ] `ClaudeCodeCliExecutor` implements `Executor` interface (including `interrupt()`)
- [ ] `interrupt()` kills the running child process via `SIGTERM`
- [ ] Constructor accepts `ClaudeCliExecutorConfig` for model/maxTokens/timeoutMs
- [ ] Prompt delivered via stdin piping (not CLI argument)
- [ ] Non-zero exit handled gracefully (no thrown exception)
- [ ] Timeout handled without hanging process
- [ ] `ENOENT` from `execFile` caught and returned as `{ success: false, error: 'claude CLI not found on PATH' }`
- [ ] Unit tests (`src/infrastructure/executor/claude-cli-executor.adapter.test.ts`): non-zero exit returns `{ success: false }`, timeout kills process, ENOENT returns `{ success: false, error: 'claude CLI not found on PATH' }`, output directory created if missing, `interrupt()` kills running process
- [ ] Smoke test (M2-014) passes against real `claude` CLI
- [ ] Code reviewed and approved
