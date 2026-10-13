# Task: Implement AEOS-4 — Intent Drift Rubric (`intent-drift.md`)

**Milestone:** M3 — PM Agent (Product Scoping Column)
**Agent:** prompt-engineering
**Method:** Dogfood — run through AEOS pipeline

## Context
Produces `intent-drift.md` — a cross-cutting rubric applied by the reviewer in ALL pipeline columns (pass-2). It detects when an artifact answers the wrong question or drifts from the original ticket intent. This rubric is the most important quality safeguard in the system.

> **Runtime note:** Until `intent-drift.md` is written to `.aeos/rubrics/drift/intent-drift.md`, the rubric path in column specs will be silently skipped by `FsRubricLoader`. The reviewer will function without drift detection.

## What needs to be done
1. Ensure `.aeos/rubrics/drift/` directory exists (create it if it does not)
2. Create `.aeos/rubrics/drift/intent-drift.md` — a pass-2 rubric the reviewer applies after column-specific rubrics
3. The rubric must define criteria for detecting: scope creep, misaligned problem statement, answering a different question than asked, omitting the ticket's stated deliverable
4. Format: named criteria with PASS/WARN/FAIL definitions (same format as `prd-structure.md`)
5. Validate against a hypothetical drifted artifact to confirm at least one criterion FAILs. For example, given a ticket about "Add dark mode toggle", a drifted PRD that scopes a full theming engine should FAIL the scope creep criterion.
6. Add `rubrics/drift/intent-drift.md` path to `reviewerRubrics` in the following 6 agent-driven column specs:
   - `product-scoping.yaml`
   - `architecture-spike.yaml`
   - `tech-spec.yaml`
   - `implementation.yaml`
   - `code-review.yaml`
   - `qa.yaml`

   > **Note:** `dod-gate.yaml` is excluded because it uses a human-approval flow (no reviewer invocation).

## Acceptance Criteria
- [ ] `intent-drift.md` exists at `.aeos/rubrics/drift/intent-drift.md`
- [ ] It contains ≥ 4 named criteria covering scope creep, misalignment, and omission
- [ ] Applied to a hypothetical drifted PRD, at least one criterion FAILs
- [ ] `intent-drift.md` path is present in `reviewerRubrics` of the 6 agent-driven column specs listed above

## Out of Scope
- Column-specific rubrics for ARCH_SPIKE, TECH_SPEC, etc. (M4 tickets)

## Dependencies
- M3-000 or M2-015: column spec files exist (provides `reviewerRubrics` arrays to update)
- M3-002 recommended (format consistency reference for PASS/WARN/FAIL rubric style)

## Definition of Done
- [ ] `intent-drift.md` committed with ≥ 4 criteria
- [ ] Path added to `reviewerRubrics` in the 6 agent-driven column specs (`product-scoping.yaml`, `architecture-spike.yaml`, `tech-spec.yaml`, `implementation.yaml`, `code-review.yaml`, `qa.yaml`)
