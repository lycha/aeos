# Task: Implement AEOS-8 — Tech Spec Template (`tech-spec-template.md`)

**Milestone:** M4 — Architect Agent (Architecture Spike + Tech Spec Columns)
**Agent:** prompt-engineering
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces `tech-spec-template.md` — the output format template for the TECH_SPEC column. Injected into the architect agent's `[OUTPUT FORMAT]` section when running in the TECH_SPEC column. Must produce output that gives engineers everything they need to start coding.

> **⚠️ Implementation note — `outputFormat` resolution gap:**
> The current `PromptBuilder` treats the `outputFormat` field as inline text, not a file path.
> There is no template file loading mechanism in the codebase. The full tech-spec template
> content must be inlined as a multi-line YAML string in `architect-agent.yaml` `outputFormat`
> field under a `### TECH_SPEC output` section header (the field is shared with AEOS-6's
> spike template via concatenation under `### ARCH_SPIKE output`).

## What needs to be done
1. Create `.aeos/rubrics/templates/tech-spec-template.md` with sections: Overview, Component Architecture, API Contracts, Data Model, Error Handling, Dependencies, Test Strategy, Migration Plan
2. Each section should have descriptive placeholder text
3. Verify the template aligns with all criteria in `tech-spec-structure.md` (AEOS-7)
4. Update `architect-agent.yaml` `outputFormat`: inline the full tech-spec template content as a
   multi-line YAML string under a `### TECH_SPEC output` section header. The `AgentSpecSchema`
   has one `outputFormat` field; AEOS-6 has already added spike template content under
   `### ARCH_SPIKE output`. Append the tech-spec template — do NOT replace the existing content.

## Acceptance Criteria
- [ ] `tech-spec-template.md` exists at `.aeos/rubrics/templates/tech-spec-template.md`
- [ ] All sections match the criteria in `tech-spec-structure.md`
- [ ] Placeholders are descriptive (not generic)
- [ ] `architect-agent.yaml` updated to reference template for TECH_SPEC
- [ ] Every criterion in `tech-spec-structure.md` (AEOS-7) has a corresponding template section

## Out of Scope
- IMPLEMENTATION column templates (AEOS-10)

## Dependencies
- M4-003: AEOS-7 complete (`tech-spec-structure.md` rubric exists)
- M4-001: AEOS-5 complete (`architect-agent.yaml` exists — step 4 updates this file)
- M4-002: AEOS-6 complete (spike template already in `outputFormat` — step 4 must append, not replace)
- M4-000b: `tech-spec.yaml` column spec (context for how template is consumed)
- Prerequisite (not yet scheduled): template file resolution mechanism — until built,
  template content must be inlined in agent YAML
- Note: `.aeos/rubrics/templates/` directory not scaffolded by any existing task; create if needed

## Definition of Done
- [ ] `tech-spec-template.md` committed at `.aeos/rubrics/templates/tech-spec-template.md` with all required sections
- [ ] `architect-agent.yaml` `outputFormat` contains the tech-spec template content inlined
      under a `### TECH_SPEC output` section header (appended to existing ARCH_SPIKE content)
- [ ] All acceptance criteria met
