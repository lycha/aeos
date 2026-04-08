# Task: Implement `StubExecutor`

**Milestone:** M2 — Dogfood Harness
**Agent:** typescript-pro
**Method:** Manual (last manual milestone)

## Context
A no-op executor that writes a placeholder markdown artifact to the output path without making any real LLM call. Used to validate state machine flow end-to-end before the real executor is needed. The stub is the only executor used during M2's full pipeline smoke test. Requires M2-001 (Executor interface).

## What needs to be done
Implement in `src/infrastructure/executor/stub-executor.adapter.ts`:

```typescript
export class StubExecutor implements Executor {
  async run(invocation: ExecutorInvocation): Promise<ExecutorResult>
  async interrupt(): Promise<void>
}
```

Implementation:
1. Write a placeholder file to `invocation.outputPath`:
   ```markdown
   # STUB OUTPUT
   **Ticket:** <ticketId>
   **Column:** <column>
   **Generated:** <ISO timestamp>

   This is a stub artifact produced by StubExecutor for pipeline testing.
   All structural checks should pass on this output.
   ```
2. Return:
   ```typescript
   {
     success: true,
     artifactPath: invocation.outputPath,
     usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
   }
   ```
3. Ensure the output directory exists before writing (`await fs.mkdir(path.dirname(invocation.outputPath), { recursive: true })`)
4. `interrupt()` is a no-op — `StubExecutor` completes synchronously so there is nothing to cancel:
   ```typescript
   async interrupt(): Promise<void> {
     // StubExecutor completes synchronously; nothing to interrupt.
   }
   ```

## Acceptance Criteria
- [ ] Given a valid `ExecutorInvocation`, when calling `StubExecutor.run()`, then the output file exists at `outputPath`
- [ ] Given the written file, when inspecting contents, then it contains the ticket ID and column
- [ ] Given `ExecutorResult`, when checking `success`, then it is `true`
- [ ] Given `usage`, when inspecting, then all token counts are 0
- [ ] Given a path whose parent directory does not exist, when calling `run()`, then the directory is created and file is written without error

## Out of Scope
- Any actual LLM interaction
- Realistic content generation

## Technical Notes / Hints
- Use `node:fs/promises` for async file writing: `await fs.mkdir(dir, { recursive: true })` then `await fs.writeFile(path, content, 'utf8')`
- `Column` values are string literals (e.g., `'PRODUCT_SCOPING'`) and can be interpolated directly into the placeholder template via `${invocation.column}`

## Dependencies
- M2-001: `Executor` interface

## Layer Mapping
```
Infrastructure:  src/infrastructure/executor/stub-executor.adapter.ts  — StubExecutor adapter
Domain port:     src/domain/ports/driven/executor.port.ts              — Executor interface
```

## Definition of Done
- [ ] `StubExecutor` implements `Executor` interface (TypeScript enforced), including `interrupt()`
- [ ] File is written correctly with placeholder content
- [ ] Unit tests (`src/infrastructure/executor/stub-executor.adapter.test.ts`): file written, content includes ticket ID and column, missing dir created
- [ ] Code reviewed and approved
