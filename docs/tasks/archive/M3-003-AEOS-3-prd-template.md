# Task: Implement AEOS-3 — PRD Artifact Template (`prd-template.md`)

**Milestone:** M3 — PM Agent (Product Scoping Column)
**Agent:** prompt-engineering
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces `prd-template.md` — a structured markdown template injected into the PM agent's prompt via `[OUTPUT FORMAT]`. A good template guides the model toward consistent, reviewer-passable output without over-constraining it.

> **⚠️ Implementation note — `outputFormat` resolution gap:**
> The current `PromptBuilder` treats the `outputFormat` field as inline text, not a file path. There is no template file loading mechanism in the codebase. Setting `outputFormat` to a file path (e.g., `rubrics/templates/prd-template.md`) will inject the literal path string into the prompt, not the template content. Until a template resolver is implemented (see prerequisite dependency below), the full template content must be inlined as a multi-line YAML string in the `pm-agent.yaml` `outputFormat` field.

## What needs to be done
1. Ensure the `.aeos/rubrics/templates/` directory exists (create it if not already scaffolded)
2. Create `.aeos/rubrics/templates/prd-template.md` — a fill-in-the-blank PRD structure for the PM agent to follow
3. Must include sections matching the criteria in `prd-structure.md` (AEOS-2)
4. Template sections: Problem Statement, User Personas, Success Metrics, Scope (In/Out), Acceptance Criteria, Out of Scope
5. Placeholders should be descriptive: `[Describe the problem in 2–3 sentences]`
6. Verify the template prompts the writer toward all rubric criteria in AEOS-2
7. Update `pm-agent.yaml` `outputFormat` to contain the full template content as an inline multi-line YAML string (since `PromptBuilder` treats `outputFormat` as literal text, not a file path)

## Acceptance Criteria
- [ ] `prd-template.md` exists at `.aeos/rubrics/templates/prd-template.md`
- [ ] Comparing with `prd-structure.md` criteria, every rubric criterion has a corresponding template section
- [ ] Placeholders are descriptive (not just `[PLACEHOLDER]`)
- [ ] `pm-agent.yaml` `outputFormat` contains the full template content inlined as a multi-line YAML string

## Out of Scope
- Intent drift rubric (AEOS-4)
- Building a template file resolver for `outputFormat` (tracked separately)

## Dependencies
- M3-001: AEOS-1 complete (`pm-agent.yaml` exists at `.aeos/agents/pm-agent.yaml`)
- M3-002: AEOS-2 complete (`prd-structure.md` rubric exists)
- Prerequisite (not yet scheduled): template file resolution mechanism — a task to add `TemplateLoader` support so `outputFormat` can reference a file path instead of inlining content (analogous to `FsRubricLoader`). Until this is built, template content must be inlined in agent YAML.
- Note: the `.aeos/rubrics/templates/` directory is not scaffolded by any existing task; step 1 addresses this locally. A broader scaffolding task is recommended (see M3-002 review F-1).

## Definition of Done
- [ ] `prd-template.md` committed at `.aeos/rubrics/templates/prd-template.md` with all required sections
- [ ] `pm-agent.yaml` `outputFormat` updated with inlined template content
