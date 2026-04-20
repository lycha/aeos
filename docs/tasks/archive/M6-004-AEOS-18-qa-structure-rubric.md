# Task: Implement AEOS-18 — QA Structure Rubric (`qa-report-structure.md`)

**Milestone:** M6 — QA Agent + DoD Gate
**Agent:** prompt-engineering
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces `qa-report-structure.md` — the reviewer rubric for the QA column. Applied by the reviewer to evaluate QA report artifacts before DoD Gate. A weak rubric here means bad QA reports silently pass to human approval — a critical quality gap.

## What needs to be done
1. Ensure `.aeos/rubrics/structure/` directory exists (create it if it does not)
2. Create `.aeos/rubrics/structure/qa-report-structure.md` — a rubric for evaluating QA reports
3. The rubric must cover: all implementation notes sections are addressed in the report, edge cases are specific (named, not generic), risk rating is justified with evidence, recommendation is consistent with findings (no "READY FOR DOD" with outstanding criticals), no unfilled template placeholders
4. Format: named criteria with PASS/WARN/FAIL definitions
5. Validate against a hypothetical contradictory report (READY + critical gaps) — recommendation consistency criterion must FAIL
6. Add rubric path to `qa.yaml` column spec under `reviewerRubrics` as the FIRST entry
   (before `rubrics/drift/intent-drift.md` if already present) to ensure correct pass-1 ordering

## Acceptance Criteria
- [ ] `qa-report-structure.md` exists at `.aeos/rubrics/structure/qa-report-structure.md`
- [ ] It contains ≥ 5 criteria including recommendation consistency check
- [ ] A hypothetical contradictory report (READY + critical gaps) would FAIL the recommendation consistency criterion
- [ ] Rubric path added to `qa.yaml` column spec under `reviewerRubrics`
- [ ] Validated against a hypothetical bad QA report (e.g. missing edge cases, generic risk description) — at least one non-recommendation criterion triggers WARN or FAIL

## Out of Scope
- DoD evaluation rubric (AEOS-19)

## Dependencies
- M6-000: `qa.yaml` column spec exists (provides `reviewerRubrics` array to update)

## Definition of Done
- [ ] `qa-report-structure.md` committed with ≥ 5 criteria
- [ ] Rubric path added to `qa.yaml` column spec under `reviewerRubrics`
