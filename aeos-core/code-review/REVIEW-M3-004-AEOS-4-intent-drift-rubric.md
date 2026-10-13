# Review — M3-004-AEOS-4 Intent Drift Rubric

**Task:** `docs/tasks/M3-004-AEOS-4-intent-drift-rubric.md`
**Reviewed file:** `.aeos/rubrics/drift/intent-drift.md`
**Date:** 2026-04-08 (re-reviewed after fixes)

---

## Acceptance Criteria

### AC-1: `intent-drift.md` exists at `.aeos/rubrics/drift/intent-drift.md`
**PASS** — File exists at the specified path.

### AC-2: Contains ≥ 4 named criteria covering scope creep, misalignment, and omission
**PASS** — The rubric defines exactly 4 named criteria:
1. **Scope Creep** — covers scope expansion beyond ticket boundaries.
2. **Problem–Solution Alignment** — covers misaligned problem statement / answering a different question.
3. **Stated Deliverable Coverage** — covers omission of the ticket's stated deliverables.
4. **Audience & Context Fidelity** — covers wrong audience or pipeline stage mismatch.

All three required detection areas (scope creep, misalignment, omission) are addressed.

### AC-3: Applied to a hypothetical drifted PRD, at least one criterion FAILs
**PASS** — The "Validation: Hypothetical Drifted Artifact" section applies all 4 criteria to a dark-mode-toggle ticket with a drifted theming-engine PRD. Criteria 1 (Scope Creep) and 3 (Stated Deliverable Coverage) both receive **FAIL** grades with clear rationale, confirming the rubric catches intent drift.

### AC-4: `intent-drift.md` path is present in `reviewerRubrics` of the 6 agent-driven column specs
**PASS** — Verified `rubrics/drift/intent-drift.md` appears under `reviewerRubrics` in all 6 specs:
- `.aeos/column-specs/product-scoping.yaml` ✅
- `.aeos/column-specs/architecture-spike.yaml` ✅
- `.aeos/column-specs/tech-spec.yaml` ✅
- `.aeos/column-specs/implementation.yaml` ✅
- `.aeos/column-specs/code-review.yaml` ✅
- `.aeos/column-specs/qa.yaml` ✅

---

## Definition of Done

### DoD-1: `intent-drift.md` committed with ≥ 4 criteria
**PASS** — File contains 4 criteria, each with PASS/WARN/FAIL definitions in the same tabular format as `prd-structure.md`.

### DoD-2: Path added to `reviewerRubrics` in the 6 agent-driven column specs
**PASS** — Confirmed present in all 6 column specs (see AC-4).

---

## Summary

| # | Criterion | Result |
|---|-----------|--------|
| AC-1 | File exists at correct path | **PASS** |
| AC-2 | ≥ 4 named criteria covering required areas | **PASS** |
| AC-3 | Hypothetical drifted artifact triggers FAIL | **PASS** |
| AC-4 | Path in 6 column-spec `reviewerRubrics` | **PASS** |
| DoD-1 | Committed with ≥ 4 criteria | **PASS** |
| DoD-2 | Path in 6 column specs | **PASS** |

**Overall: PASS — No fixes required.**
