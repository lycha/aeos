# Task: Implement AEOS-13 — Code Structure Rubric (`code-structure.md`)

**Milestone:** M5b — Code Review Column
**Agent:** prompt-engineering
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces `code-structure.md` — the reviewer rubric for the CODE_REVIEW column. Applied by the reviewer to evaluate code review artifacts. Must ensure the code review is thorough and catches issues that automated tests might miss.

## What needs to be done
1. Ensure `.aeos/rubrics/structure/` directory exists (create it if it does not)
2. Create `.aeos/rubrics/structure/code-structure.md` — a rubric for evaluating code review artifacts
3. The rubric must cover: diff alignment with tech spec, naming conventions, error handling coverage, test coverage adequacy, no dead code or debug artifacts, dependency changes justified
4. Format: named criteria with PASS/WARN/FAIL definitions
5. Validate against a hypothetical sloppy code review that says "LGTM" with no detail — confirm it FAILs
6. Add rubric path to `code-review.yaml` column spec under `reviewerRubrics` as the FIRST entry
   (before `rubrics/drift/intent-drift.md` if already present) to ensure correct pass-1 ordering

## Acceptance Criteria
- [ ] `code-structure.md` exists at `.aeos/rubrics/structure/code-structure.md`
- [ ] It contains ≥ 5 named rubric criteria
- [ ] Each criterion has PASS/WARN/FAIL definitions
- [ ] Rubric path added to `code-review.yaml` column spec under `reviewerRubrics`
- [ ] Validated against a hypothetical sloppy code review (e.g. "LGTM" with no detail) — at least one criterion triggers WARN or FAIL

## Out of Scope
- Diff injection (AEOS-14)

## Dependencies
- M5b-000: `code-review.yaml` column spec exists (provides `reviewerRubrics` array to update)

## Definition of Done
- [ ] `code-structure.md` committed with ≥ 5 criteria
- [ ] Rubric path added to `code-review.yaml` column spec under `reviewerRubrics`
