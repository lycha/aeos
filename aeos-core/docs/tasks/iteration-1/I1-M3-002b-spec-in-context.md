# Task: The Pinned Spec in Every Prompt

**Milestone:** I1-M3 — Specify
**Plan package:** 3.2 (part 2 of 2)
**Agent:** typescript-pro
**Method:** Agentic implementation, test-first
**Size:** M
**Human-owned inputs:** none

## Context
After I1-M3-002a an epic knows which spec it is built against. Agents still do not see it. `ContextAssembler` (`src/application/services/context-assembler.ts`) builds `AssembledContext` from the ticket, settled decisions, prior artefacts, the parent epic's PRD and tech spec (`epicContext`), constraints and a code diff. This task adds the spec, read at the pinned commit so a later edit cannot change what an in-flight run sees.

## What needs to be done
1. **Model.** Add `spec: PriorArtifact[]` and `specPin: { repo, commit, path } | null` to `AssembledContext`.
2. **Assemble.** For a spec-backed ticket (own pin or the parent epic's), read at the pinned commit with `gitGateway.showFile`:
   - `spec.md`
   - `decisions.yaml`
   - every `features/*.feature`
   - `contexts/<context>/glossary.md` and `contexts/<context>/CONSTRAINTS.md` when the spec's front matter or `decisions.yaml` `meta` names a context
3. **Never read the working tree for these.** If the pinned commit cannot be read, fail the run with a clear error; do not fall back.
4. **Prompt.** In `prompt-builder.ts` render a `## Specification (pinned <repo>@<short commit>)` section before prior artefacts, with a one-line instruction: the spec is authoritative; where it is silent, raise a preflight question; do not invent behaviour.
5. **Constraints.** Concatenate `.aeos/CONSTRAINTS.md` and the context's constraints, project-wide first.
6. **Tasks.** A child task receives the spec plus the parent's tech spec. Extend the existing `epicContext` logic; do not duplicate it.
7. **Size.** Feature files can be long. Give the reviewer the full spec; give a task worker the full `spec.md` and only the scenarios tagged with criteria the task claims, once I1-M4-001 adds claims. Until then pass all scenarios.
8. Tickets with no pin behave exactly as today.

## Acceptance Criteria
- [ ] Given a spec-backed epic, when a column's prompt is built, then it contains `spec.md` as it was at the pinned commit
- [ ] Given `spec.md` edited and committed after pinning, when a prompt is built, then it still contains the pinned text
- [ ] Given a child task, when its prompt is built, then it contains the parent epic's pinned spec
- [ ] Given a pin whose commit does not exist, when a run starts, then it fails with an error naming the commit
- [ ] Given a ticket with no pin, when a prompt is built, then it is byte-identical to today's
- [ ] Given both a project and a context `CONSTRAINTS.md`, when assembled, then both appear, project-wide first

## Out of Scope
- Removing the PRD (I1-M3-003)
- Filtering scenarios by claimed criteria (comes with I1-M4-001)

## Technical Notes / Hints
- `prompt-builder.test.ts` and `context-assembler.test.ts` have snapshot-style expectations. The "byte-identical" criterion protects them.
- The brief saved by I1-M1-003 will now contain the spec. That is intended: the brief is the record of what the agent was told.

## Layer Mapping
```
Model:       src/domain/model/assembled-context.ts
Application: src/application/services/context-assembler.ts, prompt-builder.ts
Port:        src/domain/ports/driven/git-gateway.port.ts (showFile, from 002a)
```

## Dependencies
- I1-M3-002a

## Definition of Done
- [ ] Common Definition of Done in `README.md`
