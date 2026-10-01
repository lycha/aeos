# AEOS Ticket Run Implementation Plan

**Status:** Proposed  
**Date:** 2026-04-21

## Scope

Translate the proposed run event model and split-pane UI into an implementation roadmap for future code work. This document is intentionally planning-only: it does not itself change runtime behavior.

## Recommended direction

Implement the feature in layers:

1. define orchestration event contracts, terminal semantics, and sequencing ownership
2. emit orchestration events through a run-scoped application-layer emitter
3. forward executor `stdout` / `stderr` chunks into that emitter
4. add a renderer to `aeos ticket run`
5. polish fallback, buffering, and test coverage

This keeps the current `TicketRunResult` return type intact while making progress visible to richer clients.

## Proposed rollout phases

### Phase 1 — Orchestration contract and driving-port surface

**Goal:** add a stable orchestration event vocabulary without changing end-user behavior yet.

**Likely files**

- `src/domain/model/ticket-run-event.ts` (new)
- `src/domain/ports/driving/ticket-run.port.ts`

**Changes**

- Introduce the event types defined in [AEOS Ticket Run Event Model Proposal](aeos-ticket-run-event-model-proposal.md).
- Treat the event stream as an application/orchestration contract even if it lives near the driving port for pragmatic reasons.
- Define terminal lifecycle semantics up front, including `ticket-run.interrupted` on the stream and its compatibility story with the unchanged `TicketRunResult` contract.
- Define the rule that every `stage.started` must close with exactly one `stage.completed` or `stage.failed` event.
- Extend `TicketRunPort.execute(...)` with an optional observer/callback parameter.
- Keep the existing `TicketRunResult` variants unchanged.

**Why first:** every later layer depends on a stable event contract, and interrupt/order semantics should be settled before implementation begins.

### Phase 2 — Application orchestration emission

**Goal:** emit curated AEOS events from the existing orchestration milestones.

**Likely files**

- `src/application/ticket-run.use-case.ts`
- `src/application/services/preflight.ts`
- `src/application/services/ticket-run-event-emitter.ts` (new)

**Changes**

- Emit lifecycle and stage events around:
  - ticket eligibility checks
  - context assembly
  - preflight start/result
  - `WORKING`, `FAILED`, `IN_REVIEW`, `SIGNED_OFF`
  - validation pass/fail
  - artifact write/commit
  - reviewer start/result
  - final success / blocked / failure return
- Include stage-scoped execution metadata on executor-backed stage events so the CLI renderer can show the active executor, model, and mode without reaching into use-case internals.
- Centralize event creation in a run-scoped emitter/sequencer owned by the application layer.
- Ensure exactly one terminal lifecycle event is emitted per run.
- Make blocked preflight and reviewer rejection close their active stage explicitly before emitting the terminal business outcome.
- Ensure failure paths emit a phase-level failure event before returning the existing result.

**Risk:** avoid double-reporting the same failure in both stage and final events.

### Phase 3 — Executor chunk streaming

**Goal:** forward raw child-process output as live events without giving up the existing buffered result.

**Likely files**

- `src/domain/ports/driven/executor.port.ts`
- `src/domain/model/executor-invocation.ts`
- `src/infrastructure/executor/claude-cli-executor.adapter.ts`
- `src/infrastructure/executor/auggie-cli-executor.adapter.ts`
- `src/infrastructure/executor/opencode-cli-executor.adapter.ts`
- `src/infrastructure/executor/ollama-cli-executor.adapter.ts`
- `src/infrastructure/executor/stub-executor.adapter.ts`

**Changes**

- Add an optional chunk callback at the executor boundary.
- On each `stdout` / `stderr` chunk, forward a source-aware event while continuing to append to the internal string buffer.
- Preserve current timeout, interrupt, and final `ExecutorResult` behavior.
- Keep preflight chunks on the same event path so the live raw-output pane can show preflight, worker, and reviewer output consistently.
- Feed chunk callbacks into the run-scoped application emitter so sequence assignment remains centralized.

**Risk:** different CLIs may emit noisy ANSI output or chunk boundaries that need normalization in the renderer rather than the adapter.

### Phase 4 — CLI renderer for `aeos ticket run`

**Goal:** consume the event stream in the run command.

**Likely files**

- `src/cli/commands/ticket-run.command.ts`
- possible new helpers such as:
  - `src/cli/rendering/ticket-run-live-view.ts`
  - `src/cli/rendering/ticket-run-log-buffer.ts`

