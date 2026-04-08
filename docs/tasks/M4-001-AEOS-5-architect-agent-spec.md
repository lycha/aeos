# Task: Implement AEOS-5 — Architect Agent System Prompt and Context Scope

**Milestone:** M4 — Architect Agent (Architecture Spike + Tech Spec Columns)
**Agent:** prompt-engineering
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces `architect-agent.yaml` — the agent spec driving both the ARCH_SPIKE and TECH_SPEC columns. The architect agent has access to the PRD (from PRODUCT_SCOPING) and must produce architecture decisions before the tech spec is written.

## What needs to be done
1. Create ticket: `aeos ticket create "Architect agent system prompt and context scope"` → AEOS-5
2. Fill in `.aeos/tickets/AEOS-5/AEOS-5-ticket.md`:
   - Goal: define the architect agent's system prompt, context scope, task instruction, output format, and self-verification checklist
   - Output: `architect-agent.yaml` conforming to `AgentSpecSchema`
3. Create `.aeos/agents/architect-agent.yaml` conforming to `AgentSpecSchema`
4. Set `role: worker`
5. `taskInstruction`: single multi-line YAML string containing guidance for BOTH columns, separated by clear headers (`### When running in ARCH_SPIKE` / `### When running in TECH_SPEC`). The `AgentSpecSchema` has one `taskInstruction` field — both are concatenated.
6. `systemPrompt`: describe reasoning about technology choices, system boundaries, scalability tradeoffs, testability. Embed context scope description (ticket.md, PRD, CONSTRAINTS.md, codebase index). Context scope is informational — `AgentSpecSchema` does not have a `contextScope` field in v1. Document the intended scope in the `systemPrompt`. The `ContextAssembler` handles actual injection.
7. `outputFormat`: single multi-line YAML string with inline template content. The `AgentSpecSchema` has one `outputFormat` field — concatenate both column-specific templates with section headers (`### ARCH_SPIKE output` / `### TECH_SPEC output`). `PromptBuilder` treats `outputFormat` as inline text, not a file path. AEOS-6 and AEOS-8 will update this field later.
8. `selfVerificationChecklist`: ≥ 3 items covering technical correctness and constraint adherence
9. Set `executor.type: claude-cli`, `executor.model: claude-sonnet-4-20250514`

## Acceptance Criteria
- [ ] `architect-agent.yaml` exists at `.aeos/agents/architect-agent.yaml`
- [ ] Parsed with `AgentSpecSchema` — no ZodError
- [ ] `role` is set to `worker`
- [ ] `systemPrompt` describes reasoning about architecture tradeoffs explicitly
- [ ] `taskInstruction` contains guidance for both ARCH_SPIKE and TECH_SPEC columns with clear section headers
- [ ] `outputFormat` contains inline template content for both columns
- [ ] `selfVerificationChecklist` contains ≥ 3 items covering technical correctness and constraint adherence

## Out of Scope
- Spike template (AEOS-6) and tech spec rubric/template (AEOS-7, AEOS-8)

## Dependencies
- M3 complete (all M3 tickets done, PM agent working)
- M4-000a: `architecture-spike.yaml` column spec (AEOS-5 transits ARCH_SPIKE)
- M4-000b: `tech-spec.yaml` column spec (AEOS-5 transits TECH_SPEC)
- M2-013: `reviewer-agent.yaml` exists

## Technical Notes / Hints
- `AgentSpecSchema` has single `taskInstruction` and `outputFormat` fields. The architect agent serves two columns (ARCH_SPIKE, TECH_SPEC). Concatenate both column-specific instructions into one field with section headers.
- `PromptBuilder` treats `outputFormat` as inline text, not a file path. Template content must be inlined as a multi-line YAML string. AEOS-6 and AEOS-8 will update this field later.
- `context_scope` is not a schema field in v1. Document intended scope in `systemPrompt`. `ContextAssembler` handles actual injection.
- The ARCH_SPIKE (`architecture-spike.yaml`) and TECH_SPEC (`tech-spec.yaml`) column specs must exist before AEOS-5 reaches those columns.

## Definition of Done
- [ ] `architect-agent.yaml` committed and schema-valid
- [ ] AEOS-5 ticket reaches DONE (transits through pipeline columns successfully)
- [ ] Reviewer agent signs off on the produced artifact
