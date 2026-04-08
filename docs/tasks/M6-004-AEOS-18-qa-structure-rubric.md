# Task: Run AEOS-18 — QA Structure Rubric (`qa-report-structure.md`)

**Milestone:** M6 — QA Agent + DoD Gate
**Agent:** — (dogfood pipeline ticket)
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces `qa-report-structure.md` — the reviewer rubric for the QA column. Applied by the reviewer to evaluate QA report artifacts before DoD Gate. A weak rubric here means bad QA reports silently pass to human approval — a critical quality gap.

## What needs to be done
1. Create ticket: `aeos ticket create "QA structure rubric"` → AEOS-18
2. Fill in `.aeos/AEOS-18-ticket.md`:
   - Goal: produce `qa-report-structure.md` rubric criteria
   - Criteria must cover: all implementation notes sections are addressed in the report, edge cases are specific (named, not generic), risk rating is justified with evidence, recommendation is consistent with findings (no "READY FOR DOD" with outstanding criticals), no unfilled template placeholders
   - Format: named criteria with PASS/WARN/FAIL definitions
3. Run: `aeos ticket run AEOS-18`
4. Review: test against a hypothetical QA report that says "READY FOR DOD" despite listing 3 critical gaps
5. `aeos ticket approve AEOS-18`
6. Add to `qa.yaml` column spec `reviewerRubrics`

## Acceptance Criteria
- [ ] Given `aeos ticket run AEOS-18`, when complete, then `AEOS-18-qa-report-structure.md` exists
- [ ] Given rubric, when reviewing, then ≥ 5 criteria including recommendation consistency check
- [ ] Given a hypothetical contradictory report (READY + critical gaps), when applying rubric, then recommendation consistency criterion FAILs
- [ ] Given reviewer output, then APPROVED or APPROVED_WITH_WARNINGS

## Out of Scope
- DoD evaluation rubric (AEOS-19)

## Dependencies
- M6-003: AEOS-17 complete

## Definition of Done
- [ ] AEOS-18 reaches DONE
- [ ] `qa-report-structure.md` committed with ≥ 5 criteria
- [ ] Added to `qa.yaml` column spec `reviewerRubrics`
- [ ] Reviewer conclusion: APPROVED or APPROVED_WITH_WARNINGS
