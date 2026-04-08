# Review: M5a-004-AEOS-12 — Scaffold CONSTRAINTS.md on Project Init

**Date:** 2026-04-08
**Task:** `docs/tasks/M5a-004-AEOS-12-constraints-injection.md`
**Verdict:** PASS — all acceptance criteria and Definition of Done items satisfied

---

## Acceptance Criteria

### AC-1: `aeos project init` creates `.aeos/CONSTRAINTS.md` with placeholder content
**PASS**

`ProjectInitUseCase.execute()` calls `this.projectRepo.writeConstraintsPlaceholder(cwd)` as step 4 in the fresh-init path (line 56 of `project-init.use-case.ts`). The `FsProjectRepository.writeConstraintsPlaceholder()` implementation writes `CONSTRAINTS_PLACEHOLDER` content to `.aeos/CONSTRAINTS.md` when the file does not exist. The unit test "should write CONSTRAINTS.md placeholder on fresh init" in `project-init.use-case.test.ts` verifies the call is made. The integration test "creates CONSTRAINTS.md with placeholder content when file does not exist" in `fs-project.repository.test.ts` verifies the file is actually written with correct content.

### AC-2: Placeholder content includes Architecture, Code Standards, and Security sections
**PASS**

The `CONSTRAINTS_PLACEHOLDER` constant in `src/infrastructure/filesystem/defaults/constraints-placeholder.ts` contains `## Architecture`, `## Code Standards`, and `## Security` sections with example HTML comments. The `fs-project.repository.test.ts` test explicitly asserts:
- `expect(content).toContain('## Architecture')`
- `expect(content).toContain('## Code Standards')`
- `expect(content).toContain('## Security')`

### AC-3: Re-running init does NOT overwrite existing CONSTRAINTS.md
**PASS**

`FsProjectRepository.writeConstraintsPlaceholder()` checks `fs.existsSync(filePath)` and only writes when the file does not exist. The integration test "does NOT overwrite existing CONSTRAINTS.md (idempotent)" writes custom content, calls `writeConstraintsPlaceholder()`, and asserts the custom content is preserved. The use-case test "should be idempotent — skip creation when project already exists" verifies `writeConstraintsPlaceholder` is still called on re-init (the method itself is idempotent — it skips if file exists).

### AC-4: Unit tests cover: fresh init creates file, re-init preserves existing file
**PASS**

Tests present in two layers:
1. **Use-case tests** (`project-init.use-case.test.ts`):
   - "should write CONSTRAINTS.md placeholder on fresh init" — verifies call on new project
   - "should be idempotent — skip creation when project already exists" — verifies call on re-init
   - "should call operations in correct order" — verifies writeConstraintsPlaceholder is step 4
2. **Repository tests** (`fs-project.repository.test.ts`):
   - "creates CONSTRAINTS.md with placeholder content when file does not exist" — filesystem integration
   - "does NOT overwrite existing CONSTRAINTS.md (idempotent)" — preservation test

All 73 tests pass (`vitest run` exit code 0).

---

## Definition of Done

### DoD-1: CONSTRAINTS.md placeholder created on `aeos project init`
**PASS** — See AC-1 above. The `writeConstraintsPlaceholder` method is called in both fresh-init and re-init paths of `ProjectInitUseCase.execute()`.

### DoD-2: Tests pass covering creation and idempotency
**PASS** — All 73 tests pass. Both creation and idempotency are covered at use-case and repository layers.

### DoD-3: Existing ContextAssembler → PromptBuilder chain verified end-to-end with placeholder content
**PASS** — The chain is verified across existing tests:
- `ContextAssembler` tests cover constraints-present and constraints-null scenarios
- `PromptBuilder` tests verify `## Constraints\n{content}` rendering and `(none)` fallback
- The `CONSTRAINTS_PLACEHOLDER` content flows through `readConstraints()` → `AssembledContext.constraints` → `buildContextSection()` without modification
- All mock factories across test files (`context-assembler.test.ts`, `ticket-list.command.test.ts`, `ticket-show.command.test.ts`, `yaml-agent-spec-loader.adapter.test.ts`) correctly include both `readConstraints` and `writeConstraintsPlaceholder` methods in the `ProjectRepository` mock

---

## Implementation Quality Notes

1. **Port extension is clean:** `writeConstraintsPlaceholder` added to `ProjectRepository` interface with JSDoc.
2. **Placeholder content is well-structured:** Uses HTML comments as examples — won't trigger `no-unfilled-placeholders` validation rule (which checks for `[PLACEHOLDER]`, `<PLACEHOLDER>`, and `<!-- TODO`).
3. **Ordering is correct:** `writeConstraintsPlaceholder` is called after `ensureColumnSpecsDir` (step 4), matching the established scaffolding pattern.
4. **All downstream mocks updated:** Every test file that mocks `ProjectRepository` includes both new methods (`readConstraints`, `writeConstraintsPlaceholder`), preventing type errors.
5. **Separate placeholder file:** `CONSTRAINTS_PLACEHOLDER` lives in `src/infrastructure/filesystem/defaults/constraints-placeholder.ts`, keeping the adapter clean and the placeholder content easily discoverable.

---

## Summary

All 4 acceptance criteria and all 3 Definition of Done items **PASS**. No fixes needed. The implementation correctly scaffolds `CONSTRAINTS.md` during project init, preserves existing files on re-init, and integrates cleanly with the existing ContextAssembler → PromptBuilder chain.
