# Task: Run AEOS-3 — PRD Artifact Template (`prd-template.md`)

**Milestone:** M3 — PM Agent (Product Scoping Column)
**Agent:** — (dogfood pipeline ticket)
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces `prd-template.md` — a structured markdown template injected into the PM agent's prompt via `[OUTPUT FORMAT]`. A good template guides the model toward consistent, reviewer-passable output without over-constraining it.

## What needs to be done
1. Create ticket: `aeos ticket create "PRD artifact template"` → AEOS-3
2. Fill in `.aeos/AEOS-3-ticket.md`:
   - Goal: produce `prd-template.md` — a fill-in-the-blank PRD structure for the PM agent to follow
   - Must include sections matching the criteria in `prd-structure.md` (AEOS-2)
   - Template sections: Problem Statement, User Personas, Success Metrics, Scope (In/Out), Acceptance Criteria, Out of Scope
   - Placeholders should be descriptive: `[Describe the problem in 2–3 sentences]`
3. Run: `aeos ticket run AEOS-3`
4. Review: does the template prompt the writer toward all rubric criteria in AEOS-2?
5. `aeos ticket approve AEOS-3`

## Acceptance Criteria
- [ ] Given `aeos ticket run AEOS-3`, when complete, then `AEOS-3-prd-template.md` exists in `.aeos/`
- [ ] Given `prd-template.md`, when comparing with `prd-structure.md` criteria, then every rubric criterion has a corresponding template section
- [ ] Given `prd-template.md`, when reading placeholders, then they are descriptive (not just `[PLACEHOLDER]`)
- [ ] Given reviewer output, when reading conclusion, then APPROVED or APPROVED_WITH_WARNINGS

## Out of Scope
- Intent drift rubric (AEOS-4)
- Wiring template into `pm-agent.yaml` outputFormat (done as a follow-up edit after AEOS-3 is approved)

## Dependencies
- M3-002: AEOS-2 complete (`prd-structure.md` rubric exists)

## Definition of Done
- [ ] AEOS-3 ticket reaches DONE
- [ ] `prd-template.md` committed with all required sections
- [ ] `pm-agent.yaml` `outputFormat` updated to reference `prd-template.md`
- [ ] Reviewer conclusion: APPROVED or APPROVED_WITH_WARNINGS
