# Spec Fidelity Rubric

Applied by the reviewer in **INTEGRATION_REVIEW** to grade the integration
review of an assembled feature. It checks that the review actually verified the
whole feature against the epic's PRD and tech spec — the check that per-task
review structurally cannot perform.

The reviewer applies each criterion independently. Any **FAIL** blocks
advancement; **WARN** must be flagged but does not block. The epic PRD, tech
spec, and the base..HEAD feature diff are all in context.

---

## 1. Decision Trace Completeness

| Grade | Definition |
|-------|------------|
| **PASS** | The integration review traces every load-bearing tech-spec decision (`D-N`) and every PRD acceptance criterion to the assembled diff, marking each present / missing / contradicted with file:line evidence. Nothing load-bearing is left unaddressed. |
| **WARN** | The trace covers most decisions but omits one minor item, or cites evidence loosely. |
| **FAIL** | The review does not trace decisions/criteria to the diff, or asserts the feature is complete without citing where each decision is realized. A spec decision could be silently dropped and this review would not show it. |

---

## 2. Evidence From the Diff, Not the Summaries

| Grade | Definition |
|-------|------------|
| **PASS** | Findings are grounded in the actual feature diff (file:line), not in task summaries or implementation-notes claims. Where a mechanism is claimed but absent from the diff, the review flags the gap. |
| **WARN** | The review mixes diff evidence with unverified summary claims but reaches defensible conclusions. |
| **FAIL** | The review trusts task summaries over the diff — e.g. marks a decision "done" because a task said so, when the diff does not contain it. This is the exact failure that ships lost work. |

---

## 3. Seam & Test-Reality Check

| Grade | Definition |
|-------|------------|
| **PASS** | The review identifies the feature's cross-component seams and states, for each critical one, whether a real (non-mocked) test exercises it. It calls out green suites that mock the very seam a behaviour depends on. |
| **WARN** | Seams are discussed but the mocked-vs-real distinction is not made explicit. |
| **FAIL** | The review treats a passing unit-test suite as proof of integrated behaviour without examining whether the seams are actually exercised. |

---

## 4. Deferred Hand-off Verification

| Grade | Definition |
|-------|------------|
| **PASS** | For every behaviour a task deferred to another ("out of scope, see T-NNN"), the review confirms it is present in the assembled diff, or flags it as implemented by nobody. |
| **WARN** | Deferrals are noted but not all are confirmed present. |
| **FAIL** | Deferred hand-offs are ignored, so a behaviour every task assumed someone else built could be absent with no finding. |

---

## Validation: Hypothetical Weak Integration Review

**Assembled feature:** the score-`id` idempotency mechanism (`D-2`) is absent
from the diff — the real sink drops `id` — but task T-001's summary claims it was
implemented, and the unit suite mocks the sink and asserts `id` was passed.

**Weak review excerpt:**

> All 36 tests pass and every task reports its acceptance criteria met. D-2's
> idempotency is covered by T-001. The feature is faithful to the spec.

| Criterion | Grade | Rationale |
|-----------|-------|-----------|
| 1. Decision Trace Completeness | **FAIL** | D-2 is asserted "covered" with no file:line evidence; the review never checks the diff for the `id` forwarding. |
| 2. Evidence From the Diff | **FAIL** | The conclusion rests on T-001's summary, not the diff — which drops `id`. |
| 3. Seam & Test-Reality Check | **FAIL** | Treats the green suite as proof, missing that the sink seam is mocked. |
| 4. Deferred Hand-off Verification | **WARN** | The T-004→T-001 deferral of id-forwarding is not verified against the diff. |

**Result:** three FAILs — the rubric rejects an integration review that would
have let the STAN-1 defects ship.
