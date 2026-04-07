# Task: Run AEOS-17 — QA Report Template (`qa-report-template.md`)

**Milestone:** M6 — QA Agent + DoD Gate
**Agent:** — (dogfood pipeline ticket)
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces `qa-report-template.md` — the structured output format for QA column artifacts. Must be actionable enough that an operator reading it knows exactly what needs to be fixed before DoD Gate approval.

## What needs to be done
1. Create ticket: `aeos ticket create "QA report template"` → AEOS-17
2. Fill in `.aeos/AEOS-17-ticket.md`:
   - Goal: produce `qa-report-template.md`
   - Required sections: Summary, Test Coverage Assessment, Edge Cases Not Covered, Integration Gaps, Spec Deviations Found, Risk Rating (Low/Medium/High), Recommendation (READY FOR DOD / NEEDS FIXES)
   - Placeholders should prompt the QA agent to be specific (list actual test names, not "tests should be added")
3. Run: `aeos ticket run AEOS-17`
4. Review: would an operator reading this report know exactly what to do next?
5. `aeos ticket approve AEOS-17`
6. Update `qa-agent.yaml` `outputFormat` to reference this template

## Acceptance Criteria
- [ ] Given `aeos ticket run AEOS-17`, when complete, then `AEOS-17-qa-report-template.md` exists
- [ ] Given template, when reviewing, then all 7 required sections are present
- [ ] Given "Recommendation" section, when reading, then it requires one of exactly: READY FOR DOD / NEEDS FIXES
- [ ] Given reviewer output, then APPROVED or APPROVED_WITH_WARNINGS

## Out of Scope
- QA structure rubric (AEOS-18)
- DoD evaluation rubric (AEOS-19)

## Dependencies
- M6-002: AEOS-16 complete (`qa-agent.yaml` exists)

## Definition of Done
- [ ] AEOS-17 reaches DONE
- [ ] `qa-report-template.md` committed with all 7 sections
- [ ] `qa-agent.yaml` `outputFormat` updated to reference template
- [ ] Reviewer conclusion: APPROVED or APPROVED_WITH_WARNINGS
