# Task: Run AEOS-15 — DEPLOY Column Design (DoD Gate Flow + QA Context Scope)

**Milestone:** M6 — QA Agent + DoD Gate
**Agent:** — (dogfood pipeline ticket)
**Method:** Dogfood — run through AEOS pipeline

## Context
The DEPLOY columns (QA → DoD Gate) are partially designed as of action plan authoring. AEOS-15 completes the design before any M6 implementation tickets run. This is a design/architecture ticket that produces a spec document — not code directly.

## What needs to be done
1. Create ticket: `aeos ticket create "DEPLOY column design — DoD Gate flow and QA context scope"` → AEOS-15
2. Fill in `.aeos/AEOS-15-ticket.md`:
   - Goal: produce a complete design spec for the QA and DoD Gate columns
   - QA context scope: what artifacts does the QA agent read? (implementation-notes + code review + original ticket)
   - DoD Gate: how does the human approval CLI flow work? (`aeos ticket dod-approve <id>` or inline in `aeos ticket run`?)
   - DoD criteria: what constitutes DONE beyond reviewer sign-off? (all artifacts present, all rubrics passed, human explicitly approved)
3. Run: `aeos ticket run AEOS-15`
4. Review: does the design answer all open questions from the action plan risk register?
5. `aeos ticket approve AEOS-15`

## Acceptance Criteria
- [ ] Given `aeos ticket run AEOS-15`, when complete, then design artifact and review exist
- [ ] Given design artifact, when reading, then QA context scope is fully defined (no open questions)
- [ ] Given design artifact, when reading, then DoD Gate human approval UX is specified (CLI command, prompts, outputs)
- [ ] Given reviewer output, then APPROVED or APPROVED_WITH_WARNINGS

## Out of Scope
- Implementing QA agent or DoD gate (AEOS-16 through AEOS-20)

## Dependencies
- M5b complete: AEOS-13 and AEOS-14 done

## Definition of Done
- [ ] AEOS-15 reaches DONE
- [ ] Design spec committed with no open design questions
- [ ] Reviewer conclusion: APPROVED or APPROVED_WITH_WARNINGS
