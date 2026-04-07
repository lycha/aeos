# Task: Run AEOS-9 — Engineer Agent System Prompt and Context Scope

**Milestone:** M5a — Engineer Agent (Implementation Column)
**Agent:** — (dogfood pipeline ticket)
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces `engineer-agent.yaml` — the agent spec driving the IMPLEMENTATION column. The engineer agent reads the full PREPARE column output (PRD + spike + tech spec) and produces an `implementation-notes.md` plan. The reviewer evaluates the plan, not code.

## What needs to be done
1. Create ticket: `aeos ticket create "Engineer agent system prompt and context scope"` → AEOS-9
2. Fill in `.aeos/AEOS-9-ticket.md`:
   - Goal: produce `engineer-agent.yaml` conforming to `AgentSpecSchema`
   - Context scope: ticket.md, prd.md, spike.md, tech-spec.md, CONSTRAINTS.md
   - The engineer agent produces implementation notes — a coding plan, not code itself
   - Must reason about: implementation sequence, edge cases, testing approach, dependencies
3. Run: `aeos ticket run AEOS-9`
4. Review `engineer-agent.yaml`
5. `aeos ticket approve AEOS-9`

## Acceptance Criteria
- [ ] Given `aeos ticket run AEOS-9`, when complete, then artifact and review exist in `.aeos/`
- [ ] Given `engineer-agent.yaml`, when parsed with `AgentSpecSchema`, then no ZodError
- [ ] Given `systemPrompt`, when reading, then it emphasises planning over execution and testability
- [ ] Given `selfVerificationChecklist`, when reading, then ≥ 3 items checking completeness of the implementation plan
- [ ] Given reviewer output, then APPROVED or APPROVED_WITH_WARNINGS

## Out of Scope
- Implementation notes template (AEOS-10)
- Implementation structure rubric (AEOS-11)
- CONSTRAINTS.md injection mechanism (AEOS-12)

## Dependencies
- M4 complete: AEOS-5 through AEOS-8 done
- IMPLEMENTATION column spec bootstrapped

## Definition of Done
- [ ] AEOS-9 reaches DONE
- [ ] `engineer-agent.yaml` committed and schema-valid
- [ ] Reviewer conclusion: APPROVED or APPROVED_WITH_WARNINGS
