# Task: Implement AEOS-6 — Architecture Spike Template (`spike-template.md`)

**Milestone:** M4 — Architect Agent (Architecture Spike + Tech Spec Columns)
**Agent:** prompt-engineering
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces `spike-template.md` — the output format template for the ARCH_SPIKE column. Injected into the architect agent's `[OUTPUT FORMAT]` section. A good spike template focuses the agent on answering specific technical questions rather than producing a generic architecture document.

> **⚠️ Implementation note — `outputFormat` resolution gap:**
> The current `PromptBuilder` treats the `outputFormat` field as inline text, not a file path.
> There is no template file loading mechanism in the codebase. The full spike template content
> must be inlined as a multi-line YAML string in `architect-agent.yaml` `outputFormat` field
> under a `### ARCH_SPIKE output` section header (the field is shared with AEOS-8's
> tech-spec template via concatenation).

## What needs to be done
1. Create `.aeos/rubrics/templates/spike-template.md` with sections: Decision Drivers, Options Considered (≥ 2), Tradeoff Analysis, Recommendation, Open Questions
2. Each section should have descriptive placeholder text guiding the architect agent
3. Verify the template produces output that would let a tech spec author proceed without ambiguity
4. Update `architect-agent.yaml` `outputFormat`: inline the full spike template content as a
   multi-line YAML string under a `### ARCH_SPIKE output` section header. The `AgentSpecSchema`
   has one `outputFormat` field; AEOS-8 will later add a `### TECH_SPEC output` section to
   the same field.

## Acceptance Criteria
- [ ] `spike-template.md` exists at `.aeos/rubrics/templates/spike-template.md`
- [ ] All 5 sections are present with descriptive placeholders
- [ ] `architect-agent.yaml` `outputFormat` contains the spike template content inlined
      under a `### ARCH_SPIKE output` section header

## Out of Scope
- Tech spec template (AEOS-8)
- Spike-specific structure rubric — no spike structure rubric exists by design; there is no task
  in the action plan that produces one. The template sections (Decision Drivers, Options Considered,
  Tradeoff Analysis, Recommendation, Open Questions) are self-standing. The ARCH_SPIKE column's
  `reviewerRubrics` will use the intent-drift rubric (AEOS-4) only, not a structure pass.
  `tech-spec-structure.md` (AEOS-7) evaluates tech specs, not architecture spikes.

## Dependencies
- M4-001: AEOS-5 complete (`architect-agent.yaml` exists)
- M4-000a: `architecture-spike.yaml` column spec (context for how template is consumed)
- Prerequisite (not yet scheduled): template file resolution mechanism — until built,
  template content must be inlined in agent YAML
- Note: `.aeos/rubrics/templates/` directory not scaffolded by any existing task; create if needed

## Definition of Done
- [ ] `spike-template.md` committed with all 5 sections
- [ ] `architect-agent.yaml` `outputFormat` contains the spike template content inlined
      under a `### ARCH_SPIKE output` section header
- [ ] Pipeline run completes successfully with spike template in place
