# Tech Spec — AEOS Pipeline Integrity Improvements

**Date:** 2026-07-24
**Status:** Implemented on `feat/pipeline-integrity` (all seven work items). See the status table below.
**Motivates:** `aeos-postmortem-stan1.md` — a full-epic run shipped two spec-fidelity defects that every per-task gate marked green.

## Implementation status

| WI | Status | Commit | Notes |
|----|--------|--------|-------|
| WI-1 | ✅ Done | `f9186d2` | Per-epic `aeos/<epicId>` branch + `aeos-base/<epicId>` tag; opt out with `AEOS_GIT_ISOLATION=none`. Delivered via env flag rather than `project.json` for v1. |
| WI-2 | ✅ Done | `e3e4bf3` | `INTEGRATION_REVIEW` epic column over `base..HEAD`; escalates to human (manual advance). Auto-remediation remains out of scope. |
| WI-3 | ✅ Done | `8bda398` | Parent PRD/tech-spec injected into child context; parent id parsed from ticket metadata (no new port). |
| WI-4 | ✅ Done | `b1964c7` | `spec-traceability.md` rubric on TASK_BREAKDOWN. |
| WI-5 | ✅ Done | `b1964c7` | Integration-seam criterion in `code-structure.md`. |
| WI-6 | ✅ Done | `e3e4bf3` | Folded into WI-2: deferred hand-offs verified by the integration reviewer + spec-fidelity rubric. |
| WI-7 | ✅ Done | `d856fa9` | `escalation.md` + `aeos ticket resolve`; response injected as a resolution artifact. |

Deltas from the design below: WI-1's opt-out is an env var (not yet a
`project.json` field); the epic base is captured as a git **tag** rather than a
stored `base_ref` column, so no migration was needed and `ContextAssembler`
derives the range from the ticket id alone.

## 1. Overview

The postmortem identified six root causes (RC-1…RC-6). This spec designs the
changes that close them, against the current hexagonal architecture
(`cli/ → application/ → domain/ ← infrastructure/`). Nothing here is implemented;
each work item is scoped so it can become one or more child tasks.

**Guiding principle:** the pipeline must be able to answer *"does the assembled
feature match the PRD and the tech-spec decisions?"* at least once, with the
whole feature in view — and no completed task's work may be silently lost.

