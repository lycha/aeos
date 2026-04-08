# Task: Implement AEOS-2 — PRD Structure Rubric (`prd-structure.md`)

**Milestone:** M3 — PM Agent (Product Scoping Column)
**Agent:** — (dogfood pipeline ticket)
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces the first rubric in the library. `prd-structure.md` defines the structural criteria the reviewer applies when evaluating PRD artifacts. Getting this right is the primary quality dial for the PM agent output. Too narrow → false rejections. Too permissive → bad PRDs pass.

## What needs to be done
1. Ensure `.aeos/rubrics/structure/` directory exists (create it if it does not)
2. Create `.aeos/rubrics/structure/prd-structure.md` — a rubric the reviewer uses to evaluate PRDs
3. The rubric must cover: problem statement clarity, user persona definition, success metrics measurability, scope (in/out), acceptance criteria testability
4. Format: each criterion has a name, description of what PASS/WARN/FAIL looks like
5. Validate the rubric against a hypothetical bad PRD to confirm it catches issues
6. Add rubric path to `product-scoping.yaml` column spec under `reviewerRubrics`

## Acceptance Criteria
- [ ] `prd-structure.md` exists at `.aeos/rubrics/structure/prd-structure.md`
- [ ] It contains ≥ 5 named rubric criteria
- [ ] Each criterion has PASS/WARN/FAIL definitions that are present and unambiguous
- [ ] Rubric path added to `product-scoping.yaml` column spec under `reviewerRubrics`
- [ ] Validated against a hypothetical bad PRD — at least one criterion triggers WARN or FAIL

## Out of Scope
- PRD template (AEOS-3)
- Intent drift rubric (AEOS-4)

## Dependencies
- M3-000: `product-scoping.yaml` column spec exists (provides `reviewerRubrics` array to update)

## Definition of Done
- [ ] `prd-structure.md` committed with ≥ 5 criteria
- [ ] Rubric path added to `product-scoping.yaml` column spec under `reviewerRubrics`
