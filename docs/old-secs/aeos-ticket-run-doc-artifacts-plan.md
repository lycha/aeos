## 1. Overview

Prepare three new documentation artifacts under `docs/` that define how `aeos ticket run` should evolve from a start/final-status CLI into a live, split-pane run experience backed by a clear event model and an implementation roadmap. The plan is documentation-only: no code changes, no new folders outside `docs/`, and no package or runtime changes.

**Goals / success criteria**
- Produce three repo docs that an implementer can use without reopening the brainstorming thread.
- Anchor each doc in the current codebase reality: `src/cli/commands/ticket-run.command.ts` only prints start/final status; `src/domain/ports/driving/ticket-run.port.ts` returns only a final result; `src/application/ticket-run.use-case.ts` already exposes distinct orchestration milestones; executor adapters already receive `stdout`/`stderr` chunks but buffer them.
- Make the docs easy to discover from existing top-level docs, especially `docs/03-system-design.md` and `docs/tasks/M7-003-aeos-dashboard.md`.

**Scope boundaries**
- Included: authoring three new markdown docs in `docs/`, plus very small cross-link updates in existing `docs/*.md` files if desired.
- Excluded: implementation in `src/`, CLI/UI behavior changes, dependency changes, tests, or creating a new `docs/guides/` taxonomy.

## 2. Prerequisites

- Confirm current docs layout: top-level docs files plus `docs/tasks` and `docs/reviews`; no `docs/guides/` folder exists, so keep these artifacts at the top of `docs/`.
- Reference the following existing sources inside the new docs:
  - `docs/03-system-design.md` (Ink terminal dashboard, EventEmitter direction, terminal UX context)
  - `docs/05-action-plan-v1.md` (M2/M7 roadmap context)
  - `docs/tasks/M7-003-aeos-dashboard.md` (closest existing terminal UX task)
  - `docs/reviews/REVIEW-20260407-M2-011-cli-ticket-run.md` (historical orchestration expectations)
  - `src/cli/commands/ticket-run.command.ts`
  - `src/domain/ports/driving/ticket-run.port.ts`
  - `src/application/ticket-run.use-case.ts`
  - `src/domain/model/executor-result.ts`
  - `src/infrastructure/executor/claude-cli-executor.adapter.ts`
  - `src/infrastructure/executor/auggie-cli-executor.adapter.ts`
  - `src/infrastructure/executor/opencode-cli-executor.adapter.ts`
- No migrations, no environment setup, and no data changes are needed.

## 3. Implementation Steps

**Step 1: Establish final doc names and placement**
- Create these top-level files under `docs/`:
  1. `docs/aeos-ticket-run-terminal-layout-spec.md`
  2. `docs/aeos-ticket-run-event-model-proposal.md`
  3. `docs/aeos-ticket-run-implementation-plan.md`
- Rationale: the repo already uses descriptive top-level names for design/spec docs; creating a new `docs/guides/` folder for only three files would add taxonomy churn with little benefit.
- Testing consideration: verify file names sort clearly beside existing top-level docs and are easy to grep.

**Step 2: Author the event model proposal first**
- Files: create `docs/aeos-ticket-run-event-model-proposal.md`.
- Purpose: establish the source-of-truth vocabulary that the UI spec and implementation plan will both depend on.
- Content outline:
  - Problem statement: current `TicketRunPort` is final-result-only and the CLI only prints `Running ticket...` plus final success/failure.
  - Existing signals already available in `ticket-run.use-case.ts`: load/eligibility, spec resolution, context assembly, preflight, sub-state transitions, worker execution, validation, artifact commit, rubric load, reviewer run, sign-off, return.
  - Existing executor stream reality: adapters already receive `child.stdout`/`child.stderr` chunks but append them into buffered strings before returning.
  - Proposed event envelope fields: `type`, `ticketId`, `projectId`, `column`, `phase`, `timestamp`, `sequence`, `payload`, optional `source`/`runId`.
  - Event taxonomy: orchestration lifecycle events, state-transition events, artifact/review events, cost events, executor stream events (`executor.stdout.chunk`, `executor.stderr.chunk`), and terminal-only derived UI events.
  - Sequence examples for success, blocked preflight, worker failure, reviewer rejection, interrupt.
  - Compatibility guidance: keep final `TicketRunResult` for command completion while adding an event stream alongside it.
- Helpful snippet example: “Before: final-only `success|failed|blocked`; After: additive stream such as `ticket-run.started` → `preflight.completed` → `executor.stdout.chunk` → `review.completed` → `ticket-run.completed`.”

