# Task: Implement AEOS-15 — DEPLOY Phase Column Design (QA + DOD_GATE)

**Milestone:** M6 — QA Agent + DoD Gate
**Agent:** backend-architect
**Method:** Agentic implementation

> **Note:** AEOS-15 runs as a dogfood ticket through the pipeline (BACKLOG → PRODUCT_SCOPING → ARCH_SPIKE). It produces a design document, not code.

## Context
Designs the DEPLOY phase — the final two columns (QA, DOD_GATE) that gate a ticket before it reaches DONE. The QA column produces a quality report. The DOD_GATE column performs a holistic Definition of Done evaluation. This task produces the design document that guides AEOS-16 through AEOS-20.

## What needs to be done
1. Create `.aeos/tickets/AEOS-15/AEOS-15-deploy-phase-design.md` — a design document covering:
   - QA column workflow: what the QA agent receives (all prior artifacts), what it produces (qa-report.md), what the reviewer checks
   - DOD_GATE column workflow: what the DoD agent receives (all artifacts + qa-report), what it produces (dod-evaluation), how human approval works
   - State transitions: QA → DOD_GATE → DONE (with human approval gate)
   - Error flows: what happens when QA rejects, when DoD evaluation fails
   - DOD_GATE sub-state lifecycle: specify how DOD_GATE sub-states differ from the standard column sub-state flow (e.g., how human approval maps to SIGNED_OFF vs. a dedicated sub-state)
2. Specify whether DOD_GATE requires a `dod-gate.yaml` column spec. If yes, define its contents (worker agent, escalation, advance mode) and create a follow-up task (M6-000b). If no, document the alternative and flag M6-005/M6-006 for amendment
3. Validate the design against the system design document (Section 2.2, 5.2)
4. Ensure the design is consistent with existing column spec schema and state machine

## Acceptance Criteria
- [ ] `AEOS-15-deploy-phase-design.md` exists at `.aeos/tickets/AEOS-15/`
- [ ] QA column workflow is fully specified (inputs, outputs, reviewer rubric)
- [ ] DOD_GATE column workflow is fully specified including human approval gate
- [ ] State transitions are consistent with `StateMachineService`
- [ ] Error flows specified for QA rejection and DoD evaluation failure (sendback targets defined)
- [ ] DOD_GATE agent identity specified (new `dod-agent`, repurposed `reviewer-agent`, or human-only)
- [ ] DOD_GATE column spec decision documented (needed or not; if needed, contents specified)
- [ ] DOD_GATE sub-state lifecycle specified (how human approval maps to existing sub-states)

## Out of Scope
- Implementation of QA/DoD agents (AEOS-16, AEOS-19)
- CLI command for DoD approval (AEOS-20)

## Dependencies
- M5b complete

## Definition of Done
- [ ] `AEOS-15-deploy-phase-design.md` committed and reviewed