**Changes**

- Add a renderer mode that maps AEOS events to the left pane and executor chunk events to the right pane.
- Keep a plain-line fallback for non-TTY or narrow terminals.
- Preserve the current command’s simple final summary so scripts and users still get a concise end state.
- Merge rendered raw-output lines by event `sequence`, not by source-local arrival only.
- Maintain per-source partial-line buffers and a bounded right-pane scrollback window.
- Keep a single input owner for the live view so `Ctrl+C` handling stays predictable.
- Treat observer/render delivery as best-effort reporting: renderer failures should not change the underlying run outcome.

**Recommendation:** keep renderer construction outside the use case so the application layer remains UI-agnostic.

### Phase 5 — Polish and operational behavior

**Goal:** make the experience resilient.

**Likely areas**

- CLI interrupt UX
- truncation / scrollback policies
- observer buffering / failure isolation rules
- opt-in flags such as `--verbose`, `--live`, or `--debug-stream`

**Changes**

- Ensure `Ctrl+C` maps to the already-defined interrupt semantics and user-facing messaging.
- Add rate-limiting or buffering rules if chunk volume becomes excessive.
- Decide the exact bounded retention size for the raw-output pane and whether truncation markers should also appear in plain fallback mode.

## File touchpoint summary

| File | Role in future implementation |
|---|---|
| `src/domain/ports/driving/ticket-run.port.ts` | add optional observer contract |
| `src/domain/model/ticket-run-event.ts` | define orchestration-stream event types near the driving contract |
| `src/application/ticket-run.use-case.ts` | emit orchestration events |
| `src/application/services/preflight.ts` | emit preflight-specific events |
| `src/application/services/ticket-run-event-emitter.ts` | assign sequence numbers and forward events to observers |
| `src/domain/ports/driven/executor.port.ts` | allow live chunk forwarding |
| `src/domain/model/executor-invocation.ts` | carry optional chunk hook or stream metadata |
| `src/infrastructure/executor/*.adapter.ts` | forward `stdout` / `stderr` chunks |
| `src/cli/commands/ticket-run.command.ts` | attach observer and render UI |

## Suggested test plan for later implementation

### Application tests

- verify event order for success, blocked, worker failure, validation failure, and reviewer rejection
- verify sub-state events match current behavior
- verify exactly one terminal lifecycle event is emitted per run
- verify blocked preflight closes `stage.completed(preflight)` before `ticket-run.blocked`
- verify reviewer rejection closes the reviewer stage before `review.rejected` / `ticket-run.failed`
- verify interrupted runs emit `ticket-run.interrupted` and still honor the current completion contract semantics

### Observer / transport tests

- verify the run-scoped emitter assigns monotonically increasing `sequence` values across orchestration and chunk events
- verify observer exceptions do not change run outcome or suppress the final `TicketRunResult`

### Executor adapter tests

- verify chunk callbacks fire in order for multi-chunk `stdout`
- verify `stderr` chunks are forwarded without breaking final `reason` handling
- verify timeouts and interrupts still produce correct final failures
- verify preflight, worker, and reviewer chunk events all carry the correct source attribution

### CLI tests

- verify plain fallback output for non-TTY
- verify split/stacked layout selection based on terminal width
- verify final summary lines are still printed on success/failure/blocked runs
- verify merged raw-output ordering follows event `sequence`
- verify partial lines are buffered/flushed correctly across stage boundaries
- verify bounded scrollback truncates older lines with a visible marker

## Open questions

1. Should the first user-facing version be always-on for TTYs, or hidden behind a flag such as `--live`?
2. Should event transport remain callback-based, or switch to a formal EventEmitter once the dashboard also consumes it?
3. What exact retention limit should the live renderer use for bounded raw-output scrollback?
4. If external subscribers later need replay/reconnect, should the stream add durable event IDs or cursors?

## Not in this change

- No runtime implementation in `src/`
- No dependency installation
- No tests or snapshots for the future renderer
- No changes to the existing dashboard command beyond documentation pointers

## See also

- [AEOS Ticket Run Event Model Proposal](aeos-ticket-run-event-model-proposal.md)
- [AEOS Ticket Run Terminal Layout Spec](aeos-ticket-run-terminal-layout-spec.md)
- [System Design](03-system-design.md)
- [M7-003 Dashboard Task](../tasks/M7-003-aeos-dashboard.md)