**Step 3: Author the terminal layout spec second**
- Files: create `docs/aeos-ticket-run-terminal-layout-spec.md`.
- Purpose: specify the split-pane live run UI driven by the event model.
- Content outline:
  - UX goals and non-goals.
  - Why this is needed now: current run command has almost no live visibility.
  - Layout anatomy: header/status line, left pane (orchestration timeline/status), right pane (live executor output, tabs or stacked stdout/stderr), footer/help bar.
  - Pane responsibilities mapped to event classes from the proposal.
  - Rendering rules for blocked, working, failed, interrupted, in-review, signed-off.
  - Resize/overflow behavior, truncation, scrollback, empty states, and color/icon semantics.
  - Interaction model: keyboard shortcuts, quit/interrupt expectations, copyable artifact/review paths.
  - Example screen states: startup, preflight blocked, worker streaming, reviewer running, final summary.
- Reference `docs/03-system-design.md` section 9.2 and the Ink/EventEmitter stack note in section 11 so the layout doc feels like a concrete elaboration rather than a disconnected redesign.
- Helpful snippet example: “Before: one-line `Running ticket AEOS-1…`; After: left pane shows milestone progression while right pane streams executor output chunks.”

**Step 4: Author the implementation plan artifact third**
- Files: create `docs/aeos-ticket-run-implementation-plan.md`.
- Purpose: translate the event model + layout spec into a phased code-change roadmap for later work, while still staying documentation-only in this execution.
- Content outline:
  - Scope and assumptions.
  - Proposed rollout phases: domain event contract, application emission points, executor stream hooks, CLI renderer, polish/failure handling.
  - Likely future code touchpoints: `src/domain/ports/driving/ticket-run.port.ts`, `src/application/ticket-run.use-case.ts`, `src/cli/commands/ticket-run.command.ts`, `src/domain/model/executor-result.ts`, executor adapters under `src/infrastructure/executor/`, and eventually dashboard-related entry points.
  - Per-phase risks and open questions: backpressure, event ordering, stderr verbosity, agentic executor differences, preserving non-interactive command behavior.
  - Test strategy for the future implementation: unit tests for emitted event order/payloads, adapter tests for chunk forwarding, CLI rendering snapshot tests, smoke tests for blocked/failure/success flows.
  - Clear “not in this change” note to prevent implementers from sneaking code into the doc-only PR.
- Helpful snippet example: “Phase 1 adds event emission without changing final command semantics; Phase 2 adds a live renderer consuming the same events.”

**Step 5: Add light discoverability updates (recommended, still docs-only)**
- Modify `docs/03-system-design.md` with a short “See also” note in the terminal/dashboard section and/or tech stack section linking to the three new docs.
- Modify `docs/tasks/M7-003-aeos-dashboard.md` with a brief note that the newer `ticket run` terminal UX/event docs should guide future interactive dashboard work.
- Optional only: add a one-line pointer in `docs/05-action-plan-v1.md` under M7 if maintainers want roadmap discoverability, but this is lower priority than the two links above.
- Keep these edits minimal: cross-links only, no structural rewrite.

**Step 6: Review for cohesion and internal references**
- Ensure the three docs reference each other explicitly:
  - event model → consumed by layout and implementation docs
  - layout spec → depends on event model
  - implementation plan → cites both as upstream design inputs
- Check terminology consistency: `ticket run`, `worker`, `reviewer`, `sub-state`, `artifact mode`, `agentic mode`, `stdout/stderr chunk`, `SIGNED_OFF` vs `SIGNED-OFF`.
- Testing consideration: markdown-only QA pass for broken links, file paths, and naming consistency.

## 4. File Changes Summary

**Created**
- `docs/aeos-ticket-run-terminal-layout-spec.md`
- `docs/aeos-ticket-run-event-model-proposal.md`
- `docs/aeos-ticket-run-implementation-plan.md`

**Modified (recommended, light-touch)**
- `docs/03-system-design.md`
- `docs/tasks/M7-003-aeos-dashboard.md`
- `docs/05-action-plan-v1.md` (optional)

**Deleted**
- None.

## 5. Testing Strategy

- Markdown review only; no runtime validation required.
- Verify every referenced file path exists in the repo.
- Verify each doc has a clear status/purpose header and cross-links to the related docs.
- Manually inspect for two concrete “before/after” examples:
  - current `aeos ticket run` output vs proposed live layout
  - current final-only return contract vs proposed additive event stream
- If the implementer later updates existing docs, confirm the new links are visible from `docs/03-system-design.md` and `docs/tasks/M7-003-aeos-dashboard.md`.

## 6. Rollback Plan

- If any new doc proves redundant or confusing, remove the three new files and revert the small cross-link edits in existing docs.
- Because this is docs-only, rollback is a simple git revert with no migration or state cleanup.
- If discoverability edits feel too noisy, keep the three new docs and drop the optional updates to existing files.

## 7. Estimated Effort

- Effort: roughly 2–4 hours total for a careful author.
- Complexity: medium.
- Suggested authorship order: (1) event model proposal, (2) terminal layout spec, (3) implementation plan, (4) discoverability cross-links.
- Why this order: the event vocabulary informs the UI contract, and both should exist before writing the roadmap for eventual code changes.
