# Postmortem — STAN-1 "Slack Bot Answer Feedback" shipped with two spec-fidelity defects

**Date:** 2026-07-24
**Subject:** First full-epic run of the AEOS pipeline on a real feature (project `Standin`, epic `STAN-1`, tasks `T-001`…`T-007`).
**Trigger:** A human/out-of-band code review of the assembled feature found two real functional defects that every AEOS per-task review and QA pass had marked green.

This is a process postmortem for **AEOS itself**, not for the Standin feature. The
goal is to explain how a pipeline that reported success at every gate shipped
non-functional behavior, and to record hypotheses for fixing the pipeline. No
AEOS code changes are proposed here — see
`aeos-pipeline-integrity-tech-spec.md` for the design that acts on these
findings.

---

## 1. What shipped broken

The external review (`.aeos/tickets/STAN-1/STAN-1-code-review.md`) found:

| # | Severity | Defect | Spec decision violated |
|---|----------|--------|------------------------|
| 1 | HIGH | Deterministic Langfuse score `id` is dropped by the real sink, so every 👍→👎 flip writes a **new** score instead of upserting. Eval data silently corrupts. | D-2 / §2.1, impl-plan Step 1 |
| 2 | MEDIUM–HIGH | Visual acknowledgement uses `chat.update` with stored `channel`+`ts`, which cannot edit a slash-command `response_url` message — the user never sees "logged" and buttons stay live. | D-6 |
| 3 | LOW | Migration adds `slack_team_id/channel_id/message_ts` columns that D-9.1 explicitly rejected; they exist only to feed the broken `chat.update` path. | D-9.1 |

All 36 tests passed and `tsc` was clean. The review's own summary: *"the tests
mock past the broken seams (false confidence)."*

---

## 2. How the pipeline ran

`STAN-1` (epic) decomposed into seven tasks, each of which ran the task pipeline
(`IMPLEMENTATION → CODE_REVIEW → QA → DONE`) independently:

| Task | Ticket | Scope |
|------|--------|-------|
| T-001 | STAN-2 | Add optional deterministic `id` to `ScoreRecord` and the Langfuse sink |
| T-002 | STAN-3 | Allow unattributed questions so every answer is rateable |
| T-003 | STAN-4 | `slack_answer_feedback` table migration |
| T-004 | STAN-5 | `lib/slack/feedback.ts` + unit tests |
| T-005 | STAN-6 | Render feedback actions on every answer |
| T-006 | STAN-7 | Handle feedback interactions in the interactive endpoint |
| T-007 | STAN-8 | Document the feedback loop |

Every task reached `DONE` with a passing CODE_REVIEW and a `READY FOR DOD` QA
verdict.

---

## 3. Root causes

### 3.1 Defect #1 was completed work that AEOS lost (state-management failure)

This is the most severe finding and the least expected.

- T-001 (STAN-2) was exactly the task *"Add optional `id` to `ScoreRecord` and
  the Langfuse sink."*
- STAN-2's implementation notes, CODE_REVIEW, and QA report all describe and
  verify a **real diff**, line-cited: `sink.ts:16-17` adds `id?: string`;
  `langfuse.ts:11-12` forwards it to `client.score()`. QA: *"verified against
  the actual diff … READY FOR DOD."*
- The current code has **neither**. `id` is absent from both `sink.ts` and
  `langfuse.ts`, and `git log -S id -- lib/llm/scores/langfuse.ts` shows it was
  never committed. The only commit in the repo is `30c5b9f [STAN-8]` — the
  per-task commit added late in the run — and T-001's work is not in it.

**Conclusion:** the pipeline reviewed and QA'd this work correctly. The work was
then **silently reverted** in the shared working tree before anything committed
it. The exact git operation is unrecoverable, but the structural cause is clear:
for almost the entire epic there were **no per-task commits** — every task's
edits lived in one mutable, uncommitted working tree, so any task's tracked-file
changes could be (and were) lost by later re-runs, reverts, or `git add -A`
churn with zero signal.

This is not a context or review gap. It is a durability gap.

### 3.2 Defects #2/#3 drifted at decomposition and were never reconciled to the spec

- The tech spec's D-6 chose `response_url` + `replace_original` *specifically
  because* the answers are not bot-posted messages; D-9.1 rejected denormalized
  Slack columns in favor of `question_id` lookup.
- The **task breakdown contradicted both** before any code was written: STAN-4's
  ticket body (from `tasks.md`) says *"…plus the Slack coordinates … provide a
  `chat.update` fallback."* Every downstream task then faithfully implemented a
  plan that already violated the spec.
