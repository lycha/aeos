# Task: Implement AEOS-12 — Scaffold CONSTRAINTS.md on Project Init

**Milestone:** M5a — Engineer Agent (Implementation Column)
**Agent:** typescript-pro
**Method:** Dogfood — run through AEOS pipeline

## Context
The system design (§3.3) shows `.aeos/CONSTRAINTS.md` as part of the per-project layout.
The `ContextAssembler` and `PromptBuilder` already load and render CONSTRAINTS.md content
(implemented in M2-004 and M2-005). The full chain is already in place:

- **Port:** `ProjectRepository.readConstraints(projectPath): string | null`
- **Adapter:** `FsProjectRepository.readConstraints()` — reads `{projectPath}/.aeos/CONSTRAINTS.md`, returns `null` on ENOENT
- **Assembler:** `ContextAssembler.assemble()` — calls `this.projectRepo.readConstraints(projectRoot)` and includes result in `AssembledContext.constraints`
- **Domain model:** `AssembledContext.constraints: string | null`
- **Prompt builder:** `PromptBuilder.buildContextSection()` — renders constraints as `## Constraints` sub-section inside the `[CONTEXT]` block, or `(none)` when absent

However, no task creates the placeholder file during `aeos project init`. Without it, the
operator must manually create the file to use constraints. This task adds the missing
scaffolding step, following the pattern established by M2-014 (agents) and M2-015 (column-specs).

## What needs to be done
1. Add a `writeConstraintsPlaceholder(projectPath: string): void` method to `ProjectRepository` port
2. Implement in `FsProjectRepository`: write a placeholder `CONSTRAINTS.md` with example content
   matching system design §8.2 (Architecture, Code Standards, Security sections)
3. Call the new method from `ProjectInitUseCase.execute()` after directory creation
4. Update `ProjectInitUseCase` tests to verify CONSTRAINTS.md is created on init
5. Update `FsProjectRepository` tests to cover the new method
6. Ensure idempotent: re-running `aeos project init` does NOT overwrite an existing CONSTRAINTS.md

## Acceptance Criteria
- [ ] `aeos project init` creates `.aeos/CONSTRAINTS.md` with placeholder content
- [ ] Placeholder content includes Architecture, Code Standards, and Security sections
- [ ] Re-running init does NOT overwrite existing CONSTRAINTS.md
- [ ] Unit tests cover: fresh init creates file, re-init preserves existing file

## Out of Scope
- Phase-scoping constraints injection (known gap — PLAN phase receives constraints
  even though system design §8.1 excludes it; deferred)
- Enforcing constraints at review time (constraints are informational to the agent, not enforced by rubrics)

## Dependencies
- M2-004: ContextAssembler (✅ complete — already loads constraints)
- M2-005: PromptBuilder (✅ complete — already renders constraints)
- M2-014: Scaffolding pattern established (agents directory)
- M2-015: Scaffolding pattern established (column-specs directory)

## Definition of Done
- [ ] CONSTRAINTS.md placeholder created on `aeos project init`
- [ ] Tests pass covering creation and idempotency
- [ ] Existing ContextAssembler → PromptBuilder chain verified end-to-end with placeholder content
