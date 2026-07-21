# DoD Evaluation Rubric

Holistic Definition of Done (DoD) rubric used by the DoD Gate to confirm a ticket is truly DONE.
Unlike column rubrics which evaluate individual artifacts, this rubric checks that the entire
pipeline run has produced a coherent, complete body of work. All criteria are **binary PASS/FAIL** —
the DoD Gate does not allow partial credit.

---

## 1. Artifact Completeness

Verifies that every required worker artifact has been produced by the pipeline.

**Required artifacts:** ticket, prd, spike, tech-spec, implementation-notes, code-review, qa-report.

| Grade | Definition |
|-------|------------|
| **PASS** | All 7 required worker artifacts exist in the ticket's artifact directory. Each artifact is non-empty and contains substantive content (not just a template header or placeholder text). |
| **FAIL** | One or more required worker artifacts are missing, empty, or contain only unfilled template placeholders. |

---

## 2. Reviewer Sign-Off Completeness

Verifies that reviewer sign-off artifacts exist for every column that has a reviewer pass.

| Grade | Definition |
|-------|------------|
| **PASS** | A reviewer sign-off artifact exists for each agent-driven column (PRODUCT_SCOPING, TECH_SPEC, TASK_BREAKDOWN, IMPLEMENTATION, CODE_REVIEW, QA). Each sign-off artifact contains a clear verdict (PASS or equivalent approval). |
| **FAIL** | One or more columns are missing a reviewer sign-off artifact, or a sign-off artifact exists but contains an unresolved FAIL verdict. Any column with an outstanding reviewer FAIL blocks the DoD Gate. |

---

## 3. QA Recommendation Status

Verifies that the QA column's final recommendation supports advancement to DoD.

| Grade | Definition |
|-------|------------|
| **PASS** | The QA report's Recommendation section contains an explicit "READY FOR DOD" verdict with supporting justification. No critical or high-severity findings remain unresolved in the QA report. |
| **FAIL** | The QA report's Recommendation is "NOT READY", is missing, or contains unresolved critical/high-severity findings that contradict a "READY FOR DOD" verdict. |

---

## 4. Open Questions Resolution

Verifies that no open questions remain unresolved across any artifact in the pipeline.

| Grade | Definition |
|-------|------------|
| **PASS** | No artifact contains unresolved open questions, TODOs marked as blocking, or "TBD" placeholders in decision-critical sections. All preflight questions (if any were raised) have documented answers. |
| **FAIL** | One or more artifacts contain unresolved open questions, blocking TODOs, or "TBD" placeholders in sections that affect implementation decisions. Preflight questions were raised but not answered. |

---

## 5. Ticket Intent Alignment

Verifies that the body of work produced by the pipeline matches the original ticket's stated intent and scope.

| Grade | Definition |
|-------|------------|
| **PASS** | The implementation notes and code review confirm that the work delivered matches the ticket's original requirements. The PRD's acceptance criteria are addressed in the QA report. No significant scope additions or omissions are present relative to the ticket description. |
| **FAIL** | The delivered work diverges from the ticket's original intent — either by implementing something materially different, omitting stated deliverables, or adding significant unscoped work that was not approved via a scope change. |

---

## 6. Cross-Artifact Consistency

Verifies that artifacts produced across different pipeline columns are internally consistent and do not contradict each other.

| Grade | Definition |
|-------|------------|
| **PASS** | Key decisions (architecture choices, API contracts, data models, error handling strategies) are consistent across the spike, tech-spec, implementation-notes, and code-review artifacts. The QA report's test coverage aligns with the tech-spec's test strategy. No artifact contradicts a decision documented in an earlier artifact without an explicit rationale for the change. |
| **FAIL** | Artifacts contain contradictory decisions — e.g., the tech-spec specifies REST but the implementation uses GraphQL without documented justification; the spike recommends approach A but the implementation follows approach B with no rationale; the QA report tests requirements not present in the PRD. |

---

## Validation: Hypothetical Incomplete Pipeline Run

The following hypothetical pipeline state is evaluated against the rubric to confirm gap detection:

> **Ticket:** AEOS-99 — Add user notification preferences
>
> **Pipeline state:**
> - ticket: ✅ exists
> - prd: ✅ exists, approved by reviewer
> - spike: ✅ exists, approved by reviewer
> - tech-spec: ✅ exists, approved by reviewer
> - implementation-notes: ✅ exists, approved by reviewer
> - code-review: ✅ exists, reviewer verdict: **FAIL** (unresolved finding: missing error handling for notification delivery failures)
> - qa-report: ❌ **missing** — QA agent has not run
>
> **Additional issues:**
> - The tech-spec contains an open question: "TBD: decide between WebSocket and SSE for real-time delivery"
> - The implementation-notes describe a polling approach, contradicting the tech-spec which specifies push-based delivery

| Criterion | Grade | Rationale |
|-----------|-------|-----------|
| 1. Artifact Completeness | **FAIL** | qa-report is missing. Only 6 of 7 required artifacts are present. |
| 2. Reviewer Sign-Off Completeness | **FAIL** | The code-review column has an unresolved FAIL verdict from its reviewer. |
| 3. QA Recommendation Status | **FAIL** | No QA report exists, so no "READY FOR DOD" recommendation is present. |
| 4. Open Questions Resolution | **FAIL** | The tech-spec contains a "TBD" placeholder for a critical architectural decision (delivery mechanism). |
| 5. Ticket Intent Alignment | **PASS** | The work described (notification preferences) aligns with the ticket's stated intent. No scope divergence detected. |
| 6. Cross-Artifact Consistency | **FAIL** | The tech-spec specifies push-based delivery but the implementation-notes describe polling — a contradictory architectural decision with no documented rationale. |

**Result:** 5 of 6 criteria trigger FAIL, confirming the rubric catches an incomplete and inconsistent pipeline run. The single PASS (criterion 5) correctly identifies that the work intent is aligned despite execution gaps.
