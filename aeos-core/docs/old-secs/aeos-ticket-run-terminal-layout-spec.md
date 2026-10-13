# AEOS Ticket Run Terminal Layout Spec

**Status:** Proposed  
**Date:** 2026-04-21

## Purpose

Specify the live split-pane UI for `aeos ticket run` so users can see both AEOS orchestration progress and raw executor output while a run is in flight.

## Goals

- Make long-running runs feel observable rather than “stuck”.
- Separate **AEOS truth** from **executor chatter**.
- Reuse the same event stream for plain logs, a terminal UI, and future dashboard/web surfaces.
- Preserve a sensible fallback for narrow terminals and non-interactive environments.

## Non-goals

- Replacing the existing multi-project dashboard.
- Designing a full-screen command palette or kanban interaction surface for this first cut.
- Inventing a new persistent storage layer just for UI rendering.

## Inputs

This UI consumes the event types proposed in [AEOS Ticket Run Event Model Proposal](aeos-ticket-run-event-model-proposal.md).

- Left pane: lifecycle, stage, sub-state, artifact, review, and cost events.
- Right pane: `executor.stdout.chunk` and `executor.stderr.chunk` events.

### Event contract assumptions

- The renderer should treat the event stream as the source of truth for the active stage.
- To render the header/footer accurately, executor-backed stages should expose stage-scoped execution metadata such as executor role, executor type, model, and mode (`artifact` vs `agentic`) on `stage.started` or an equivalent execution-start event.
- Run-level metadata alone is not sufficient once worker and reviewer configuration may differ.

## Layout overview

Use a three-region layout:

1. **Header** — ticket id, column, executor/model, active stage, elapsed time.
2. **Body split pane**
   - **Left (35–40%)**: curated AEOS timeline and current status summary.
   - **Right (60–65%)**: live passthrough from preflight/worker/reviewer executors.
3. **Footer** — current mode plus the minimal help/interaction hints.

### Example default layout

```text
┌ AEOS RUN · AEOS-4 · IMPLEMENTATION · claude-cli / claude-opus-4-6 ─────────────┐
│ LEFT: AEOS LOGIC                        │ RIGHT: EXECUTOR OUTPUT                │
│ ✓ Ticket eligible                       │ [worker stdout] Planning changes...   │
│ ✓ Preflight passed (1.1s)               │ [worker stdout] Editing src/foo.ts    │
│ ⏳ Worker running (42s)                 │ [worker stderr] warning: retrying...  │
│ • Artifact target: AEOS-4-impl.md       │                                        │
├──────────────────────────────────────────────────────────────────────────────────┤
│ Ctrl+C interrupt · plain logs fallback when non-TTY                             │
└──────────────────────────────────────────────────────────────────────────────────┘
```

## Header rules

The header should always show:

- ticket id
- current column
- resolved executor type and model for the active executor-backed stage
- current mode for the active executor-backed stage when known
- current stage label (`Preflight`, `Worker`, `Validation`, `Reviewer`, `Sign-off`) derived from explicit stage events rather than inferred from sub-state alone
- elapsed wall-clock time since `ticket-run.started`

Optional metadata when space allows:

- project key / project id
- latest cost subtotal once recorded

If stage-scoped executor metadata is not yet available for a non-executor phase such as `Validation` or `Sign-off`, the header may retain the last known executor metadata while still updating the stage label.

## Left pane rules

The left pane is **append-only and curated**.

### Content

- one-line milestones derived from stage and lifecycle events
- sub-state changes (`WORKING`, `FAILED`, `IN_REVIEW`, `SIGNED_OFF`)
- artifact/review paths when written
- short validation and reviewer outcomes
- final summary line on completion

### Presentation

- Keep the most recent 12–20 entries visible.
- Use checkmarks for completed stages, an hourglass/spinner marker for the active stage, and warning/error markers for blocked/failed states.
- Prefer short, human-readable messages instead of raw payload dumps.
- Prefer ASCII-safe or width-normalized markers in the implementation so icon rendering does not break alignment in Ink.

### Examples

