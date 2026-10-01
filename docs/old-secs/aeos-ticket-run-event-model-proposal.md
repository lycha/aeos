# AEOS Ticket Run Event Model Proposal

**Status:** Proposed  
**Date:** 2026-04-21

## Purpose

Define a renderer-agnostic event model for `aeos ticket run` so the CLI can evolve from a final-result command into a live experience without losing the current `TicketRunResult` contract.

## Current baseline

- `src/cli/commands/ticket-run.command.ts` prints only `Running ticket <id>…` and the final `success` / `blocked` / `failed` outcome.
- `src/domain/ports/driving/ticket-run.port.ts` returns only a final `TicketRunResult`.
- `src/application/ticket-run.use-case.ts` already has clear milestones: eligibility checks, preflight, `WORKING`, worker execution, validation, artifact commit, rubric loading, reviewer execution, `IN_REVIEW`, and `SIGNED_OFF`.
- Executor adapters already receive live `stdout` / `stderr` chunks via `child.stdout.on('data')` and `child.stderr.on('data')`, but they buffer them into `content` and only expose the final `ExecutorResult`.

## Design principles

1. **Additive, not disruptive** — keep `TicketRunResult` as the command completion contract.
2. **Stage-aware** — represent AEOS orchestration milestones separately from raw executor output.
3. **Renderer-agnostic** — the same events should support plain verbose logs, a split-pane CLI, and future dashboard/web streaming.
4. **Stable ordering** — every emitted event should have a deterministic sequence within a single run.
5. **Explicit source attribution** — raw chunks must identify whether they came from preflight, worker, or reviewer, and from `stdout` vs `stderr`.

These events should be treated as an **application/orchestration stream**, not as pure business-domain events. They describe how `aeos ticket run` executes and reports progress across use case, executor, and renderer boundaries.

## Proposed event envelope

````typescript
export interface TicketRunEventBase {
  readonly type: string;
  readonly runId: string;
  readonly projectId: string;
  readonly ticketId: string;
  readonly column: string;
  readonly phase: TicketRunPhase;
  readonly at: string;      // ISO-8601
  readonly sequence: number;
}

export type TicketRunPhase =
  | 'eligibility'
  | 'context'
  | 'preflight'
  | 'state'
  | 'worker'
  | 'validation'
  | 'artifact'
  | 'rubrics'
  | 'review-context'
  | 'reviewer'
  | 'sign-off'
  | 'complete';
````

Recommended payload shape: each concrete event extends the base envelope and adds a narrow `payload` object rather than a wide optional field bag.

## Event taxonomy

| Type | Purpose | Typical producer |
|---|---|---|
| `ticket-run.started` | Marks the start of the orchestration | `TicketRunUseCase.execute()` |
| `ticket-run.completed` | Final success summary | `TicketRunUseCase.execute()` |
| `ticket-run.failed` | Final failure summary | `TicketRunUseCase.execute()` |
| `ticket-run.blocked` | Preflight blocked summary | `TicketRunUseCase.execute()` |
| `ticket-run.interrupted` | Operator-initiated interruption summary | `TicketRunUseCase.execute()` |
| `stage.started` | Start of a named phase | Use case / preflight service |
| `stage.completed` | Successful end of a named phase | Use case / preflight service |
| `stage.failed` | Phase-level failure before final result | Use case / preflight service |
| `sub-state.changed` | Mirrors `WORKING`, `FAILED`, `IN_REVIEW`, `SIGNED_OFF`, etc. | Use case |
| `artifact.written` | Worker/review artifact persisted | Use case |
| `artifact.committed` | Artifact committed to `.aeos/.git` | Use case |
| `review.rejected` | Reviewer output concluded rejection | Use case |
| `cost.recorded` | Worker/reviewer token + cost metadata captured | Use case |
| `executor.stdout.chunk` | Raw live model/tool output | Executor adapter |
| `executor.stderr.chunk` | Raw warnings/errors/diagnostics | Executor adapter |

## Recommended concrete event shapes

### Lifecycle and stage events

````typescript
export type TicketRunLifecycleEvent =
  | (TicketRunEventBase & { type: 'ticket-run.started'; payload: { executor: string; model?: string } })
  | (TicketRunEventBase & { type: 'ticket-run.completed'; payload: { artifactPath: string; reviewPath: string } })
  | (TicketRunEventBase & { type: 'ticket-run.failed'; payload: { message: string; reviewPath?: string } })
  | (TicketRunEventBase & { type: 'ticket-run.blocked'; payload: { blockers: string[] } })
  | (TicketRunEventBase & { type: 'ticket-run.interrupted'; payload: { message: string; stage?: TicketRunPhase } })
  | (TicketRunEventBase & {
      type: 'stage.started' | 'stage.completed' | 'stage.failed';
      payload: {
        stage: TicketRunPhase;
        message: string;
        role?: 'preflight' | 'worker' | 'reviewer';
        executor?: string;
        model?: string;
        mode?: 'artifact' | 'agentic';
      };
    })
  | (TicketRunEventBase & { type: 'sub-state.changed'; payload: { from: string | null; to: string | null } });
````

The optional stage payload metadata is recommended for executor-backed stages so renderers can show accurate header/footer information even when worker and reviewer configuration differ.

A run should emit **exactly one terminal lifecycle event**: `ticket-run.completed`, `ticket-run.failed`, `ticket-run.blocked`, or `ticket-run.interrupted`.

### Artifact, review, and cost events

