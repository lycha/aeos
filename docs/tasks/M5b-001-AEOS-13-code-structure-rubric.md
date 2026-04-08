# Task: Run AEOS-13 — Code Structure Rubric (`code-structure.md`)

**Milestone:** M5b — Code Review Column
**Agent:** — (dogfood pipeline ticket)
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces `code-structure.md` — the reviewer rubric for the CODE_REVIEW column. This rubric evaluates a code diff (not a markdown artifact). Key design difference from all prior rubrics: criteria must be applicable to diff content. Requires the diff injection mechanism to be designed (AEOS-14) — but the rubric criteria can be written first.

## What needs to be done
1. Create ticket: `aeos ticket create "Code structure rubric"` → AEOS-13
2. Fill in `.aeos/AEOS-13-ticket.md`:
   - Goal: produce `code-structure.md` — rubric criteria for evaluating code diffs
   - Criteria must cover: TypeScript strict compliance (no `any`, no type assertions without comment), test coverage (new code has tests), adherence to `CONSTRAINTS.md`, no dead code in diff, error handling present, no `console.log` in production paths
   - Format: named criteria with PASS/WARN/FAIL definitions, written to apply to diff content
3. Run: `aeos ticket run AEOS-13`
4. Review: test mentally against a diff that skips error handling
5. `aeos ticket approve AEOS-13`
6. Add to `code-review.yaml` column spec `reviewerRubrics`

## Acceptance Criteria
- [ ] Given `aeos ticket run AEOS-13`, when complete, then `AEOS-13-code-structure.md` exists
- [ ] Given rubric, when reviewing, then ≥ 6 criteria covering types, tests, constraints, error handling, dead code
- [ ] Given a hypothetical diff with no error handling, when applying rubric manually, then at least one FAIL
- [ ] Given reviewer output, then APPROVED or APPROVED_WITH_WARNINGS

## Out of Scope
- Diff injection mechanism (AEOS-14)
- Performance or security rubrics (v2 extensions)

## Dependencies
- M5a complete: AEOS-9 through AEOS-12 done
- CODE_REVIEW column spec bootstrapped

## Definition of Done
- [ ] AEOS-13 reaches DONE
- [ ] `code-structure.md` committed with ≥ 6 criteria
- [ ] Added to `code-review.yaml` column spec `reviewerRubrics`
- [ ] Reviewer conclusion: APPROVED or APPROVED_WITH_WARNINGS
