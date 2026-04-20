# Task: Implement AEOS-16 — QA Agent System Prompt and Context Scope

**Milestone:** M6 — QA Agent + DoD Gate
**Agent:** prompt-engineering
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces `qa-agent.yaml` — the agent spec driving the QA column. The QA agent has access to ALL prior artifacts (ticket, PRD, spike, tech-spec, implementation notes, code review) and must produce a comprehensive quality assessment. Its output is the last agent-produced artifact before human approval.

## What needs to be done
1. Create ticket: `aeos ticket create "QA Agent system prompt and context scope"` → AEOS-16
2. Fill in `.aeos/tickets/AEOS-16/AEOS-16-ticket.md`:
   - Goal: define the QA agent's system prompt, context scope, task instruction, output format, and self-verification checklist
   - Output: `qa-agent.yaml` conforming to `AgentSpecSchema`
3. Create `.aeos/agents/qa-agent.yaml` conforming to `AgentSpecSchema`
4. Set `name: qa-agent`, `role: worker`
5. `systemPrompt`: describe reasoning about requirement coverage, edge case identification, risk assessment, readiness for production. Embed context scope description (ticket.md, PRD, spike, tech-spec, implementation notes, code review artifact, CONSTRAINTS.md, full codebase index). Context scope is informational — `AgentSpecSchema` does not have a `contextScope` field in v1. Document the intended scope in the `systemPrompt`. The `ContextAssembler` handles actual injection.
6. `taskInstruction`: analyse all artifacts holistically, cross-check implementation against PRD requirements, identify gaps, produce a QA report with risk-rated findings and a READY/NOT READY recommendation
7. `outputFormat`: multi-line YAML string with inline placeholder template describing expected QA report sections (Executive Summary, Requirements Coverage, Edge Cases & Risks, Findings, Recommendation). `PromptBuilder` treats `outputFormat` as inline text, not a file path. M6-003 (AEOS-17) will update this field with the full template content.
8. `selfVerificationChecklist`: ≥ 3 items covering cross-artifact consistency and recommendation justification
9. Set `executor.type: claude-cli`, `executor.model: claude-sonnet-4-20250514`

## Acceptance Criteria
- [ ] `qa-agent.yaml` exists at `.aeos/agents/qa-agent.yaml`
- [ ] Parsed with `AgentSpecSchema` — no ZodError
- [ ] `role` is set to `worker`
- [ ] `systemPrompt` describes holistic quality assessment reasoning
- [ ] `taskInstruction` covers cross-artifact analysis and QA report production
- [ ] `outputFormat` contains inline placeholder template content
- [ ] `selfVerificationChecklist` contains ≥ 3 items

## Out of Scope
- QA report template (AEOS-17)
- QA structure rubric (AEOS-18)

## Dependencies
- M6-001: AEOS-15 complete (deploy phase design)
- M6-000: `qa.yaml` column spec exists (references qa-agent.yaml)
- M2-013: `reviewer-agent.yaml` exists

## Technical Notes / Hints
- `AgentSpecSchema` has no `contextScope` field in v1. Document intended scope in `systemPrompt`. `ContextAssembler` handles actual injection.
- `PromptBuilder` treats `outputFormat` as inline text, not a file path. Template content must be inlined as a multi-line YAML string. M6-003 (AEOS-17) will update this field later.
- The QA column spec (`qa.yaml`) must exist before AEOS-16 output can be tested in the QA column.
- Unlike `architect-agent` and `engineer-agent`, the QA agent serves a single column (QA). No dual-column concatenation is needed for `taskInstruction` or `outputFormat`.

## Definition of Done
- [ ] `qa-agent.yaml` committed and schema-valid
- [ ] AEOS-16 ticket reaches DONE (transits through pipeline columns successfully)
- [ ] Reviewer agent signs off on the produced artifact
