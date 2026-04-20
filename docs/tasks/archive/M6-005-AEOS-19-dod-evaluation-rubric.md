# Task: Implement AEOS-19 — DoD Evaluation Rubric (`dod-evaluation.md`)

**Milestone:** M6 — QA Agent + DoD Gate
**Agent:** prompt-engineering
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces `dod-evaluation.md` — the rubric the DoD Gate uses to confirm a ticket is truly DONE. Unlike column rubrics which evaluate individual artifacts, this rubric is holistic: it checks that the entire pipeline run has produced a coherent, complete body of work. This is the final automated quality check before human approval.

## What needs to be done
0. Ensure `.aeos/rubrics/dod/` directory exists (create it if it does not)
1. Create `.aeos/rubrics/dod/dod-evaluation.md` — a holistic DoD rubric
2. The rubric must cover: all required worker artifacts present (ticket, prd, spike, tech-spec, implementation-notes, code-review, qa-report); optionally verify reviewer sign-off artifacts exist for each column, all column reviewers approved (no unresolved FAILs), QA recommendation is READY FOR DOD, no open questions in any artifact, implementation matches original ticket intent
3. Format: named criteria with PASS/FAIL definitions only (no WARN — DoD is binary)
4. Validate against a hypothetical incomplete pipeline run to confirm it catches the gap
5. Add rubric path to `dod-gate.yaml` column spec under `reviewerRubrics`

## Acceptance Criteria
- [ ] `.aeos/rubrics/dod/` directory exists
- [ ] `dod-evaluation.md` exists at `.aeos/rubrics/dod/dod-evaluation.md`
- [ ] It contains ≥ 5 criteria including artifact completeness check
- [ ] All criteria are binary PASS/FAIL (no WARN)
- [ ] Rubric path added to `dod-gate.yaml` column spec under `reviewerRubrics`
- [ ] Validated against a hypothetical incomplete pipeline run (e.g. missing QA report, unresolved reviewer FAIL) — at least one criterion triggers FAIL

## Out of Scope
- DoD Gate CLI command (AEOS-20)
- DOD_GATE workflow design is owned by AEOS-15. This task produces the rubric content only.

## Dependencies
- M6-000b: `dod-gate.yaml` column spec exists (provides `reviewerRubrics` array to update)
- M6-001: AEOS-15 complete (confirms DOD_GATE rubric consumption pattern)

## Technical Notes / Hints
- Confirm with AEOS-15 design output how `ticket-dod-approve` (M6-006) locates the DoD rubric —
  via `dod-gate.yaml` `reviewerRubrics` or via a dedicated configuration path.
- The `dod-gate.yaml` column spec is a placeholder for the human-controlled DOD_GATE column.
  `workerAgentFile` and `reviewerAgentFile` are required by `ColumnSpecSchema` but are not
  used by the human-approval flow.

## Definition of Done
- [ ] `dod-evaluation.md` committed with ≥ 5 binary criteria
- [ ] Rubric path added to `dod-gate.yaml` column spec under `reviewerRubrics`