- Nothing reconciled the breakdown back to the spec. The `TASK_BREAKDOWN` review
  checks intent-drift against the *ticket/PRD*, not against the tech spec's
  specific load-bearing decisions, so the drift passed.

### 3.3 The structural gaps that let all of it through

1. **Child tasks never see the epic PRD/tech spec.**
   `ContextAssembler.assemble()` builds `priorArtifacts` from
   `listArtifacts(projectRoot, ticketId)` — the **current ticket's own
   directory only**. A child task (`.aeos/tickets/STAN-5/`) never reads
   `STAN-1-prd.md` or `STAN-1-tech-spec.md`. The engineer sees the task body's
   *references* to "§2.1 / §4.1" but never the actual decisions, so it cannot
   check its work against D-6/D-9.1 — the spec is not in the room.

2. **No epic-level integration review.** The epic pipeline is
   `…→TASK_BREAKDOWN→DOD_GATE→DONE`. There is no epic-level CODE_REVIEW or QA
   over the *assembled* feature against the PRD. DOD_GATE is a human gate over
   artifacts. Both shipped defects are integration/spec-fidelity issues that
   only a whole-feature review catches — and that review happened outside AEOS.

3. **Per-task unit tests + mocks give false green.** Each task tests its unit in
   isolation with mocked collaborators. `feedback.test.ts` asserts `sink.record`
   was called *with* `id` against a **mock** sink; the real sink that drops `id`
   is never exercised. No test runs the integrated seam, so green tests actively
   hid both defects.

4. **Cross-task dependencies are invisible and unverified.** `feedback.ts`
   comments that id-forwarding is *"out of scope here"* — deferring to T-001.
   Nothing in AEOS models or checks that hand-off. T-004 built on a T-001
   contribution that no longer existed, and no stage noticed.

**Cross-session observation (RC-7, ergonomics not correctness).** Every
escalation in this run — STAN-4 scope creep, STAN-6/STAN-8 preflight blocks, the
epic-level review — required the operator to read an artifact, reverse-engineer
what to change, hand-edit, and guess the reset command. Only preflight has a
structured "edit a block, run one command, resume" flow (`questions.md` +
`aeos ticket answer`). Escalation is meant to be distinct from failure — a
decision point, not an error — but acting on one is currently as costly as
debugging a failure. Generalizing the questions.md round-trip to all escalations
is a high-value usability fix even though it caught none of the defects.

---

## 4. Findings mapped to fixes

| # | Root cause | Severity to AEOS | Improvement hypothesis |
|---|------------|------------------|------------------------|
| RC-1 | No durable per-task isolation; completed work lost | **Critical** | Per-task branch/worktree + commit; verify upstream work intact at task start |
| RC-2 | Child tasks lack epic PRD/tech-spec context | High | Inject epic lineage (or a decisions digest) into child context |
| RC-3 | No epic-level integration review vs PRD/spec | High | Add an epic INTEGRATION_REVIEW stage before DOD_GATE |
| RC-4 | Breakdown not reconciled to spec decisions | Medium | Add a spec-traceability dimension to the TASK_BREAKDOWN rubric |
| RC-5 | Mocked unit tests hide integration defects | Medium | Require ≥1 non-mocked integration test per feature |
| RC-6 | Cross-task dependencies unmodeled | Medium | Make `Depends on:` a checkable contract verified at epic review |
| RC-7 | Escalations are hard to act on — no structured "respond and resume" for anything but preflight | High (ergonomics) | Resolve every escalation through an editable `escalation.md`, like preflight `questions.md` |

Severity ranking for AEOS work:
**RC-1 ≈ RC-3 > RC-2 > RC-4 > RC-5 > RC-6.** RC-1, RC-2, and RC-3 would each
independently have caught one of the two shipped defects.

---

## 5. What already changed during this session (partial, not sufficient)

- **Per-task commits** were added mid-epic (baseline commit before an agentic
  worker; a commit when a TASK reaches DONE). This reduces future accumulation
  but arrived after the damage, and does not isolate a task's own review-loop
  work or verify that upstream contributions survive. RC-1 is only partly
  addressed.
- **Ticket body + lineage** — child tickets now carry their full task breakdown
  and parent metadata. This makes the *task's own* scope legible but does **not**
  inject the epic PRD/tech spec. RC-2 is not addressed.

The remaining work is specified in `aeos-pipeline-integrity-tech-spec.md`.
