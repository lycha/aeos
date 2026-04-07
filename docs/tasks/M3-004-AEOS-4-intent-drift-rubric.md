# Task: Run AEOS-4 — Intent Drift Rubric (`intent-drift.md`)

**Milestone:** M3 — PM Agent (Product Scoping Column)
**Agent:** — (dogfood pipeline ticket)
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces `intent-drift.md` — a cross-cutting rubric applied by the reviewer in ALL pipeline columns (pass-2). It detects when an artifact answers the wrong question or drifts from the original ticket intent. This rubric is the most important quality safeguard in the system.

## What needs to be done
1. Create ticket: `aeos ticket create "Intent drift rubric"` → AEOS-4
2. Fill in `.aeos/AEOS-4-ticket.md`:
   - Goal: produce `intent-drift.md` — a pass-2 rubric the reviewer applies after column-specific rubrics
   - The rubric must define criteria for detecting: scope creep, misaligned problem statement, answering a different question than asked, omitting the ticket's stated deliverable
   - Format: same as `prd-structure.md` — named criteria with PASS/WARN/FAIL definitions
3. Run: `aeos ticket run AEOS-4`
4. Review: test it against a hypothetical drifted artifact
5. `aeos ticket approve AEOS-4`
6. Add `intent-drift.md` path to `reviewerRubrics` in ALL column specs

## Acceptance Criteria
- [ ] Given `aeos ticket run AEOS-4`, when complete, then `AEOS-4-intent-drift.md` exists
- [ ] Given `intent-drift.md`, when reviewing, then it contains ≥ 4 named criteria covering scope creep, misalignment, and omission
- [ ] Given the rubric applied to a hypothetical drifted PRD (manual test), when evaluating, then at least one criterion FAILs
- [ ] Given reviewer output, when reading conclusion, then APPROVED or APPROVED_WITH_WARNINGS
- [ ] Given all column specs, when inspecting `reviewerRubrics`, then `intent-drift.md` path is present in each

## Out of Scope
- Column-specific rubrics for ARCH_SPIKE, TECH_SPEC, etc. (M4 tickets)

## Dependencies
- M3-001 through M3-003 complete
- M2 harness operational

## Definition of Done
- [ ] AEOS-4 ticket reaches DONE
- [ ] `intent-drift.md` committed with ≥ 4 criteria
- [ ] Path added to `reviewerRubrics` in all existing column specs
- [ ] Reviewer conclusion: APPROVED or APPROVED_WITH_WARNINGS
