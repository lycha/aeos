# AEOS Autonomous Orchestrator Tech Spec

**Status:** Proposed
**Date:** 2026-07-20
**Supersedes the decision gate in:** [LangGraph Orchestration Tech Spec](aeos-langgraph-orchestration-tech-spec.md)

## Summary

The proposal is an orchestrator that drives Requirement → PRD → Epic → Tech Spec → Tasks → Implementation → Review → QA → Human sign-off, with adversarial review loops (a second agent on a *different model* reviews the first) at five points, and a kill switch back to human-driven operation.

Two findings in the current codebase reshape this substantially:

1. **Much of it was already designed and never wired up.** `ColumnSpec` declares `maxIterations`, `escalation: 'escalate_to_human' | 'mark_done'`, and `advanceMode: 'manual' | 'auto'`. All three are validated by Zod, set in every column-spec YAML, and **read by no code whatsoever** (`grep` finds only the schema and the interface). `reviewer-agent.yaml` already specifies an INFO/WARNING/BLOCKER severity taxonomy with APPROVED / APPROVED_WITH_WARNINGS / REJECTED verdicts. Per-agent `executor.type` + `executor.model` already means adversarial cross-model review needs **zero new infrastructure**. The proposal is substantially "finish the original design," not "bolt on a new one."

2. **The verdict parser is a substring match and will break autonomy immediately.** See below. This is the single blocking defect.

The main design disagreements are stated up front rather than buried: **"loop until approved without changes" does not terminate**, and **the orchestrator should not be an LLM agent**.

---

## Blocking defect: verdict parsing

`src/application/ticket-run.use-case.ts:651-654`:

````typescript
const normalizedReview = reviewContent.toUpperCase();
const isRejected =
  normalizedReview.includes('REJECTED') ||
  (normalizedReview.includes('FAIL') && !normalizedReview.includes('APPROVED'));
````

This uppercases the **entire review document** and substring-matches it. Three failure modes, all of which become critical the moment a machine rather than a human consumes the verdict:

- **The reviewer's own output template contains the string `REJECTED`.** `reviewer-agent.yaml` instructs the model to emit `**[APPROVED / APPROVED_WITH_WARNINGS / REJECTED]**`. Any model that echoes the template scaffold — routine behaviour — produces a false rejection. Every review.
- **Any prose containing "REJECTED" or "FAIL" flips the verdict.** A finding that reads *"this would be rejected by the linter"* or *"the test fails on line 12"* rejects the artifact.
- **`APPROVED_WITH_WARNINGS` is silently collapsed to a pass.** It contains `APPROVED`, so it advances, and the WARNING findings are discarded. The severity distinction the rubric carefully produces is thrown away at the parse step.

Under human review this is tolerable — an operator reads the review. Under the proposed autonomy it is not: the loop controller's *only* input is this boolean. A false REJECTED spins an unbounded loop burning money; a false APPROVED ships unreviewed work.

**Fix before anything else.** Require the reviewer to emit a machine-readable trailer and parse that, not the prose:

````markdown
<!-- AEOS-VERDICT
verdict: REJECTED
blockers: 2
warnings: 3
info: 1
-->
````

Parse with an anchored regex over the trailer block; treat a missing or unparseable trailer as a hard run failure (not a rejection, not a pass) so the failure is loud. Keep the prose review as the human-readable artifact.

This is a prerequisite for every phase below, and worth doing even if none of them happen.

---

## Design position 1: the orchestrator is a scheduler, not an agent

The proposal says "orchestration agent." **Recommend: a deterministic policy engine, not an LLM.**

The flow described is fully specified: fixed stages, fixed transitions, fixed loop conditions. Every decision the orchestrator makes — *is this verdict blocking? have we hit max iterations? which task is next? has the budget been exhausted?* — is a predicate over structured state. Nothing in it requires judgment.

Putting an LLM in that position adds cost on every tick, nondeterminism in control flow, a new failure mode (the orchestrator hallucinating a transition), and makes the whole pipeline unauditable — you can no longer answer "why did this advance?" from a transition log.

LLM judgment belongs where it already is: in the workers and reviewers. There is **one** defensible exception — a *stuck-loop arbiter* invoked only when a loop hits `maxIterations` without converging, to classify whether the disagreement is substantive (escalate to human) or cosmetic (accept with warnings). That is a genuine judgment call, it fires rarely, and it is advisory — the deterministic engine still owns the transition.

## Design position 2: "until approved without changes" will not terminate

This appears in five places in the proposal (steps 3, 6, 8, 10, 11). As literally specified, each is an unbounded loop.

