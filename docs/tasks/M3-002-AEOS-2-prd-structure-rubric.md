# Task: Run AEOS-2 — PRD Structure Rubric (`prd-structure.md`)

**Milestone:** M3 — PM Agent (Product Scoping Column)
**Agent:** — (dogfood pipeline ticket)
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces the first rubric in the library. `prd-structure.md` defines the structural criteria the reviewer applies when evaluating PRD artifacts. Getting this right is the primary quality dial for the PM agent output. Too narrow → false rejections. Too permissive → bad PRDs pass. Requires AEOS-1 (`pm-agent.yaml`) to exist.

## What needs to be done
1. Create ticket: `aeos ticket create "PRD structure rubric"` → AEOS-2
2. Fill in `.aeos/AEOS-2-ticket.md`:
   - Goal: produce `prd-structure.md` — a rubric the reviewer uses to evaluate PRDs
   - The rubric must cover: problem statement clarity, user persona definition, success metrics measurability, scope (in/out), acceptance criteria testability
   - Format: each criterion has a name, description of what PASS/WARN/FAIL looks like
3. Run: `aeos ticket run AEOS-2`
4. Review output `prd-structure.md` — test it mentally against a hypothetical bad PRD; does it catch the issues?
5. `aeos ticket approve AEOS-2`

## Acceptance Criteria
- [ ] Given `aeos ticket run AEOS-2`, when complete, then `AEOS-2-prd-structure.md` exists in `.aeos/`
- [ ] Given `prd-structure.md`, when reviewing, then it contains ≥ 5 named rubric criteria
- [ ] Given each criterion, when reading, then PASS/WARN/FAIL definitions are present and unambiguous
- [ ] Given the reviewer output, when reading conclusion, then APPROVED or APPROVED_WITH_WARNINGS

## Out of Scope
- PRD template (AEOS-3)
- Intent drift rubric (AEOS-4)
- Wiring the rubric into the column spec (done when column spec is updated to reference the rubric path)

## Dependencies
- M3-001: AEOS-1 complete (`pm-agent.yaml` exists)
- M2 harness: fully operational

## Definition of Done
- [ ] AEOS-2 ticket reaches DONE
- [ ] `prd-structure.md` committed with ≥ 5 criteria
- [ ] Rubric path added to `PRODUCT_SCOPING.yaml` column spec under `reviewerRubrics`
- [ ] Reviewer conclusion: APPROVED or APPROVED_WITH_WARNINGS
