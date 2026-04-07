# Task: Run AEOS-16 — QA Agent System Prompt

**Milestone:** M6 — QA Agent + DoD Gate
**Agent:** — (dogfood pipeline ticket)
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces `qa-agent.yaml` — the agent spec for the QA column. The QA agent reads the implementation notes and code review artifact and produces a QA report identifying test gaps, edge cases, and quality risks. Requires AEOS-15 design spec to define context scope.

## What needs to be done
1. Create ticket: `aeos ticket create "QA agent system prompt"` → AEOS-16
2. Fill in `.aeos/AEOS-16-ticket.md`:
   - Goal: produce `qa-agent.yaml` conforming to `AgentSpecSchema`
   - Context scope (from AEOS-15 design): ticket.md, implementation-notes.md, code-review.md
   - The QA agent identifies: uncovered edge cases, missing error handling tests, integration gaps, any spec deviation found in code review
   - Output: QA report (see AEOS-17 for template)
3. Run: `aeos ticket run AEOS-16`
4. Review `qa-agent.yaml`
5. `aeos ticket approve AEOS-16`

## Acceptance Criteria
- [ ] Given `aeos ticket run AEOS-16`, when complete, then artifact and review exist
- [ ] Given `qa-agent.yaml`, when parsed with `AgentSpecSchema`, then no ZodError
- [ ] Given `systemPrompt`, when reading, then it describes a QA role focused on finding gaps, not approving code
- [ ] Given reviewer output, then APPROVED or APPROVED_WITH_WARNINGS

## Out of Scope
- QA report template (AEOS-17)
- QA structure rubric (AEOS-18)

## Dependencies
- M6-001: AEOS-15 complete (design spec defines QA context scope)

## Definition of Done
- [ ] AEOS-16 reaches DONE
- [ ] `qa-agent.yaml` committed and schema-valid
- [ ] Reviewer conclusion: APPROVED or APPROVED_WITH_WARNINGS
