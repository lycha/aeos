# Task: Implement AEOS-11 — Implementation Structure Rubric (`impl-structure.md`)

**Milestone:** M5a — Engineer Agent (Implementation Column)
**Agent:** prompt-engineering
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces `impl-structure.md` — the reviewer rubric for the IMPLEMENTATION column. Applied by the reviewer to evaluate implementation notes artifacts before advancement to CODE_REVIEW. Must ensure every code change is traceable to a tech spec requirement and that the test plan is adequate.

## What needs to be done
1. Ensure `.aeos/rubrics/structure/` directory exists (create it if it does not)
2. Create `.aeos/rubrics/structure/impl-structure.md` — a rubric for evaluating implementation notes
3. The rubric must cover: all tech spec requirements addressed, file changes are justified, test plan covers happy path and error cases, rollback plan exists, no orphan changes (code not traced to a requirement)
4. Format: named criteria with PASS/WARN/FAIL definitions
5. Validate against a hypothetical incomplete implementation plan (e.g. missing test plan) to confirm it catches the gap
6. Add rubric path to `implementation.yaml` column spec under `reviewerRubrics` as the FIRST entry
   (before `rubrics/drift/intent-drift.md` if already present) to ensure correct pass-1 ordering

## Acceptance Criteria
- [ ] `impl-structure.md` exists at `.aeos/rubrics/structure/impl-structure.md`
- [ ] It contains ≥ 5 named rubric criteria
- [ ] Each criterion has PASS/WARN/FAIL definitions
- [ ] Rubric path added to `implementation.yaml` column spec under `reviewerRubrics`
- [ ] Validated against a hypothetical incomplete implementation plan (e.g. missing test plan) — at least one criterion triggers WARN or FAIL

## Out of Scope
- CONSTRAINTS.md injection (AEOS-12)
- Code structure rubric for CODE_REVIEW (AEOS-13)
- Approach / design decision quality (evaluated informally via rubric criteria, not as a separate gate)

## Dependencies
- M5a-000: `implementation.yaml` column spec exists (provides `reviewerRubrics` array to update)

## Definition of Done
- [ ] `impl-structure.md` committed with ≥ 5 criteria
- [ ] Rubric path added to `implementation.yaml` column spec under `reviewerRubrics`