````typescript
export type TicketRunArtifactEvent =
  | (TicketRunEventBase & { type: 'artifact.written'; payload: { role: 'worker' | 'reviewer'; path: string } })
  | (TicketRunEventBase & { type: 'artifact.committed'; payload: { role: 'worker' | 'reviewer'; path: string; commitMessage: string } })
  | (TicketRunEventBase & { type: 'review.rejected'; payload: { reviewPath: string; reason: string } })
  | (TicketRunEventBase & { type: 'cost.recorded'; payload: { role: 'worker' | 'reviewer'; inputTokens: number; outputTokens: number; costUsd: number } });
````

### Executor chunk events

````typescript
export type ExecutorChunkEvent = TicketRunEventBase & {
  type: 'executor.stdout.chunk' | 'executor.stderr.chunk';
  payload: {
    source: 'preflight' | 'worker' | 'reviewer';
    chunk: string;
  };
};
````

Renderers should merge chunk-derived lines using the top-level `sequence` field rather than attempting to derive ordering from source-local arrival alone. In practice, this means keeping a partial-line buffer per source and emitting normalized lines in global event order.

The `sequence` field should be assigned by a **single run-scoped emitter/sequencer** in the application layer. Executors and helper services may produce raw notifications, but they should not assign their own sequence numbers before observer delivery.

## Expected sequences

### Success path

`ticket-run.started` → `stage.started(preflight)` → `stage.completed(preflight)` → `sub-state.changed(WORKING)` → `stage.started(worker)` → `executor.*.chunk`* → `stage.completed(worker)` → `stage.started(validation)` → `stage.completed(validation)` → `artifact.written(worker)` → `artifact.committed(worker)` → `stage.started(reviewer)` → `executor.*.chunk`* → `stage.completed(reviewer)` → `artifact.written(reviewer)` → `artifact.committed(reviewer)` → `sub-state.changed(IN_REVIEW)` → `stage.started(sign-off)` → `sub-state.changed(SIGNED_OFF)` → `stage.completed(sign-off)` → `ticket-run.completed`

### Blocked preflight path

`ticket-run.started` → `stage.started(preflight)` → `stage.completed(preflight)` → `ticket-run.blocked` → `sub-state.changed(BLOCKED)`

### Reviewer rejection path

`ticket-run.started` → … → `stage.started(reviewer)` → `executor.*.chunk`* → `stage.completed(reviewer)` → `artifact.written(reviewer)` → `artifact.committed(reviewer)` → `review.rejected` → `sub-state.changed(FAILED)` → `ticket-run.failed`

### Interrupted path

`ticket-run.started` → … → `stage.started(worker | reviewer)` → `executor.*.chunk`* → `ticket-run.interrupted` → `sub-state.changed(INTERRUPTED)`

Every `stage.started` should be followed by exactly one `stage.completed` or `stage.failed`. A blocked preflight or rejected review is a successful completion of that stage with a negative business outcome, not an implicit missing stage closure.

## Transport recommendation

For the first implementation, favor an **optional observer callback** over a larger cross-process event bus.

The callback should sit behind a **single run-scoped event emitter** owned by the application layer. That emitter is responsible for:

- assigning monotonically increasing `sequence` values
- stamping shared run metadata consistently
- forwarding events to the observer in the order they were accepted
- ensuring observer delivery remains a reporting concern rather than orchestration control flow

````typescript
export interface TicketRunObserver {
  onEvent?(event: TicketRunEvent): void;
}

execute(
  projectId: string,
  projectPath: string,
  ticketId: string,
  executorOverrides?: ExecutorOverrides,
  observer?: TicketRunObserver,
): Promise<TicketRunResult>;
````

At the executor layer, the least disruptive change is to pass an optional chunk hook through the invocation or as an optional second parameter so adapters can forward `stdout` / `stderr` as they arrive while still returning the final buffered `ExecutorResult`. Those chunk callbacks should feed the run-scoped emitter rather than bypassing it.

Observer delivery should be documented as **in-process, best-effort, and non-durable** for the first cut. If an observer throws or is unavailable, the run should still complete and return its normal `TicketRunResult`; observer failures should be isolated from orchestration outcome.

## Notes on naming and semantics

- Use `SIGNED_OFF` in emitted payloads to match the current enum spelling in the codebase, even if the UI renders `SIGNED-OFF` for readability.
- Keep `IN_REVIEW` as a sub-state change event, but do not use it as the sole signal that reviewer execution has started; that should remain an explicit `stage.started(reviewer)` event.
- Include `runId` from the outset so future dashboard/web subscribers can correlate reconnects, retries, and terminal redraws.
- Preflight chunk output should be emitted the same way as worker/reviewer chunk output so the default live renderer can show it in the raw pane when present.
- For compatibility with the current `TicketRunResult`, an operator interruption can emit `ticket-run.interrupted` on the event stream while the command still returns a `failed` result with an interruption-specific message until or unless the completion contract is widened later.
- For v1, `runId + sequence` should be treated as sufficient for ephemeral live streaming within a single run, not as a durable replay or deduplication contract.

## Open questions

1. Should cost events be emitted only after `recordCost()`, or should the renderer derive “pending cost” UI from stage completion alone?
2. Should chunk events preserve raw ANSI codes or normalize them before emission?
3. If non-CLI subscribers later require reconnect/replay, should the stream add a durable `eventId` or cursor model beyond `runId + sequence`?

## See also

- [AEOS Ticket Run Terminal Layout Spec](aeos-ticket-run-terminal-layout-spec.md)
- [AEOS Ticket Run Implementation Plan](aeos-ticket-run-implementation-plan.md)
- [System Design](03-system-design.md)
- [M7-003 Dashboard Task](../tasks/M7-003-aeos-dashboard.md)