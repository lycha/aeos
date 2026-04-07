# Task: Run AEOS-19 — DoD Evaluation Rubric (`dod-evaluation.md`)

**Milestone:** M6 — QA Agent + DoD Gate
**Agent:** — (dogfood pipeline ticket)
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces `dod-evaluation.md` — the rubric the DoD Gate uses to confirm a ticket is truly DONE. Unlike column rubrics which evaluate individual artifacts, this rubric is holistic: it checks that the entire pipeline run has produced a coherent, complete body of work. This is the final automated quality check before human approval.

## What needs to be done
1. Create ticket: `aeos ticket create "DoD evaluation rubric"` → AEOS-19
2. Fill in `.aeos/AEOS-19-ticket.md`:
   - Goal: produce `dod-evaluation.md` — a holistic DoD rubric
   - Criteria must cover: all required artifacts present (ticket, prd, spike, tech-spec, impl-notes, code-review, qa-report), all column reviewers approved (no unresolved FAILs), QA recommendation is READY FOR DOD, no open questions in any artifact, implementation matches original ticket intent
   - Format: named criteria with PASS/FAIL (no WARN at DoD — it's binary)
3. Run: `aeos ticket run AEOS-19`
4. Review
5. `aeos ticket approve AEOS-19`
6. Add to `DOD_GATE.yaml` column spec `reviewerRubrics`

## Acceptance Criteria
- [ ] Given `aeos ticket run AEOS-19`, when complete, then `AEOS-19-dod-evaluation.md` exists
- [ ] Given rubric, when reviewing, then ≥ 5 criteria including artifact completeness check
- [ ] Given rubric, when reviewing, then all criteria are binary PASS/FAIL (no WARN)
- [ ] Given reviewer output, then APPROVED or APPROVED_WITH_WARNINGS

## Out of Scope
- DoD Gate CLI command (AEOS-20)

## Dependencies
- M6-004: AEOS-18 complete

## Definition of Done
- [ ] AEOS-19 reaches DONE
- [ ] `dod-evaluation.md` committed with ≥ 5 binary criteria
- [ ] Added to `DOD_GATE.yaml` column spec `reviewerRubrics`
- [ ] Reviewer conclusion: APPROVED or APPROVED_WITH_WARNINGS
