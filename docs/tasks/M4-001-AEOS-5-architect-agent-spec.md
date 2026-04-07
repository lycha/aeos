# Task: Run AEOS-5 — Architect Agent System Prompt and Context Scope

**Milestone:** M4 — Architect Agent (Architecture Spike + Tech Spec Columns)
**Agent:** — (dogfood pipeline ticket)
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces `architect-agent.yaml` — the agent spec driving both the ARCH_SPIKE and TECH_SPEC columns. The architect agent has access to the PRD (from PRODUCT_SCOPING) and must produce architecture decisions before the tech spec is written.

## What needs to be done
1. Create ticket: `aeos ticket create "Architect agent system prompt and context scope"` → AEOS-5
2. Fill in `.aeos/AEOS-5-ticket.md`:
   - Goal: produce `architect-agent.yaml` conforming to `AgentSpecSchema`
   - The architect agent's context scope: ticket.md, PRD artifact from PRODUCT_SCOPING, CONSTRAINTS.md
   - It must reason about: technology choices, system boundaries, scalability tradeoffs, and testability
   - Output for ARCH_SPIKE column: architecture spike document; for TECH_SPEC: full technical specification
3. Run: `aeos ticket run AEOS-5`
4. Review `architect-agent.yaml`
5. `aeos ticket approve AEOS-5`

## Acceptance Criteria
- [ ] Given `aeos ticket run AEOS-5`, when complete, then `AEOS-5-artifact.md` and review exist in `.aeos/`
- [ ] Given `architect-agent.yaml`, when parsed with `AgentSpecSchema`, then no ZodError
- [ ] Given `systemPrompt`, when reading, then it describes reasoning about architecture tradeoffs explicitly
- [ ] Given `selfVerificationChecklist`, when reading, then ≥ 3 items covering technical correctness and constraint adherence
- [ ] Given reviewer output, then APPROVED or APPROVED_WITH_WARNINGS

## Out of Scope
- Spike template (AEOS-6) and tech spec rubric/template (AEOS-7, AEOS-8)

## Dependencies
- M3 complete (all M3 tickets done, PM agent working)
- ARCH_SPIKE and TECH_SPEC column specs must be bootstrapped (can be stubs at this point)

## Definition of Done
- [ ] AEOS-5 reaches DONE
- [ ] `architect-agent.yaml` committed and schema-valid
- [ ] Reviewer conclusion: APPROVED or APPROVED_WITH_WARNINGS
