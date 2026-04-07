# Task: Run AEOS-7 — Tech Spec Structure Rubric (`tech-spec-structure.md`)

**Milestone:** M4 — Architect Agent (Architecture Spike + Tech Spec Columns)
**Agent:** — (dogfood pipeline ticket)
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces `tech-spec-structure.md` — the reviewer rubric for the TECH_SPEC column. A tech spec that passes this rubric should give an engineer agent enough to implement without ambiguity. This is the handoff quality gate between PREPARE and DEPLOY columns.

## What needs to be done
1. Create ticket: `aeos ticket create "Tech spec structure rubric"` → AEOS-7
2. Fill in `.aeos/AEOS-7-ticket.md`:
   - Goal: produce `tech-spec-structure.md` with rubric criteria covering: API contract completeness, data model definition, error handling specification, testability (can a QA agent write tests from this spec?), implementation sequencing clarity
   - Format: named criteria with PASS/WARN/FAIL definitions
3. Run: `aeos ticket run AEOS-7`
4. Review: test against a hypothetical incomplete tech spec
5. `aeos ticket approve AEOS-7`
6. Add rubric path to `TECH_SPEC.yaml` column spec `reviewerRubrics`

## Acceptance Criteria
- [ ] Given `aeos ticket run AEOS-7`, when complete, then `AEOS-7-tech-spec-structure.md` exists
- [ ] Given rubric, when reviewing, then ≥ 5 criteria covering API, data model, error handling, testability, sequencing
- [ ] Given reviewer output, then APPROVED or APPROVED_WITH_WARNINGS

## Out of Scope
- Tech spec template (AEOS-8)
- Implementation rubric (AEOS-11)

## Dependencies
- M4-001: AEOS-5 complete

## Definition of Done
- [ ] AEOS-7 reaches DONE
- [ ] `tech-spec-structure.md` committed with ≥ 5 criteria
- [ ] Added to `TECH_SPEC.yaml` column spec `reviewerRubrics`
- [ ] Reviewer conclusion: APPROVED or APPROVED_WITH_WARNINGS
