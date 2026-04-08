# Task: Implement AEOS-7 — Tech Spec Structure Rubric (`tech-spec-structure.md`)

**Milestone:** M4 — Architect Agent (Architecture Spike + Tech Spec Columns)
**Agent:** prompt-engineering
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces `tech-spec-structure.md` — the reviewer rubric for the TECH_SPEC column. Applied to evaluate tech spec artifacts before advancement to IMPLEMENTATION. Must ensure technical specs are implementable and complete.

## What needs to be done
1. Ensure `.aeos/rubrics/structure/` directory exists (create it if it does not)
2. Create `.aeos/rubrics/structure/tech-spec-structure.md` — a rubric the reviewer uses to evaluate tech specs
3. The rubric must cover: component diagram or module list, API contracts (endpoints, schemas), data model changes, error handling strategy, dependency declarations, test strategy outline
4. Format: named criteria with PASS/WARN/FAIL definitions
5. Validate against a hypothetical vague tech spec to confirm it catches gaps
6. Add rubric path to `tech-spec.yaml` column spec under `reviewerRubrics`

## Acceptance Criteria
- [ ] `tech-spec-structure.md` exists at `.aeos/rubrics/structure/tech-spec-structure.md`
- [ ] It contains ≥ 5 named rubric criteria
- [ ] Each criterion has PASS/WARN/FAIL definitions
- [ ] Rubric path added to `tech-spec.yaml` column spec under `reviewerRubrics`
- [ ] Validated against a hypothetical vague tech spec — at least one criterion triggers WARN or FAIL

## Out of Scope
- Tech spec template (AEOS-8) — separate task
- ADR coverage — handled by ARCH_SPIKE column (spike template decisions); tech spec rubric covers implementation-level concerns

## Dependencies
- M4-000b: `tech-spec.yaml` column spec exists (provides `reviewerRubrics` array to update)

## Definition of Done
- [ ] `tech-spec-structure.md` committed with ≥ 5 criteria
- [ ] Rubric path added to `tech-spec.yaml` column spec under `reviewerRubrics`
