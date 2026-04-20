# Task: Implement AEOS-17 — QA Report Template (`qa-report-template.md`)

**Milestone:** M6 — QA Agent + DoD Gate
**Agent:** prompt-engineering
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces `qa-report-template.md` — the output format template for the QA column. Injected into the QA agent's prompt. Structures the QA report so reviewers and human operators can quickly assess readiness. The QA report is the key input to the DoD Gate.

> **⚠️ Implementation note — `outputFormat` resolution gap:**
> The current `PromptBuilder` treats the `outputFormat` field as inline text, not a file path.
> There is no template file loading mechanism in the codebase. The full QA report template
> content must be inlined as a multi-line YAML string in `qa-agent.yaml` `outputFormat` field.
> The QA agent serves a single column (QA), so the entire `outputFormat` field can be
> replaced — no concatenation with other column output formats is needed (unlike
> `architect-agent.yaml` or `engineer-agent.yaml`).

## What needs to be done
1. Ensure the `.aeos/rubrics/templates/` directory exists (create it if not already scaffolded)
2. Create `.aeos/rubrics/templates/qa-report-template.md` with sections: Executive Summary,
   Requirements Coverage Matrix, Edge Cases & Risk Assessment (with severity ratings),
   Test Results Summary, Findings (risk-rated), Recommendation (READY FOR DOD / NOT READY —
   with justification)
3. Each section should have descriptive placeholder text
4. Verify the template aligns with `qa-report-structure.md` criteria (AEOS-18, if written —
   otherwise design for expected criteria)
5. Update `qa-agent.yaml` `outputFormat`: inline the full QA report template content as a
   multi-line YAML string. `PromptBuilder` treats `outputFormat` as inline text, not a file
   path. The QA agent serves a single column — replace the entire `outputFormat` field.

## Acceptance Criteria
- [ ] `qa-report-template.md` exists at `.aeos/rubrics/templates/qa-report-template.md`
- [ ] All sections present with descriptive placeholders
- [ ] Recommendation section requires explicit READY/NOT READY with justification
- [ ] `qa-agent.yaml` `outputFormat` contains the full QA report template content inlined
      as a multi-line YAML string
- [ ] If `qa-report-structure.md` (AEOS-18) exists, every rubric criterion has a
      corresponding template section

## Out of Scope
- QA structure rubric (AEOS-18)

## Dependencies
- M6-002: AEOS-16 complete (`qa-agent.yaml` exists with baseline `outputFormat`)
- M6-000: `qa.yaml` column spec (context for how template is consumed)
- Prerequisite (not yet scheduled): template file resolution mechanism — until built,
  template content must be inlined in agent YAML
- Note: `.aeos/rubrics/templates/` directory not scaffolded by any existing task; create if needed

## Definition of Done
- [ ] `qa-report-template.md` committed at `.aeos/rubrics/templates/qa-report-template.md`
      with all required sections
- [ ] `qa-agent.yaml` `outputFormat` updated with inlined template content
- [ ] All acceptance criteria met

## Technical Notes / Hints
- `PromptBuilder` treats `outputFormat` as inline text, not a file path. Template content
  must be inlined as a multi-line YAML string.
- The QA agent serves a single column (QA). No dual-column concatenation needed — the
  entire `outputFormat` field can be replaced (unlike `architect-agent.yaml` or
  `engineer-agent.yaml`).
- The QA column spec (`qa.yaml`, M6-000) provides column-level context for how this
  template is consumed.
- `.aeos/rubrics/templates/` directory is not scaffolded by `project init`; create if needed.
- M6-002 (AEOS-16, amended) establishes a baseline `outputFormat` in `qa-agent.yaml`.
  M6-003 replaces this baseline with the full template content.
