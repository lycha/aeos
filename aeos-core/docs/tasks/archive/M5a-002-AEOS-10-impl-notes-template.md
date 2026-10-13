# Task: Implement AEOS-10 — Implementation Notes Template (`impl-notes-template.md`)

**Milestone:** M5a — Engineer Agent (Implementation Column)
**Agent:** prompt-engineering
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces `impl-notes-template.md` — the output format template for the IMPLEMENTATION column. Injected into the engineer agent's prompt. Structures the implementation plan so downstream agents (code review, QA) can trace every code change back to a tech spec requirement.

> **⚠️ Implementation note — `outputFormat` resolution gap:**
> The current `PromptBuilder` treats the `outputFormat` field as inline text, not a file path.
> There is no template file loading mechanism in the codebase. The full implementation notes
> template content must be inlined as a multi-line YAML string in `engineer-agent.yaml`
> `outputFormat` field under the `### IMPLEMENTATION output` section header (the field is
> shared with CODE_REVIEW output format via M5b-002). Update the IMPLEMENTATION section
> only — do NOT replace the entire `outputFormat` field.

> **Note — filename convention:** The shortened filename `impl-notes-template.md` is used
> instead of the system design's `implementation-notes-template.md` (§5.3) to align with the
> abbreviated convention established by M5a-003 (`impl-structure.md`).

## What needs to be done
1. Create `.aeos/rubrics/templates/impl-notes-template.md` with sections: Summary, Approach & Design Decisions, Requirements Traceability, Files Changed (with rationale per file), Test Plan, Rollback Plan, Open Risks
2. Each section should have descriptive placeholder text
3. Verify the template captures all criteria from `impl-structure.md` (AEOS-11, if already written — otherwise align with expected criteria)
4. Update `engineer-agent.yaml` `outputFormat`: inline the full implementation notes template
   content as a multi-line YAML string under the `### IMPLEMENTATION output` section header.
   The `AgentSpecSchema` has one `outputFormat` field; M5a-001 has already established baseline
   content for both IMPLEMENTATION and CODE_REVIEW columns. Replace ONLY the
   `### IMPLEMENTATION output` section content — do NOT overwrite the CODE_REVIEW section.

## Acceptance Criteria
- [ ] `impl-notes-template.md` exists at `.aeos/rubrics/templates/impl-notes-template.md`
- [ ] All sections present with descriptive placeholders
- [ ] `engineer-agent.yaml` `outputFormat` `### IMPLEMENTATION output` section updated with inlined template content (CODE_REVIEW section preserved)
- [ ] If `impl-structure.md` (AEOS-11) exists, every rubric criterion has a corresponding template section

## Out of Scope
- Implementation structure rubric (AEOS-11) — separate task

## Dependencies
- M5a-001: AEOS-9 complete (`engineer-agent.yaml` exists with baseline `outputFormat`)
- M5a-000: `implementation.yaml` column spec (context for how template is consumed)
- Prerequisite (not yet scheduled): template file resolution mechanism — until built,
  template content must be inlined in agent YAML
- Note: `.aeos/rubrics/templates/` directory not scaffolded by any existing task; create if needed

## Definition of Done
- [ ] `impl-notes-template.md` committed at `.aeos/rubrics/templates/impl-notes-template.md` with all required sections
- [ ] `engineer-agent.yaml` `outputFormat` `### IMPLEMENTATION output` section updated with inlined template content
      (CODE_REVIEW section preserved)
- [ ] All acceptance criteria met
