# Task: Spec Review Replaces PRD Drafting

**Milestone:** I1-M3 — Specify
**Plan package:** 3.3
**Agent:** typescript-pro
**Method:** Agentic implementation, test-first
**Size:** M
**Human-owned inputs:** none (decision D3)

## Context
`templates/agents/pm-agent.yaml` tells an agent to "translate a brief ticket description into a comprehensive Product Requirements Document" and, where the ticket is vague, to "make reasonable assumptions". That is the opposite of principle III: for specification a human drafts and an agent reviews the draft for gaps, ambiguity and contradictions.

**D3:** the column `PRODUCT_SCOPING` is renamed `SPEC_REVIEW`.

## What needs to be done
**A. Rename the column.**
1. `Column.PRODUCT_SCOPING` → `Column.SPEC_REVIEW` in `src/domain/model/column.ts` and everywhere it is referenced (`yaml-column-spec-loader.adapter.ts` maps columns to file names and has the most references).
2. Append a migration that rewrites `PRODUCT_SCOPING` to `SPEC_REVIEW` in `tickets.column`, `transitions` (both from and to columns), `cost_records."column"` and anywhere else a column name is stored. Idempotent.
3. Rename `templates/column-specs/product-scoping.yaml` → `spec-review.yaml`. `aeos project sync` must report the old file as obsolete and offer the new one.

**B. Replace the agent.**
1. New `templates/agents/spec-reviewer-agent.yaml`. Its job: read the pinned spec, decisions and scenarios, and report findings. It never rewrites the spec and never proposes requirements. Output `spec-review.md` with sections **Gaps**, **Ambiguities**, **Contradictions**, **Untestable criteria**, each finding citing the `AC-n`, `INV-n` or decision id it concerns, with a severity.
2. New rubric `templates/rubrics/structure/spec-review-structure.md` for the second reviewer: every finding cites an id; no finding proposes a requirement; severities are justified.
3. Delete `pm-agent.yaml`, `rubrics/structure/prd-structure.md` and `rubrics/templates/prd-template.md` from the templates.
4. `spec-review.yaml`: worker `spec-reviewer-agent`, artefact `spec-review.md`, `advanceMode: manual`. The human approval that follows **is the spec gate**.

**C. Epics must be spec-backed.**
1. `ticket create` for an epic without `--spec` is refused, with a message pointing at the three skills that produce a spec.
2. Tasks (`--parent`) and standalone tasks are unaffected.
3. An existing epic that the migration lands in `SPEC_REVIEW` with no pin is set `ESCALATED` with a message explaining it needs a spec; it is not deleted.

**D. Downstream wording.**
1. `architect-agent.yaml`, `integration-reviewer-agent.yaml`, `tech-spec-structure.md`, `intent-drift.md`, `spec-fidelity.md`, `spec-traceability.md`: replace "PRD" with the spec, and point at acceptance criteria by id.
2. `context-assembler.ts` matches the parent's `prd.md` by suffix for `epicContext`. Replace with the pinned spec from I1-M3-002b plus `tech-spec.md`.
3. `aeos-core/README.md` and `CLAUDE.md`: pipeline diagrams, the column table, the quick start.

**E. Stub and tests.** Update the stub, `template-source.test.ts`, `column.test.ts`, `column-pipelines.test.ts` and the end-to-end test.

## Acceptance Criteria
- [ ] Given a fresh project, when listing columns, then `SPEC_REVIEW` exists and `PRODUCT_SCOPING` does not
- [ ] Given a database with tickets, transitions and cost records in `PRODUCT_SCOPING`, when migrated, then all read back as `SPEC_REVIEW`, and running the migration again changes nothing
- [ ] Given `ticket create "X"` with no `--spec` and no `--parent`, when run, then it is refused with guidance
- [ ] Given a spec-backed epic, when `SPEC_REVIEW` runs with the stub, then `spec-review.md` is produced and the ticket is `SIGNED_OFF`
- [ ] Given the templates directory, when searched for "Product Requirements Document", then nothing is found
- [ ] Given a pre-existing epic with no pin, when migrated, then it is `ESCALATED` in `SPEC_REVIEW` with an explanatory message
- [ ] Given a project created before this change, when `aeos project sync` runs, then it reports the obsolete and missing files

## Out of Scope
- Configurable labels and order (I1-M3-006, I1-M4-005a–c)
- Changing `TECH_SPEC`. It stays an agent draft that a person approves.
- Recording the spec gate as a structured record (I1-M3-004)

## Technical Notes / Hints
- **Test the migration on a copy of the real `~/.aeos/state.db` first.** AEOS dogfoods itself and its own project has live tickets.
- The repo did this once before: migration v2 "folds retired `ARCH_SPIKE` tickets into `TECH_SPEC`". Follow that pattern.
- This task touches many files but most edits are mechanical. Keep the rename (A) and the agent swap (B–D) as separate commits so the review can read them apart.

## Layer Mapping
```
Domain:      src/domain/model/column.ts
Application: src/application/ticket-create.use-case.ts, services/context-assembler.ts
Adapters:    src/infrastructure/persistence/database.ts
             src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts
             src/infrastructure/executor/stub-executor.adapter.ts
Templates:   templates/column-specs/spec-review.yaml, agents/spec-reviewer-agent.yaml, rubrics/**
Docs:        aeos-core/README.md, aeos-core/CLAUDE.md
```

## Dependencies
- I1-M3-002b: the spec must be in the context before an agent can review it

## Definition of Done
- [ ] Common Definition of Done in `README.md`
- [ ] Migration run against a copy of the real state database, result noted in the pull request
