# Task: Run AEOS-10 — Implementation Notes Template (`implementation-notes-template.md`)

**Milestone:** M5a — Engineer Agent (Implementation Column)
**Agent:** — (dogfood pipeline ticket)
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces `implementation-notes-template.md` — the structured output format the engineer agent uses when producing `implementation-notes.md`. Must be detailed enough to give a code-writing model complete guidance.

## What needs to be done
1. Create ticket: `aeos ticket create "Implementation notes template"` → AEOS-10
2. Fill in `.aeos/AEOS-10-ticket.md`:
   - Goal: produce `implementation-notes-template.md`
   - Required sections: Summary, Files to Create/Modify (with paths), Implementation Steps (ordered), Edge Cases and Error Handling, Testing Approach, Definition of Done
   - Placeholders should guide specificity: `[List each file with its purpose and key changes]`
3. Run: `aeos ticket run AEOS-10`
4. Review: given this template, could a code-writing model produce correct, testable code?
5. `aeos ticket approve AEOS-10`
6. Update `engineer-agent.yaml` `outputFormat` to reference this template

## Acceptance Criteria
- [ ] Given `aeos ticket run AEOS-10`, when complete, then `AEOS-10-impl-notes-template.md` exists
- [ ] Given template, when reviewing, then all 6 required sections are present
- [ ] Given "Files to Create/Modify" section, when reading, then it expects file paths to be listed
- [ ] Given reviewer output, then APPROVED or APPROVED_WITH_WARNINGS

## Out of Scope
- Implementation structure rubric (AEOS-11)
- Actual implementation (code review comes after this column)

## Dependencies
- M5a-001: AEOS-9 complete (`engineer-agent.yaml` exists)

## Definition of Done
- [ ] AEOS-10 reaches DONE
- [ ] `implementation-notes-template.md` committed with all 6 sections
- [ ] `engineer-agent.yaml` `outputFormat` updated to reference template
- [ ] Reviewer conclusion: APPROVED or APPROVED_WITH_WARNINGS