LLM reviewers essentially always find *something*. Asked "review this," a competent reviewer produces comments indefinitely — that is what good reviewers do. Two different models will disagree on style, structure, and emphasis more or less forever, and each revision changes the artifact enough to give the next review fresh material. There is no natural fixed point at "no comments."

Worse, the loops nest: five unbounded loops in sequence, one of them (task review) fanning out over N tasks.

The fix is already half-built in `reviewer-agent.yaml`. Termination needs four independent guards:

| Guard | Rule |
|---|---|
| **Severity gate** | Only `BLOCKER` findings block. `WARNING`/`INFO` are recorded to the artifact and do not gate. `APPROVED_WITH_WARNINGS` **advances** — and the warnings must be preserved, not discarded as today. |
| **Iteration ceiling** | `maxIterations` per column (already in `ColumnSpec`, currently defaulting to 3 and ignored). On exhaustion, apply `escalation` (already in `ColumnSpec`) — `escalate_to_human` or `mark_done`. |
| **Convergence detection** | Hash the normalised BLOCKER set each iteration. If iteration N's blockers are a subset of N−1's, or the artifact diff between iterations is below a threshold, the loop is not converging — stop and escalate rather than spending the remaining iterations. |
| **Budget ceiling** | Per-epic USD cap. On breach: pause, escalate, never silently continue. Cost is already recorded per invocation in `SqliteCostRepository`; the data is there. |

Redefine the success condition as **"no BLOCKER findings remain, within N iterations and B budget"** — not "no comments." This is what the existing rubric was designed for.

---

## Entity model

`Ticket` (`src/domain/model/ticket.ts`) has no parent/child relationship. The proposal's Requirement → Epic → Task hierarchy is genuinely new and is the largest data-model change.

````typescript
export interface Ticket {
  id: string;
  projectId: string;
  title: string;
  column: Column;
  subState: SubStateOrNull;
  // new:
  parentId: string | null;       // Task → Epic
  kind: 'EPIC' | 'TASK';         // drives which column pipeline applies
  createdAt: string;
  updatedAt: string;
}
````

Two pipelines, not one:

- **Epic pipeline** — `BACKLOG → PRODUCT_SCOPING → ARCH_SPIKE → TECH_SPEC → TASK_BREAKDOWN → (children) → DOD_GATE → DONE`
- **Task pipeline** — `READY → IMPLEMENTATION → CODE_REVIEW → QA → DONE`, scoped to one atomic task, one branch, one PR

An epic in the children-fan-out state is blocked until all child tasks reach `DONE`. This is a join, and it is where the orchestrator earns its keep: scheduling ready tasks, respecting declared dependencies between them, and enforcing a concurrency cap.

Requires a SQLite migration (`parent_id`, `kind`, indices) and updates to `StateMachineService`, which currently assumes a single linear column sequence.

## Task-review fan-out (proposal step 8)

> *"each task is reviewed in the same way as tech spec"*

If the architect emits 12 tasks and each gets an independent adversarial review loop, that is 12 × 2 agents × N iterations **before a single line of code is written**. At N=2 that is ~48 invocations of pure planning overhead.

**Recommend: review the task breakdown as one artifact, not per task.** The properties worth checking — are tasks atomic, correctly ordered, non-overlapping, collectively sufficient for the spec — are properties of the *set*, and a per-task review cannot see them. One review of the whole breakdown is both cheaper and more likely to catch the real defects. Per-task review can be reintroduced later if breakdown quality proves to be the bottleneck; it almost certainly will not be.

---

## Adversarial review: model diversity

The premise is sound — an independent model reduces correlated blind spots and self-preference bias. And it needs no new code: `AgentSpec.executor` already carries `type` and `model` per agent, resolved through `ExecutorConfigResolver`. Point `reviewerAgentFile` at a spec with a different executor and it works today.

Two implementation notes:

**Diversity should be across families, not versions.** Two Claude models share training lineage and will share some blind spots. The strongest signal comes from crossing executor backends — `claude-cli` worker against an `auggie-cli` or `opencode-cli` reviewer — which AEOS already supports. Model-only diversity within one family is the weaker fallback.

**The model IDs in the repo are stale.** `reviewer-agent.yaml` pins `claude-sonnet-4-20250514`, which is deprecated with a published retirement date of 2026-06-15 — already past. `DEFAULT_GLOBAL_CONFIG` in `src/shared/config.ts` pins `claude-opus-4-6`, two generations behind. Current IDs: `claude-opus-4-8` ($5/$25 per MTok), `claude-sonnet-5` ($3/$15, introductory $2/$10 through 2026-08-31), `claude-haiku-4-5` ($1/$5). Fix these before measuring anything — cost baselines taken against a deprecated model are not comparable.

