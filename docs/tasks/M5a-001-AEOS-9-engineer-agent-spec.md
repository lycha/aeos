# Task: Implement AEOS-9 — Engineer Agent System Prompt and Context Scope

**Milestone:** M5a — Engineer Agent (Implementation Column)
**Agent:** prompt-engineering
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces `engineer-agent.yaml` — the agent spec driving the IMPLEMENTATION and CODE_REVIEW columns. The engineer agent has access to the PRD, spike, tech spec, and CONSTRAINTS.md. It must produce an implementation plan (not code directly) and, in the CODE_REVIEW column, review code diffs.

## What needs to be done
1. Create ticket: `aeos ticket create "Engineer agent system prompt and context scope"` → AEOS-9
2. Fill in `.aeos/tickets/AEOS-9/AEOS-9-ticket.md`:
   - Goal: define the engineer agent's system prompt, context scope, task instruction, output format, and self-verification checklist
   - Output: `engineer-agent.yaml` conforming to `AgentSpecSchema`
3. Create `.aeos/agents/engineer-agent.yaml` conforming to `AgentSpecSchema`
4. Set `name: engineer-agent`, `role: worker`
5. `systemPrompt`: describe reasoning about code structure, dependency management, test coverage, incremental delivery. Embed context scope description (ticket.md, PRD, spike, tech-spec, CONSTRAINTS.md, full codebase index). Context scope is informational — `AgentSpecSchema` does not have a `contextScope` field in v1. Document the intended scope in the `systemPrompt`. The `ContextAssembler` handles actual injection.
6. `taskInstruction`: single multi-line YAML string containing guidance for BOTH columns, separated by clear headers (`### When running in IMPLEMENTATION` / `### When running in CODE_REVIEW`). The `AgentSpecSchema` has one `taskInstruction` field — both are concatenated.
   - IMPLEMENTATION: produce an implementation plan with ordered steps, file changes, and test plan
   - CODE_REVIEW: review code diffs for correctness, style, and alignment with tech spec
7. `outputFormat`: single multi-line YAML string with inline template content for both columns, separated by section headers (`### IMPLEMENTATION output` / `### CODE_REVIEW output`). `PromptBuilder` treats `outputFormat` as inline text, not a file path. M5a-002 and M5b-002 will update this field later.
8. `selfVerificationChecklist`: ≥ 3 items covering plan completeness and spec alignment
9. Set `executor.type: claude-cli`, `executor.model: claude-sonnet-4-20250514`

## Acceptance Criteria
- [ ] `engineer-agent.yaml` exists at `.aeos/agents/engineer-agent.yaml`
- [ ] Parsed with `AgentSpecSchema` — no ZodError
- [ ] `role` is set to `worker`
- [ ] `systemPrompt` describes reasoning about implementation tradeoffs
- [ ] `taskInstruction` contains guidance for both IMPLEMENTATION and CODE_REVIEW columns with clear section headers
- [ ] `outputFormat` contains inline template content for both columns
- [ ] `selfVerificationChecklist` contains ≥ 3 items

## Out of Scope
- Implementation notes template (AEOS-10)
- Implementation structure rubric (AEOS-11)

## Dependencies
- M4 complete (architect agent and templates working)
- M5a-000: `implementation.yaml` column spec (AEOS-9 transits IMPLEMENTATION)
- M5b-000: `code-review.yaml` column spec (engineer agent serves CODE_REVIEW)
- M2-013: `reviewer-agent.yaml` exists

## Definition of Done
- [ ] `engineer-agent.yaml` committed and schema-valid
- [ ] AEOS-9 ticket reaches DONE (transits through pipeline columns successfully)
- [ ] Reviewer agent signs off on the produced artifact

## Technical Notes / Hints
- `AgentSpecSchema` has single `taskInstruction` and `outputFormat` fields. The engineer agent serves two columns (IMPLEMENTATION, CODE_REVIEW). Concatenate both column-specific instructions into one field with section headers.
- `PromptBuilder` treats `outputFormat` as inline text, not a file path. Template content must be inlined as a multi-line YAML string. M5a-002 and M5b-002 will update this field later.
- `context_scope` is not a schema field in v1. Document intended scope in `systemPrompt`. `ContextAssembler` handles actual injection.
- The IMPLEMENTATION (`implementation.yaml`) and CODE_REVIEW (`code-review.yaml`) column specs must exist before AEOS-9 reaches those columns.
