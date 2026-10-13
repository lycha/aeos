# Task: Implement AEOS-14 — Git Diff Injection into CODE_REVIEW Context

**Milestone:** M5b — Code Review Column
**Agent:** typescript-pro
**Method:** Dogfood — run through AEOS pipeline

## Context
Implements git diff injection — making the actual code changes available to the engineer agent when running in the CODE_REVIEW column. Without this, the code review agent has no access to the diff and can only review the implementation notes artifact.

> **Cross-task note:** This task introduces the `column` parameter to `ContextAssembler.assemble()`. If M5a-004 needs phase scoping later, it should build on this parameter.

> **Caller note:** Both the worker and reviewer invocations in `TicketRunUseCase` pass the column to `assemble()`. The diff is available to both.

## Layer Mapping
```
Domain model:     src/domain/model/assembled-context.ts — add codeDiff: string | null
Domain port:      src/domain/ports/driven/git-gateway.port.ts — add diff(dir): string
Infrastructure:   src/infrastructure/git/simple-git-gateway.adapter.ts — implement diff()
Application:      src/application/services/context-assembler.ts — add column param, inject diff
Application:      src/application/services/prompt-builder.ts — render codeDiff in [CONTEXT]
Application:      src/application/ticket-run.use-case.ts — pass column to assemble() calls
Tests:            src/infrastructure/git/simple-git-gateway.adapter.test.ts — diff() tests
Tests:            src/application/services/context-assembler.test.ts — diff injection tests
Tests:            src/application/services/prompt-builder.test.ts — codeDiff rendering tests
```

## What needs to be done
0. Extend `GitGateway` port (`src/domain/ports/driven/git-gateway.port.ts`) with:
   `diff(dir: string): string` — returns the output of `git diff HEAD` in the given directory.
   Implement in `SimpleGitGateway` (`src/infrastructure/git/simple-git-gateway.adapter.ts`)
   using `execFileSync('git', ['diff', 'HEAD'], { cwd: dir, encoding: 'utf-8' })`.
   Add tests: empty diff returns empty string, non-empty diff returns content.
1. Add `column: string` parameter to `ContextAssembler.assemble()` signature.
   Update both call sites in `TicketRunUseCase` (lines 124 and 188) to pass
   `columnSpec.column`. When `column === Column.CODE_REVIEW`, inject the diff.
1b. Add `codeDiff: string | null` field to `AssembledContext` interface
    (`src/domain/model/assembled-context.ts`). Default to `null` for all non-CODE_REVIEW columns.
2. When in CODE_REVIEW, run `git diff HEAD` via `GitGateway.diff(projectRoot)` — targeting
   the **project's** `.git/` repository (NOT `.aeos/.git/`). The `projectRoot` is the same
   `projectPath` passed to `assemble()`, not `path.join(projectPath, '.aeos')`.
3. Inject the diff into the `codeDiff` field of the assembled context
4. Handle edge cases:
   - Empty diff: set `codeDiff` to `"No changes detected"`
   - Large diff: truncate at 50,000 characters with warning:
     `[DIFF TRUNCATED — showing first 50,000 characters of N total]`
   - Binary files: `git diff HEAD` already shows `Binary files differ` markers — no special handling
   Define truncation limit as a named constant `MAX_DIFF_CHARS = 50_000`.
5. Update `ContextAssembler` tests to cover diff injection for CODE_REVIEW column
6. Update `PromptBuilder.buildContextSection()` to render `context.codeDiff` as a
   `## Code Diff` subsection inside [CONTEXT] when non-null. Add prompt builder tests
   covering: codeDiff present, codeDiff null, codeDiff with truncation warning.

## Acceptance Criteria
- [ ] `GitGateway` port extended with `diff(dir: string): string` method
- [ ] `SimpleGitGateway` implements `diff()` with `git diff HEAD`
- [ ] `AssembledContext` interface has `codeDiff: string | null` field
- [ ] `ContextAssembler.assemble()` accepts `column` parameter
- [ ] `ContextAssembler` injects git diff when column is CODE_REVIEW
- [ ] Diff targets the project's `.git/` repo, not `.aeos/.git/`
- [ ] Empty diff produces a codeDiff with "No changes detected" message
- [ ] Large diffs are truncated at 50,000 characters with a warning
- [ ] `PromptBuilder.buildContextSection()` renders codeDiff as `## Code Diff` subsection
- [ ] Both call sites in `TicketRunUseCase` pass column to `assemble()`
- [ ] Existing `ContextAssembler` tests updated to cover diff injection
- [ ] `PromptBuilder` tests cover codeDiff present, null, and truncated
- [ ] `SimpleGitGateway` tests cover diff() (empty and non-empty)

## Out of Scope
- Diff formatting or syntax highlighting
- Multi-commit diff ranges

## Dependencies
- M2-004: `ContextAssembler` exists (✅ complete — modifying signature and logic)
- M2-005: `PromptBuilder` exists (✅ complete — adding codeDiff rendering)
- M1-014: `SimpleGitGateway` exists (✅ complete — extending with `diff()` method)
- M5b-000: `code-review.yaml` column spec (✅ complete, archived)
- M5a complete (CODE_REVIEW column reachable in pipeline)

## Definition of Done
- [ ] Diff injection implemented and tested
- [ ] CODE_REVIEW column context includes actual git diff
