# Review: M5b-002-AEOS-14 — Git Diff Injection into CODE_REVIEW Context

**Reviewer:** Augment Agent
**Date:** 2026-04-08

---

## Acceptance Criteria

### 1. `GitGateway` port extended with `diff(dir: string): string` method
**PASS** — `src/domain/ports/driven/git-gateway.port.ts` declares `diff(dir: string): string` with JSDoc comment.

### 2. `SimpleGitGateway` implements `diff()` with `git diff HEAD`
**PASS** — `src/infrastructure/git/simple-git-gateway.adapter.ts` implements `diff()` using `execFileSync('git', ['diff', 'HEAD'], { cwd: dir, encoding: 'utf-8' })`.

### 3. `AssembledContext` interface has `codeDiff: string | null` field
**PASS** — `src/domain/model/assembled-context.ts` declares `codeDiff: string | null` on the `AssembledContext` interface.

### 4. `ContextAssembler.assemble()` accepts `column` parameter
**PASS** — Signature is `assemble(ticketId: string, projectRoot: string, column: string): Promise<AssembledContext>`.

### 5. `ContextAssembler` injects git diff when column is CODE_REVIEW
**PASS** — `context-assembler.ts` checks `column === Column.CODE_REVIEW` and calls `this.gitGateway.diff(projectRoot)`, returning the result in `codeDiff`.

### 6. Diff targets the project's `.git/` repo, not `.aeos/.git/`
**PASS** — `gitGateway.diff(projectRoot)` is called with `projectRoot` (the project directory), not `path.join(projectRoot, '.aeos')`. Test confirms: `expect(gitGateway.diff).toHaveBeenCalledWith(PROJECT_ROOT)` where `PROJECT_ROOT = '/projects/test'`.

### 7. Empty diff produces a codeDiff with "No changes detected" message
**PASS** — When `rawDiff.trim() === ''`, `codeDiff` is set to `'No changes detected'`. Tests cover both empty string and whitespace-only cases.

### 8. Large diffs are truncated at 50,000 characters with a warning
**PASS** — `MAX_DIFF_CHARS = 50_000` is exported as a named constant. Truncation logic slices at `MAX_DIFF_CHARS` and appends `[DIFF TRUNCATED — showing first 50,000 characters of N total]`. Test verifies truncated content length equals `MAX_DIFF_CHARS`.

### 9. `PromptBuilder.buildContextSection()` renders codeDiff as `## Code Diff` subsection
**PASS** — `prompt-builder.ts` renders `## Code Diff\n${context.codeDiff}` when `codeDiff !== null`, and omits the section entirely when `null`.

### 10. Both call sites in `TicketRunUseCase` pass column to `assemble()`
**PASS** — Both `assemble()` calls (lines 124 and 192 in `ticket-run.use-case.ts`) pass `columnSpec.column` as the third argument.

### 11. Existing `ContextAssembler` tests updated to cover diff injection
**PASS** — `context-assembler.test.ts` includes 5 diff-specific tests:
- `codeDiff` is null for non-CODE_REVIEW columns
- Injects git diff when column is CODE_REVIEW
- Empty diff returns "No changes detected"
- Whitespace-only diff returns "No changes detected"
- Large diffs truncated at MAX_DIFF_CHARS with warning

### 12. `PromptBuilder` tests cover codeDiff present, null, and truncated
**PASS** — `prompt-builder.test.ts` includes 3 tests:
- `## Code Diff` rendered when codeDiff present
- `## Code Diff` omitted when codeDiff is null
- codeDiff with truncation warning renders correctly

### 13. `SimpleGitGateway` tests cover diff() (empty and non-empty)
**PASS** — `simple-git-gateway.adapter.test.ts` has a `describe('SimpleGitGateway.diff')` block with:
- Returns empty string when no changes
- Returns diff content when files modified

---

## Definition of Done

### Diff injection implemented and tested
**PASS** — Full implementation across domain model, port, adapter, application services, and use case orchestrator. All layers tested.

### CODE_REVIEW column context includes actual git diff
**PASS** — `ContextAssembler` gates on `Column.CODE_REVIEW`, calls `gitGateway.diff(projectRoot)`, and surfaces the result through `AssembledContext.codeDiff` into the prompt via `## Code Diff`.

---

## Downstream Impact Check

All mock factories in affected test files (`project-init.use-case.test.ts`, `ticket-answer.use-case.test.ts`, `ticket-approve.use-case.test.ts`, `ticket-create.use-case.test.ts`, `ticket-run.use-case.test.ts`) have been updated to include `diff: vi.fn().mockReturnValue('')` in the `GitGateway` mock. The `AssembledContext` default in `ticket-run.use-case.test.ts` includes `codeDiff: null`. The `container.ts` composition root passes `gitGateway` to `ContextAssembler`. No missing downstream changes detected.

---

## Summary

| Criteria | Result |
|----------|--------|
| 13 / 13 Acceptance Criteria | **ALL PASS** |
| 2 / 2 Definition of Done | **ALL PASS** |
| Downstream changes | **Complete** |

**Overall: PASS — No fixes needed.**
