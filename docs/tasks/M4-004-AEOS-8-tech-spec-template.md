# Task: Run AEOS-8 — Tech Spec Artifact Template (`tech-spec-template.md`)

**Milestone:** M4 — Architect Agent (Architecture Spike + Tech Spec Columns)
**Agent:** — (dogfood pipeline ticket)
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces `tech-spec-template.md` — the output format template for the TECH_SPEC column. Must align with the rubric criteria in `tech-spec-structure.md` (AEOS-7). The template is injected into the architect agent's `[OUTPUT FORMAT]` section for the TECH_SPEC column.

## What needs to be done
1. Create ticket: `aeos ticket create "Tech spec artifact template"` → AEOS-8
2. Fill in `.aeos/AEOS-8-ticket.md`:
   - Goal: produce `tech-spec-template.md` with sections matching `tech-spec-structure.md` criteria
   - Required sections: Overview, API Contract (endpoints/signatures), Data Model, Error Handling, Implementation Sequence, Open Questions
   - Placeholders must be specific enough to guide the architect agent without being over-prescriptive
3. Run: `aeos ticket run AEOS-8`
4. Review: compare template sections against rubric criteria — every criterion must have a corresponding template section
5. `aeos ticket approve AEOS-8`
6. Update `architect-agent.yaml` `outputFormat` for TECH_SPEC column to reference this template

## Acceptance Criteria
- [ ] Given `aeos ticket run AEOS-8`, when complete, then `AEOS-8-tech-spec-template.md` exists
- [ ] Given template, when comparing with `tech-spec-structure.md`, then every rubric criterion maps to a template section
- [ ] Given reviewer output, then APPROVED or APPROVED_WITH_WARNINGS
- [ ] Given `architect-agent.yaml`, when updated, then `outputFormat` references `tech-spec-template.md` for TECH_SPEC

## Out of Scope
- Engineer agent spec (AEOS-9)
- Implementation notes template (AEOS-10)

## Dependencies
- M4-003: AEOS-7 complete (`tech-spec-structure.md` rubric exists)

## Definition of Done
- [ ] AEOS-8 reaches DONE
- [ ] `tech-spec-template.md` committed with all required sections
- [ ] `architect-agent.yaml` updated for TECH_SPEC column output format
- [ ] Reviewer conclusion: APPROVED or APPROVED_WITH_WARNINGS
- [ ] Exit criteria for M4 verified: a ticket can flow BACKLOG → PRODUCT_SCOPING → ARCH_SPIKE → TECH_SPEC with real artifacts