- `✓ Ticket eligible`
- `✓ Preflight passed (1.1s)`
- `⏳ Worker running via auggie-cli`
- `✓ Validation passed`
- `⚠ Reviewer rejected artifact`
- `✓ Ticket reached SIGNED_OFF`

## Right pane rules

The right pane is the **raw live stream**.

### Content

- normalized line-buffered output from executor chunk events
- source prefix for every rendered line
- explicit distinction between `stdout` and `stderr`
- preflight, worker, and reviewer output are shown by default when those chunk events are emitted

### Prefix format

Use a stable prefix that tells the operator both the phase and the stream:

- `[preflight stdout]`
- `[worker stdout]`
- `[worker stderr]`
- `[reviewer stdout]`

### Normalization

- Convert chunks into lines before rendering when possible.
- Preserve ordering within a single source.
- Merge all rendered lines and phase separators by the event envelope `sequence` so the visible stream is deterministic across mixed `stdout`/`stderr` sources.
- Maintain a partial-line buffer per source (`preflight stdout`, `worker stderr`, etc.) so incomplete chunks do not corrupt adjacent lines.
- Flush any remaining partial line when a source ends, a stage changes, or the run completes/fails/interruption handling begins.
- Strip or normalize noisy ANSI sequences if an executor emits its own progress UI.
- Auto-scroll to the newest output by default.

### Scrollback and retention

- Keep the rendered right-pane buffer bounded in memory.
- The first cut should retain only the most recent raw-output window needed for an operator to inspect the live tail (for example, the last 200–500 rendered lines).
- When older lines are discarded, insert a subtle truncation marker such as `… older output truncated …`.
- If later implementations need export or persistence, that should be handled outside the Ink renderer rather than by keeping unbounded in-memory UI state.

### Empty states

- Before the first chunk arrives: show `Waiting for executor output…`
- Between phases: show a subtle separator such as `──── reviewer started ────`

## Rendering rules by state

### Preflight blocked

- Left pane highlights the blocker outcome and the questions artifact path.
- Right pane may stop after preflight output; no worker/reviewer pane is shown.
- Footer should make it obvious the run ended in a human-action-required state.

### Worker or reviewer failure

- Left pane turns the active stage red and shows the failure reason.
- Right pane remains visible so the last raw lines are still available.
- If a review artifact exists, surface its path in the left pane.

### Interrupted run

- Left pane shows `INTERRUPTED` and the stage where the interrupt occurred.
- Right pane freezes with the final visible executor lines.

### Signed off success

- Left pane ends with a compact success summary, including artifact and review paths.
- Right pane remains visible until the process exits so the operator can inspect the tail.

## Interaction model

The first implementation should stay intentionally small:

- `Ctrl+C` requests interruption of the current executor and should map to the existing `interrupt()` capability.
- Auto-scroll remains on by default.
- No focus switching, pane resizing, or inline command prompt is required for the first cut.
- Richer keyboard support can come later if the renderer evolves into a reusable dashboard panel.
- The live run view should have a single input owner so future child components do not compete for `useInput` handling.

## Fallback behavior

### Wide terminals (`>= 120` columns)

- Render the full split-pane layout.

### Medium terminals (`90–119` columns)

- Switch to a stacked layout: AEOS timeline above, executor output below.

### Narrow terminals (`< 90` columns) or non-TTY

- Fall back to a plain verbose log stream.
- Prefix every line so the output still makes sense in CI logs or redirected files.

Example fallback:

```text
[aeos] Preflight passed
[worker stdout] Planning implementation changes...
[aeos] Validation passed
[reviewer stdout] APPROVED
[aeos] Ticket AEOS-4 reached SIGNED_OFF
```

## Implementation notes

- The long-term direction in `docs/03-system-design.md` already points to Ink for rich terminal UI work.
- The first cut should still degrade gracefully to plain text when full layout rendering is not viable.
- The UI should not infer stage transitions from sub-state alone; it should consume explicit events.

## See also

- [AEOS Ticket Run Event Model Proposal](aeos-ticket-run-event-model-proposal.md)
- [AEOS Ticket Run Implementation Plan](aeos-ticket-run-implementation-plan.md)
- [System Design](03-system-design.md)