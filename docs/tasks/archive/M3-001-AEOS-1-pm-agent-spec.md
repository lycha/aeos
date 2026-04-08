# Task: Run AEOS-1 — PM Agent System Prompt and Context Scope

**Milestone:** M3 — PM Agent (Product Scoping Column)
**Agent:** — (dogfood pipeline ticket)
**Method:** Dogfood — run through AEOS pipeline

## Context
First real pipeline ticket. Produces `pm-agent.yaml` — the agent spec that drives the PRODUCT_SCOPING column. All subsequent PRD runs depend on this spec being high quality. The reviewer uses `reviewer-agent.yaml` (M2-013) to evaluate the output.

## What needs to be done
1. Create ticket: `aeos ticket create "PM Agent system prompt and context scope"` → AEOS-1
2. Fill in the ticket description in `.aeos/AEOS-1-ticket.md`:
   - Goal: define the PM agent's system prompt, context scope, task instruction, output format, and self-verification checklist
   - Output artifact: `pm-agent.yaml` conforming to `AgentSpecSchema`
   - Context the PM agent needs: ticket.md, CONSTRAINTS.md, no prior artifacts at this stage
3. Run: `aeos ticket run AEOS-1` (uses PRODUCT_SCOPING column spec — must be created manually first as the stub spec for M3 bootstrapping)
4. Review the output `pm-agent.yaml` — does it define a PM agent that would write a good PRD?
5. Iterate on the ticket description if needed (diagnose per Artifact Failure Diagnostic before touching the spec)
6. `aeos ticket approve AEOS-1` when satisfied

## Acceptance Criteria
- [ ] Given `aeos ticket run AEOS-1`, when it completes, then `AEOS-1-prd.md` and `AEOS-1-review.md` are written to `.aeos/`
- [ ] Given `pm-agent.yaml`, when parsed with `AgentSpecSchema`, then no ZodError is thrown
- [ ] Given `pm-agent.yaml`, when reviewing, then `systemPrompt` describes a PM role focused on user value and clarity
- [ ] Given `pm-agent.yaml`, when reviewing, then `selfVerificationChecklist` contains ≥ 3 testable items
- [ ] Given the reviewer output `AEOS-1-review.md`, when reading, then conclusion is APPROVED or APPROVED_WITH_WARNINGS

## Out of Scope
- PRD template (AEOS-3)
- PRD structure rubric (AEOS-2)
- Running a real PRD (that requires AEOS-1–4 complete)

## Technical Notes / Hints
- The PRODUCT_SCOPING column spec must exist before this ticket can run. Bootstrap it manually with `outputArtifact: pm-agent.yaml`, `minWordCount: 200`, `requiredSections: [systemPrompt, taskInstruction, outputFormat]`
- If the reviewer rejects: fix the rubric first (if it's a rubric issue), then re-run. Do not hand-edit the output artifact.

## Dependencies
- M2 complete: full harness operational
- M2-013: `reviewer-agent.yaml` exists
- Bootstrap: `PRODUCT_SCOPING.yaml` column spec (manual stub for M3)

## Definition of Done
- [ ] AEOS-1 ticket reaches DONE (BACKLOG → PRODUCT_SCOPING → SIGNED_OFF → approved)
- [ ] `pm-agent.yaml` committed to `.aeos/.git`
- [ ] `pm-agent.yaml` passes `AgentSpecSchema` validation
- [ ] Reviewer conclusion: APPROVED or APPROVED_WITH_WARNINGS
