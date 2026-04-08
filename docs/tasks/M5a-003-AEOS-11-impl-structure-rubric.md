# Task: Run AEOS-11 — Implementation Structure Rubric

**Milestone:** M5a — Engineer Agent (Implementation Column)
**Agent:** — (dogfood pipeline ticket)
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces the reviewer pass-1 rubric for the IMPLEMENTATION column. The reviewer evaluates implementation notes (a plan), not code. The rubric must distinguish between a vague plan (FAIL) and a precise, actionable plan (PASS).

## What needs to be done
1. Create ticket: `aeos ticket create "Implementation structure rubric"` → AEOS-11
2. Fill in `.aeos/AEOS-11-ticket.md`:
   - Goal: produce `implementation-structure.md` rubric
   - Criteria must cover: all tech spec requirements addressed, file-level specificity (not just "update the service"), error handling planned, testing approach described, no hand-wavy language like "implement as needed"
   - Format: named criteria with PASS/WARN/FAIL definitions
3. Run: `aeos ticket run AEOS-11`
4. Review: test against a vague implementation note to confirm it would FAIL
5. `aeos ticket approve AEOS-11`
6. Add to `implementation.yaml` column spec `reviewerRubrics`

## Acceptance Criteria
- [ ] Given `aeos ticket run AEOS-11`, when complete, then `AEOS-11-implementation-structure.md` exists
- [ ] Given rubric, when reviewing, then ≥ 5 criteria including file-specificity and error handling
- [ ] Given a hypothetical vague plan (manual test), when applying rubric, then at least one FAIL is triggered
- [ ] Given reviewer output, then APPROVED or APPROVED_WITH_WARNINGS

## Out of Scope
- Code quality rubric (AEOS-13 — that applies to CODE_REVIEW column)

## Dependencies
- M5a-002: AEOS-10 complete

## Definition of Done
- [ ] AEOS-11 reaches DONE
- [ ] `implementation-structure.md` committed with ≥ 5 criteria
- [ ] Added to `implementation.yaml` column spec
- [ ] Reviewer conclusion: APPROVED or APPROVED_WITH_WARNINGS
