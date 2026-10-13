# Task: Define `Executor` TypeScript Interface

**Milestone:** M2 — Dogfood Harness
**Agent:** typescript-pro
**Method:** Manual (last manual milestone)

## Context
The Executor is the abstraction boundary between the orchestrator and whatever runs the LLM call. Defining the interface first lets `StubExecutor` and `ClaudeCodeCliExecutor` be built independently and swapped without changing the orchestrator. Required before M2-002 and M2-003.

## What needs to be done
These types are already scaffolded across the domain layer. Implement them in their respective files:
- `ExecutorInvocation` → `src/domain/model/executor-invocation.ts`
- `ExecutorResult` → `src/domain/model/executor-result.ts`
- `Executor` port → `src/domain/ports/driven/executor.port.ts`

Definitions:

```typescript
export interface ExecutorInvocation {
  /** Fully assembled prompt string to send to the model */
  prompt: string;
  /** Absolute path where the output artifact should be written */
  outputPath: string;
  /** Ticket ID for logging/cost attribution */
  ticketId: string;
  /** Column this invocation belongs to */
  column: Column;
}

export interface ExecutorResult {
  /** Whether the executor completed without error */
  success: boolean;
  /** Absolute path of the written artifact (same as outputPath on success) */
  artifactPath: string;
  /** Token usage if available from the model API */
  usage?: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  /** Error message if success is false */
  error?: string;
}

export interface Executor {
  /** Execute a prompt and write the artifact to the specified output path. */
  run(invocation: ExecutorInvocation): Promise<ExecutorResult>;

  /**
   * Interrupt a running execution. Kills any in-flight process.
   * No-op if nothing is running. Used by `aeos ticket interrupt`.
   */
  interrupt(): Promise<void>;
}
```

No implementation in this file — interface only.

## Acceptance Criteria
- [ ] Given `src/domain/ports/driven/executor.port.ts`, when importing `Executor`, then it is a TypeScript interface (not a class)
- [ ] Given an object implementing `Executor`, when TypeScript checks it, then it must have a `run` method matching the signature
- [ ] Given an object implementing `Executor`, when TypeScript checks it, then it must have an `interrupt` method returning `Promise<void>`
- [ ] Given `ExecutorResult` with `success: false`, when accessing `error`, then TypeScript allows it (it is optional)
- [ ] Given `ExecutorInvocation`, when inspecting types, then `column` is typed as `Column` (from enums)

## Design Notes

### `AgentInvocation` → `ExecutorInvocation` rename
The system design (§4.1) uses the name `AgentInvocation`. This task renames it to `ExecutorInvocation` because the invocation is sent to the executor, not to an abstract agent. The agent is a configuration; the executor is the runtime component. This aligns the name with the hexagonal port it accompanies.

### Field evolution from system design (`exitCode?`/`stderr?` → `usage?`/`error?`)
The system design (§4.1) defines `exitCode?` and `stderr?` on the result type. This task deliberately replaces them:
- `exitCode?` is dropped — it is an implementation detail of CLI-based executors; API-based executors have no exit code. Keeping it would leak adapter concerns into the domain port.
- `stderr?` is replaced by `error?` — a more general, executor-agnostic error string.
- `usage?` (`inputTokens`, `outputTokens`, `costUsd`) is added to support cost tracking (PRD FR-30, FR-31) and maps directly to cost records (system design §9.1).

## Out of Scope
- Any implementation (StubExecutor is M2-002, ClaudeCodeCliExecutor is M2-003)

## Dependencies
- M1-007: `Column` enum

## Layer Mapping
```
Domain model:  src/domain/model/executor-invocation.ts   — ExecutorInvocation value object
Domain model:  src/domain/model/executor-result.ts       — ExecutorResult value object
Domain port:   src/domain/ports/driven/executor.port.ts  — Executor interface
Barrel:        src/domain/model/index.ts + src/domain/ports/driven/index.ts
```

## Definition of Done
- [ ] All three files exist and compile with `tsc --noEmit`
- [ ] JSDoc comments on all fields
- [ ] Code reviewed and approved