Suggested assignment (worker / reviewer):

| Stage | Worker | Reviewer | Rationale |
|---|---|---|---|
| PRD | `claude-opus-4-8` | different backend, Opus-tier | Judgment-heavy; cheap relative to implementation |
| Tech spec | `claude-opus-4-8` | different backend, Opus-tier | Highest-leverage artifact — errors here propagate to every task |
| Task breakdown review | — | `claude-sonnet-5` | Structural check; does not need Opus |
| Implementation | `claude-opus-4-8`, agentic | — | The expensive step |
| Code review | — | different backend, Opus-tier | Bug-finding is the one place to not economise |
| QA | `claude-sonnet-5` | — | Mechanical: run tests, report |

A note on code-review prompting: recent Claude models follow severity filters *literally*. A prompt saying "only report high-severity issues" causes the model to investigate thoroughly, find the bugs, and then decline to report ones below the stated bar — measured recall drops even though bug-finding improved. For the review agent, instruct it to **report everything with a confidence and severity tag** and let the deterministic severity gate do the filtering. This composes exactly with the BLOCKER/WARNING/INFO taxonomy already in `reviewer-agent.yaml`.

---

## Cost

Order of magnitude for one medium epic (1 PRD, 1 tech spec, 12 tasks), assuming loops average 2 iterations and nothing goes badly wrong:

| Stage | Invocations | Notes |
|---|---|---|
| PRD + review loop | ~4 | artifact mode |
| Tech spec + review loop | ~4 | artifact mode |
| Task breakdown + review | ~3 | batched, per the recommendation above |
| Implementation | 12 | **agentic** — the expensive ones |
| Code review loops | ~36 | 12 tasks × (review + revision + re-review) |
| QA | ~12 | |
| **Total** | **~70** | ~12 agentic, ~58 artifact |

At current Opus 4.8 pricing with prompt caching on the shared context, that lands roughly in the **$40–60 per epic** range — and roughly **doubles for each additional average loop iteration**. An unbounded loop averaging 6 iterations puts a single epic in the mid-hundreds.

Treat these as order-of-magnitude with stated assumptions, not a forecast. The actionable conclusions hold regardless of the exact figures:

- The **budget ceiling is not optional** — it is the primary safety mechanism.
- Review loops, not implementation, dominate invocation count. Iteration control is where cost is won.
- Prompt caching matters: the PRD and tech spec are re-sent as context on every task. Keep them at a stable prefix position.
- `SqliteCostRepository` already records per-invocation cost with `projectId`/`ticketId`/`column`. Roll-up by epic is a query, not new plumbing.

---

## Kill switch and human fallback

The requirement that the orchestrator can be switched off maps cleanly onto what exists: **the current human-gated behaviour is the fallback.** The orchestrator is an additive auto-advance layer, not a replacement, and this should be an explicit design constraint rather than an emergent property.

Three levels, from the config surfaces that already exist:

| Level | Mechanism | Effect |
|---|---|---|
| Global | `GlobalConfig.advanceMode` (`~/.aeos/config.json`, already defaults to `'manual'`) | Master switch |
| Per column | `ColumnSpec.advanceMode` (already in every YAML, currently ignored) | e.g. auto-advance PRD, always gate IMPLEMENTATION |
| Live | `aeos orchestrator pause <epic>` | Stops scheduling new work; in-flight runs finish or are interrupted |

Invariants the orchestrator must hold:

- **Turning it off mid-epic is always safe.** All state is in SQLite plus git-committed markdown; a paused epic is just a set of tickets in ordinary sub-states that a human can drive with existing commands.
- **`DOD_GATE` is never automatable.** `TicketRunUseCase` already hard-refuses it (`'DoD gate is human-only'`). Keep that.
- **PR merge is never automatable.** Proposal step 12, correct as written.
- **Escalation is a first-class outcome**, not an error. Iteration exhaustion, budget breach, and non-convergence all produce a paused epic with a human-readable reason — never a silent advance.

---

## PR-based flow and QA

Two areas needing genuinely new infrastructure — both larger than they look:

**Pull requests.** `GitGateway` currently exposes `init`, `commit`, `commitFiles`, `diff`. The proposal needs branch-per-task, push, PR create, and PR status. That is a new driven port (`ForgeGateway`) with a `gh`-CLI adapter, plus a decision on branching topology: task branches off an epic integration branch is the sane default, but it introduces merge-conflict resolution between sibling tasks — which is agent work nobody has scoped here.

