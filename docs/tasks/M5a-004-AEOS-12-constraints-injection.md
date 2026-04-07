# Task: Run AEOS-12 — `CONSTRAINTS.md` Injection into Engineer Agent Context

**Milestone:** M5a — Engineer Agent (Implementation Column)
**Agent:** — (dogfood pipeline ticket)
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces the spec and initial `CONSTRAINTS.md` for the AEOS project itself. `CONSTRAINTS.md` is the project-level guardrails file (tech stack, coding conventions, forbidden patterns) that is injected into every engineer agent prompt. Without it, the agent has no project-specific guidance.

## What needs to be done
1. Create ticket: `aeos ticket create "CONSTRAINTS.md injection into engineer-agent context"` → AEOS-12
2. Fill in `.aeos/AEOS-12-ticket.md`:
   - Goal: produce an initial `CONSTRAINTS.md` for the AEOS project and confirm `ContextAssembler` reads it correctly
   - `CONSTRAINTS.md` content should include: language (TypeScript strict ESM), forbidden patterns (`any`, `console.log` in production, sync file I/O in hot paths), test requirements, naming conventions
   - Verify `ContextAssembler` (M2-004) already handles `CONSTRAINTS.md` — if not, update it
3. Run: `aeos ticket run AEOS-12`
4. Review: does the produced `CONSTRAINTS.md` give clear, actionable constraints?
5. `aeos ticket approve AEOS-12`

## Acceptance Criteria
- [ ] Given `aeos ticket run AEOS-12`, when complete, then `AEOS-12-artifact.md` and review exist
- [ ] Given produced `CONSTRAINTS.md`, when reading, then it contains: language constraints, forbidden patterns, test requirements
- [ ] Given `ContextAssembler.assembleContext()` with a project that has `CONSTRAINTS.md`, when calling it, then `constraints` field is non-null
- [ ] Given `buildPrompt()` with non-null constraints, when inspecting the prompt, then `## Constraints` section contains the file content
- [ ] Given reviewer output, then APPROVED or APPROVED_WITH_WARNINGS

## Out of Scope
- Per-column constraints (v2 concern)
- Code structure rubric (AEOS-13)

## Dependencies
- M5a-001 through M5a-003 complete
- M2-004: `ContextAssembler` already reads `CONSTRAINTS.md`

## Definition of Done
- [ ] AEOS-12 reaches DONE
- [ ] `CONSTRAINTS.md` created at project root
- [ ] `ContextAssembler` confirmed to inject constraints into assembled context
- [ ] Exit criteria for M5a: a ticket runs through IMPLEMENTATION producing real `implementation-notes.md` that passes reviewer
