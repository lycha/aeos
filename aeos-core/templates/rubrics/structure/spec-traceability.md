# Spec Traceability Rubric

Applied by the reviewer in **TASK_BREAKDOWN**, after the structural rubric and
before intent drift. It checks that the task breakdown is a faithful
decomposition of the epic's **tech spec** — not just of the ticket — and that no
task silently contradicts a load-bearing spec decision.

This rubric exists because a breakdown that drifts from the spec propagates that
drift into every child task, and each per-task review (which sees only its own
diff) cannot catch it. The breakdown is the last place the whole feature is in
view before code is written.

The reviewer applies each criterion independently. Any **FAIL** blocks
advancement; **WARN** must be flagged but does not block. The tech spec is
supplied as a prior artifact — cite decision identifiers (e.g. `D-6`, `§4.1`)
when grading.

---

## 1. Decision Coverage

Every numbered decision and load-bearing requirement in the tech spec is realized
by at least one task.

| Grade | Definition |
|-------|------------|
| **PASS** | Each tech-spec decision (`D-N`) and each numbered section that implies work maps to one or more tasks. The breakdown's coverage table names the decision/section for every task and leaves no spec decision unimplemented. |
| **WARN** | Coverage is largely complete but one minor decision is unmapped or only implied, without a stated reason. |
| **FAIL** | A load-bearing spec decision has no task implementing it (e.g. the spec's idempotency mechanism is never assigned to a task), so the assembled feature will be missing behavior the spec requires. |

---

## 2. No Decision Contradiction

No task contradicts a decision the tech spec settled.

| Grade | Definition |
|-------|------------|
| **PASS** | Every task is consistent with the spec's decisions. Where a task must diverge, it is explicitly labeled a **deviation**, states which decision it overrides, and flags it for sign-off — it is not silently baked in. |
| **WARN** | A task diverges from a non-load-bearing detail without labeling it, but the divergence is minor and does not undermine a decision's intent. |
| **FAIL** | A task silently implements the opposite of a settled decision (e.g. the spec chose `response_url` + `replace_original` under `D-6`, but a task specifies `chat.update` with stored `channel`+`ts`; or the spec rejected denormalized columns under `D-9.1`, but a task adds them). Unlabeled contradiction of a load-bearing decision is always FAIL. |

---

## 3. Cross-Task Dependency Integrity

Behavior one task defers to another is actually assigned to that other task.

| Grade | Definition |
|-------|------------|
| **PASS** | Every `Depends on:` and every "out of scope — see T-NNN" hand-off names a real sibling task whose scope genuinely includes the deferred behavior. The dependency ordering is acyclic and stated. |
| **WARN** | A dependency is named but its ordering or exact boundary is ambiguous, though the deferred behavior is assigned somewhere. |
| **FAIL** | A task defers behavior to a task that does not exist or whose scope does not include it, so the deferred behavior would be implemented by nobody (e.g. `feedback.ts` defers id-forwarding to T-001, but no task owns forwarding it in the sink). |

---

## Validation: Hypothetical Drifted Breakdown

**Tech spec decisions:** `D-2` deterministic score `id` for idempotent upsert;
`D-6` update the answer via `response_url` + `replace_original`; `D-9.1` reject
denormalized Slack columns, look up by `question_id`.

**Drifted breakdown excerpt:**

> - T-004: implement `feedback.ts`; compute the score `id` but forwarding it to
>   the sink is out of scope here (see T-001).
> - T-003: add `slack_team_id / slack_channel_id / slack_message_ts` columns to
>   support a `chat.update` fallback.

| Criterion | Grade | Rationale |
|-----------|-------|-----------|
| 1. Decision Coverage | **WARN** | `D-2`'s upsert is referenced but forwarding is deferred to T-001 — acceptable only if T-001 actually owns it (see criterion 3). |
| 2. No Decision Contradiction | **FAIL** | T-003 adds the denormalized columns `D-9.1` rejected, and the `chat.update` fallback contradicts `D-6`'s `response_url` decision — both unlabeled. |
| 3. Cross-Task Dependency Integrity | **FAIL** | T-004 defers id-forwarding to T-001; if T-001's scope does not cover forwarding in the sink, the behavior is owned by nobody. |

**Result:** Criteria 2 and 3 trigger FAIL — the rubric catches the exact drift
that shipped in STAN-1.
