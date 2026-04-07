# Task: Run AEOS-6 — Architecture Spike Template (`spike-template.md`)

**Milestone:** M4 — Architect Agent (Architecture Spike + Tech Spec Columns)
**Agent:** — (dogfood pipeline ticket)
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces `spike-template.md` — the output format template for the ARCH_SPIKE column. Injected into the architect agent's `[OUTPUT FORMAT]` section. A good spike template focuses the agent on answering specific technical questions rather than producing a generic architecture document.

## What needs to be done
1. Create ticket: `aeos ticket create "Architecture spike template"` → AEOS-6
2. Fill in `.aeos/AEOS-6-ticket.md`:
   - Goal: produce `spike-template.md` with sections: Decision Drivers, Options Considered (≥ 2), Tradeoff Analysis, Recommendation, Open Questions
   - Each section should have descriptive placeholder text guiding the architect agent
3. Run: `aeos ticket run AEOS-6`
4. Review: does the template produce output that would let a tech spec author proceed without ambiguity?
5. `aeos ticket approve AEOS-6`
6. Update `architect-agent.yaml` `outputFormat` to reference `spike-template.md` for ARCH_SPIKE column

## Acceptance Criteria
- [ ] Given `aeos ticket run AEOS-6`, when complete, then `AEOS-6-spike-template.md` exists
- [ ] Given `spike-template.md`, when reviewing, then all 5 sections are present with descriptive placeholders
- [ ] Given reviewer output, then APPROVED or APPROVED_WITH_WARNINGS

## Out of Scope
- Tech spec template (AEOS-8)
- Architecture rubric (not separately defined — covered by tech-spec-structure in AEOS-7)

## Dependencies
- M4-001: AEOS-5 complete (`architect-agent.yaml` exists)

## Definition of Done
- [ ] AEOS-6 reaches DONE
- [ ] `spike-template.md` committed with all 5 sections
- [ ] `architect-agent.yaml` updated to reference template for ARCH_SPIKE
- [ ] Reviewer conclusion: APPROVED or APPROVED_WITH_WARNINGS