**QA / Playwright.** "Spins up Playwright tests" requires a *running application*, which AEOS has no concept of — no build step, no service lifecycle, no environment provisioning, no port allocation, no teardown. This is the least-specified part of the proposal and probably its own spec. Recommend Phase 4 at the earliest, and starting with the far cheaper thing: a QA agent that runs the project's **existing** test suite and reports, before attempting E2E authoring.

Note also that "QA sends back to engineer until approved" is a sixth unbounded loop and needs the same four guards.

---

## Phasing

Each phase is independently valuable and independently shippable.

| Phase | Scope | Ships |
|---|---|---|
| **0** | Machine-readable verdict trailer + parser. Fix stale model IDs. | Correct verdict handling under human operation. Prerequisite for everything. |
| **1** | Wire up `maxIterations` / `escalation` / severity gate / convergence detection. Single-column revision loops, still human-gated between columns. | Reviewer rejection stops being terminal — the highest-value single change. |
| **2** | Ticket hierarchy (`parentId`, `kind`), epic/task pipelines, `TASK_BREAKDOWN` column, batched breakdown review. | Epics decompose into tasks. Still human-driven. |
| **3** | Deterministic orchestrator: scheduler, auto-advance honouring `advanceMode`, budget ceiling, pause/resume, escalation reporting. | **Autonomy.** |
| **4** | `ForgeGateway` + PR flow. | Task → PR. |
| **5** | QA agent: existing suite first, Playwright authoring later. | Regression gating. |

Phases 1 and 3 are where LangGraph becomes relevant.

## Effect on the LangGraph decision

The prior spec set an explicit gate: *"Proceed to Phase 1 only if the answer is yes: does AEOS want reviewer→worker retry cycles within a column?"*

This proposal answers it emphatically — **six** distinct cycle types, plus fan-out over tasks, plus a long-running multi-hour orchestrator. That materially strengthens the case and changes two of its conclusions:

- **Cycles are now the point, not a hypothetical.** The recommendation moves from "narrow win, adopt cautiously" to "well-motivated."
- **Durable checkpointing becomes justified.** The prior spec deferred it on the grounds that a column run is a single short-lived process. An autonomous epic run spanning hours and a dozen tasks is a different animal: crash-resume has real value. The idempotency warnings in that spec still stand in full — commit and agentic nodes remain non-replay-safe and must be marked.

What does **not** change: the outer column pipeline stays in SQLite and `StateMachineService`. Even with an orchestrator driving it, the pipeline is a durable, human-pausable, multi-day state machine, and a graph checkpointer has no business being the authority on ticket state.

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Verdict misparse drives the whole loop | **Critical** | Phase 0 trailer + fail-loud on unparseable |
| Unbounded loops burn budget | **Critical** | Four guards; budget ceiling is the backstop |
| Compounding error — a flawed PRD propagates into every task | High | Tech spec is the highest-leverage gate; consider keeping it human-gated longest |
| Agents converge on mutual agreement without quality (reviewer rubber-stamps) | High | Cross-family diversity; periodic human audit of auto-approved artifacts; track approval rate as a metric — a reviewer approving ~100% first-pass is broken, not excellent |
| Sibling task merge conflicts | Medium | Concurrency cap; serialise tasks touching overlapping paths |
| Cost surprise | Medium | Per-epic ceiling; cost data already captured per invocation |
| Silent autonomous advance of bad work | Medium | `DOD_GATE` and PR merge stay human; escalation is a first-class outcome |

## Open questions

1. Should a retried implementation see the previous attempt's diff, the review feedback, or both? (Recommend: review feedback plus current repo state, not the rejected diff — it anchors the model to the failed approach.)
2. Does the QA loop re-run code review after an engineer fix, or go straight back to QA? (Recommend: straight to QA, with code review re-run only if the fix exceeds a diff-size threshold.)
3. How are cross-task dependencies declared — architect-authored explicit ordering, or inferred? (Recommend: explicit in the task artifact; inference is a research problem.)
4. Should the stuck-loop arbiter exist at all in v1, or is "escalate to human on exhaustion" sufficient? (Recommend: escalate only. Add the arbiter if escalation volume proves annoying.)
5. Should `WARNING` findings accumulate across iterations into a debt record on the epic, or be dropped once the artifact is approved?

## See also

- [LangGraph Orchestration Tech Spec](aeos-langgraph-orchestration-tech-spec.md)
- [Ticket Run Event Model Proposal](aeos-ticket-run-event-model-proposal.md)
- [System Design](03-system-design.md)