Scope in priority order (from the postmortem's ranking):

| WI | Root cause | Title | Leverage |
|----|-----------|-------|----------|
| WI-1 | RC-1 | Durable per-task isolation (feature branch + task commits + intact-check) | Critical |
| WI-2 | RC-3 | Epic `INTEGRATION_REVIEW` stage over the assembled diff | Critical |
| WI-3 | RC-2 | Inject epic PRD/tech-spec into child-task context | High |
| WI-4 | RC-4 | Spec-traceability dimension in the `TASK_BREAKDOWN` rubric | Medium |
| WI-5 | RC-5 | Require a non-mocked integration test per integrating task | Medium |
| WI-6 | RC-6 | Make `Depends on:` a checkable contract | Medium |
| WI-7 | RC-7 | Resolve every escalation through an editable MD file, like preflight questions | High (ergonomics) |

WI-1, WI-2, WI-3 each independently would have caught one of the two shipped
defects; they are the core of this spec. WI-7 is a human-in-the-loop ergonomics
change that makes every escalation (including WI-2's) respondable and resumable
without the operator hand-resetting state.

## 2. Current-state facts this design depends on

- **Columns** are an enum (`src/domain/model/column.ts`) with per-kind sequences
  and transition rules enforced by `StateMachineService`
  (`domain/services/state-machine.ts`) via `nextColumnFor(kind, column)`.
- **Column behavior is data**: `.aeos/column-specs/*.yaml` (worker/reviewer
  agents, rubrics, `executorMode`, `requiresRepoDiff`, `advanceMode`,
  `preflight`). Adding a column requires a template spec + agents + rubrics
  (`templates/`), guarded by `template-source.test.ts`.
- **Context** is assembled by `ContextAssembler.assemble(ticketId, projectRoot,
  column)`. `priorArtifacts` come **only** from
  `listArtifacts(projectRoot, ticketId)` — the ticket's own directory. The
  CODE_REVIEW diff is `gitGateway.diff(projectRoot)` = `git diff HEAD`.
- **The orchestrator** (`domain/services/orchestrator-policy.ts`,
  `decideNextAction`) is a pure scheduler. The epic's "all children DONE" join
  currently gates `TASK_BREAKDOWN → DOD_GATE`.
- **Git**: `GitGateway` now has `stageAll`, `commitAll`, `commit`, `commitFiles`,
  `diff`. There is one working tree per project; there is no branch-per-task.

## 3. Work items

### WI-1 — Durable per-task isolation (RC-1)

**Problem.** All task work accumulates in one uncommitted working tree; a task's
tracked-file edits can be reverted by later churn with no signal. T-001's
verified `id`-forwarding was lost this way.

**Design.**

1. **Epic feature branch.** When the orchestrator begins driving an epic (or on
   the epic leaving `TASK_BREAKDOWN`), create/checkout a branch
   `aeos/<epicId>` off the current `HEAD` of the target repo. All task commits
   land here. Extend `GitGateway` with:
   - `currentBranch(dir): string`
   - `checkoutBranch(dir, name, { createFrom?: string }): void`
   - `mergeBase(dir, ref): string` (for the integration diff, WI-2)
2. **Commit at task DONE** (already implemented via `commitAll` in
   `TicketApproveUseCase`) — keep, but target the feature branch.
3. **Intact-check at task start.** Before an agentic worker runs, assert the
   working tree has **no uncommitted tracked modifications** it did not create
   (i.e. the tree is clean except for what a re-run baseline expects). If dirty
   with unexpected tracked changes, escalate `NEEDS_HUMAN` rather than proceed —
   losing prior work must be loud. Reuses the baseline-commit machinery already
   in `TicketRunUseCase.runAttempt`.
4. **Prior-work assertion (lightweight).** At epic `INTEGRATION_REVIEW` (WI-2),
   the review runs against the full branch diff, which structurally surfaces any
   task whose committed contribution is missing — no separate mechanism needed
   for v1.

**Ports/adapters touched.** `GitGateway` (+ `SimpleGitGateway`),
`TicketRunUseCase`, `OrchestratorUseCase` (branch setup), `container.ts`.

**Alternatives considered.** Full `git worktree`-per-task (stronger isolation,
parallel tasks) — deferred; sequential tasks + feature branch is enough to stop
loss and is far simpler. Revisit if tasks ever run concurrently.

**Risk.** Writing branches/commits to the user's *source* repo is a policy step
beyond `.aeos/.git`. Must be opt-outable (`project.json` flag, e.g.
`"gitIsolation": "branch" | "none"`) and must never touch a dirty repo without
consent.

### WI-2 — Epic `INTEGRATION_REVIEW` stage (RC-3)

**Problem.** No stage ever reviews the *assembled* feature against the PRD and
tech-spec decisions. Both shipped defects are integration/fidelity issues.

**Design.** Add one epic column:

```
EPIC: BACKLOG → PRODUCT_SCOPING → TECH_SPEC → TASK_BREAKDOWN
              → INTEGRATION_REVIEW → DOD_GATE → DONE
```

1. **Column** `INTEGRATION_REVIEW` in `column.ts`, EPIC sequence + transitions in
   `state-machine.ts` / `nextColumnFor`. Migration note: existing epics parked in
   `TASK_BREAKDOWN`/`DOD_GATE` are unaffected (additive enum + sequence).
2. **Join moves here.** The "all children DONE" gate that currently guards
   `TASK_BREAKDOWN → DOD_GATE` now guards `TASK_BREAKDOWN → INTEGRATION_REVIEW`
   (in `TicketApproveUseCase` and `orchestrator-policy.decideNextAction`). An
   epic may only enter `INTEGRATION_REVIEW` once every child is DONE.
3. **Worker + reviewer.** Reuse the `reviewer-agent`; add an
   `integration-reviewer` worker whose job is to produce an integration report,
   reviewed against a new rubric `rubrics/drift/spec-fidelity.md`:
   - Every PRD acceptance criterion is met by the assembled code.
   - Every numbered tech-spec decision (D-1…D-N) is honored or has a logged,
     signed-off deviation.
   - Every task's `Touches`/deliverable is present in the branch (catches lost
     work — RC-1/RC-6).
   - Cross-component seams are exercised by a real (non-mocked) test (RC-5 hook).
4. **Context for this column.** `ContextAssembler` for `INTEGRATION_REVIEW`
   injects: the epic PRD, the epic tech-spec, the task breakdown, and the
   **full feature diff** = `git diff <mergeBase(main)>..HEAD` on `aeos/<epicId>`
   (not `git diff HEAD`). Add a branch-aware diff to `GitGateway`
   (`diffRange(dir, from, to)`).
5. **Verdict handling.** `REJECTED` escalates `NEEDS_HUMAN` with the findings
   (same machinery as task escalation, now persisted per RC of the escalation
   work already shipped). v1 does **not** auto-spawn fix tasks — the operator
   decides (re-open a task, or accept). Auto-remediation is a future item.
6. **`advanceMode`.** Default `manual` — a human confirms the integration verdict
   before `DOD_GATE`.

**Templates required** (or a fresh `project init` / `project sync` breaks):
`templates/column-specs/integration-review.yaml`,
`templates/agents/integration-reviewer-agent.yaml`,
`templates/rubrics/drift/spec-fidelity.md`. `template-source.test.ts` will force
these to exist.

**This is the highest-leverage, most invasive item.** It is the one stage that
would have caught *both* defects.

### WI-3 — Epic PRD/tech-spec in child-task context (RC-2)

**Problem.** A child task never sees the epic PRD/tech-spec, so it cannot check
its work against D-6/D-9.1. Confirmed in `ContextAssembler` — `priorArtifacts`
read only the ticket's own dir.

**Design.**

1. Give `ContextAssembler` the ability to resolve a task's parent: inject a
   `TicketRepository` (it currently has `projectRepo`, `artifactStore`,
   `gitGateway`), or have `TicketRunUseCase` pass the parent's key artifacts in.
   Prefer injecting `TicketRepository` — keeps the caller thin.
2. When the ticket is a `TASK` with a `parentId`, additionally read the parent
   epic's **PRD** and **tech-spec** artifacts from
   `.aeos/tickets/<parentId>/` and add them to context as a distinct,
   clearly-labeled block (new `AssembledContext.epicContext`, or labeled
   entries in `priorArtifacts`, e.g. `EPIC PRD (STAN-1)`).
3. `buildPrompt` renders the epic block ahead of the task body, framed as
   authoritative spec the task must not contradict.

**Context-size guard.** PRD + tech-spec can be large. v1 injects both in full
(they are the load-bearing docs and the whole point). If token pressure
appears, add a `decisions-digest` extraction (the D-1…D-N list + acceptance
criteria) as a later refinement — do not prematurely truncate.

**Ports/adapters touched.** `ContextAssembler` (+ its constructor wiring in
`container.ts`), `AssembledContext` model, `buildPrompt`.

### WI-4 — Spec-traceability in the `TASK_BREAKDOWN` rubric (RC-4)

**Problem.** The breakdown contradicted D-6/D-9.1 before any code existed, and
the `TASK_BREAKDOWN` review (intent-drift vs ticket/PRD) never checked against
the tech-spec's numbered decisions.

**Design.** Add a dimension to the architect's reviewer rubric
(`rubrics/drift/intent-drift.md` or a new `rubrics/structure/spec-traceability.md`):

- Every task traces to at least one tech-spec section/decision.
- **No task may contradict a numbered decision (D-N)**; a deliberate deviation
  must be called out as such and flagged for sign-off (not silently baked in).
- The coverage table must map decisions → tasks, and unmapped decisions are a
  finding.

The `TASK_BREAKDOWN` reviewer already receives the epic tech-spec as a prior
artifact (same ticket dir), so this is primarily a rubric + prompt change, not
new plumbing. Purely data (`templates/rubrics/…`), shippable independently.

### WI-5 — Require a non-mocked integration test (RC-5)

**Problem.** Every task mocked its collaborators; the real `sink` (drops `id`)
and the real delivery path (`response_url` vs `chat.update`) were never
exercised. Green tests hid both defects.

**Design.**

1. Add a QA/CODE_REVIEW rubric requirement: a task that integrates two
   components must include at least one test that exercises the **real seam**
   (collaborator not mocked), or explicitly justify why it cannot.
2. Reinforce at `INTEGRATION_REVIEW` (WI-2): the spec-fidelity rubric asserts the
   feature's critical seams have non-mocked coverage; absence is a finding.

Rubric-only (`templates/rubrics/…`); no code. Weaker on its own — pairs with
WI-2, which is the backstop.

### WI-6 — `Depends on:` as a checkable contract (RC-6)

**Problem.** `feedback.ts` deferred behavior to T-001 ("out of scope here") with
nothing verifying T-001's contribution still existed.

**Design (lightweight, v1).**

1. Keep `Depends on:` in the task body (already present). No new schema.
2. `INTEGRATION_REVIEW` (WI-2) verifies deferred hand-offs: for each task that
   defers behavior to another (`Depends on:` / "out of scope, see T-NNN"), the
   spec-fidelity rubric checks the depended-on behavior is actually present in
   the assembled branch.

A structured dependency graph (enforced ordering, machine-checked contracts) is
a future item; v1 leans on the integration review to catch the class.

### WI-7 — Resolve escalations through an editable MD file (RC-7)

**Problem.** Preflight blockers already have an excellent round-trip: they write
`<ticketId>-questions.md`, the operator fills in the `### Answer` block, runs
`aeos ticket answer`, and the run resumes carrying the answer. Every *other*
escalation (`ITERATIONS_EXHAUSTED`, `NOT_CONVERGING`, `UNPARSEABLE_VERDICT`, and
WI-2's integration-review rejection) has no such flow. The operator must read the
review artifact, reverse-engineer what to change, edit code/docs by hand, and
`aeos ticket ready` to retry — with no structured way to *tell the pipeline what
they decided*. Every escalation in this session (STAN-4 scope creep, STAN-6/8
preflight, the epic-level review) forced manual state archaeology.

Generalize the questions.md pattern to all escalations so the human edits a file
and moves on, and their response becomes context for the retry.

**Design.**

1. **Escalation artifact.** When a run ends `ESCALATED`, write
   `<ticketId>-escalation.md` alongside the persisted escalation (the reason is
   already stored on the ticket — this is its editable, human-facing form). It
   contains:
   - `Reason:` (the `EscalationReason`) and the operator-facing message.
   - `See:` pointer to the driving artifact (the review/QA report).
   - The unresolved blockers/findings (blocker-topics), so the decision has the
     evidence inline.
   - A fenced `## Response` block for the operator, mirroring questions.md's
     `### Answer`.
2. **Resolve command.** `aeos ticket resolve <id>` (or extend `ticket answer` to
   cover both artifacts): reads the `## Response` block, clears the escalation,
   and sets the ticket back to `READY`. Empty response ⇒ error ("nothing to
   resolve"), same guard as `ticket answer`.
3. **Response feeds the retry.** The operator's response is promoted into the
   ticket's context for the next run — as settled feedback the worker must honor
   (e.g. *"accept the attributable-asker narrowing"*, *"use `response_url` per
   D-6, not `chat.update`"*, *"T-001's id-forwarding was lost — re-add it"*).
   Reuse the existing decisions/feedback path (`decisions.md` /
   `settledDecisions` in `ContextAssembler`, `DecisionPromotionService`) so the
   response is durable and injected on the retry, not just a one-off note.
4. **Uniform surface.** Preflight keeps `questions.md`; loop/integration
   escalations use `escalation.md`; both resolve the same way ("edit the block,
   run one command, resume"). `aeos ticket show` already surfaces the reason
   (shipped) — it should also point at `escalation.md` when present.
5. **Applies to WI-2.** The epic `INTEGRATION_REVIEW` rejection escalates through
   this same file, so the operator responds to a whole-feature review the same
   way — decide per finding, resolve, and the epic resumes.

**Ports/adapters touched.** `TicketRunUseCase.finishEscalatedRun` (write the
artifact), a `TicketResolve` use case + driving port + `resolve` command
(mirrors `TicketAnswer`), `ContextAssembler`/`DecisionPromotionService` (inject
the response), `container.ts`. Escalation persistence (reason on the ticket) is
already shipped, so this builds on it.

**Why High-ergonomics.** It does not catch a defect, but it collapses the
operator's cost of *acting on* one from "read artifact → reason → hand-edit →
guess the reset command" to "write a response, run `resolve`." That directly
raises how usable the human-in-the-loop is — the entire point of escalation
being distinct from failure.

## 4. Sequencing

| Phase | Items | Rationale |
|-------|-------|-----------|
| 1 | WI-4, WI-5 | Pure rubric/data changes; no code; immediate value; low risk. |
| 2 | WI-3, WI-7 | Context injection + escalation ergonomics; self-contained; WI-7 builds on already-shipped escalation persistence and makes every later stage respondable. |
| 3 | WI-1 | Git isolation; prerequisite for a meaningful branch-wide integration diff. |
| 4 | WI-2, WI-6 | Integration review consumes WI-1's branch and WI-3's context, escalates through WI-7's file; WI-6 rides its rubric. |

Phase 1 is shippable this week and would have flagged the decomposition drift.
WI-7 lands in Phase 2 so that by the time WI-2's integration review can reject a
whole feature, the operator already has a file-based way to respond to it. Phase
4 is the structural fix and depends on Phases 2–3.

## 5. Testing strategy

- **Domain (pure).** `nextColumnFor`/state-machine transitions for the new
  `INTEGRATION_REVIEW` column; `decideNextAction` scheduling the epic into it
  only after all children DONE.
- **Application.** `ContextAssembler` includes parent PRD/tech-spec for a TASK,
  and does not for an EPIC; the integration-review context uses the branch-range
  diff; the intact-check escalates on an unexpectedly dirty tree.
- **Infrastructure.** `GitGateway` branch/mergeBase/diffRange against a real temp
  repo (as done for `commitAll`).
- **Templates.** `template-source.test.ts` must green with the new column spec,
  agent, and rubrics — a fresh `project init` must fully load.
- **Regression.** A test that reproduces the STAN-1 shape: a task that "completes"
  a contribution which is then absent from the branch is flagged by
  `INTEGRATION_REVIEW`.

## 6. Migration & compatibility

- New column is additive; DB migration for tickets is not required (column lives
  in the enum + specs). Existing epics mid-flight advance through the new stage
  on their next transition.
- `project sync` (already shipped) is the delivery vehicle for the new
  templates into existing projects; the postmortem's staleness lesson applies —
  ship the templates and tell operators to `aeos project sync`.
- Git isolation (WI-1) must be opt-outable and must refuse to run against a
  dirty source repo without consent.

## 7. Explicitly out of scope (future)

- Auto-remediation: `INTEGRATION_REVIEW` spawning fix-tasks instead of escalating.
- `git worktree`-per-task / concurrent task execution.
- A machine-enforced dependency graph with typed contracts.
- Token-budgeted "decisions digest" extraction for context (only if size bites).
