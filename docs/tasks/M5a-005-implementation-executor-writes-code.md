# Task: Change IMPLEMENTATION Executor to Write Code to Project Directory

**Milestone:** M5a — Engineer Agent (Implementation Column)
**Agent:** typescript-pro
**Method:** Agentic implementation
**Priority:** Critical — without this, the pipeline produces plans but never writes code

## Context
The current `ClaudeCodeCliExecutor` captures Claude's stdout and writes it to a markdown artifact at `outputPath`. This works for PLAN/PREPARE phase columns (PRD, spike, tech spec) which produce documents. But the IMPLEMENTATION column needs Claude to actually **write source files** to the project directory, not just produce a plan.

Today, after IMPLEMENTATION completes, no project files change — only `AEOS-X-implementation-notes.md` is written. The CODE_REVIEW column then has no diff to review.

## Problem
The executor uses `claude --print -` which runs Claude in **print mode** — it outputs text to stdout and cannot modify files. To write code, Claude needs to run in **interactive/agentic mode** where it can use tools (file write, terminal) to modify the project.

## What needs to be done

### 1. Add a `mode` field to `ExecutorInvocation`

```typescript
// src/domain/model/executor-invocation.ts
export interface ExecutorInvocation {
  readonly prompt: string;
  readonly outputPath: string;
  readonly ticketId: string;
  readonly column: Column;
  /** Execution mode:
   *  - 'artifact': capture stdout, write to outputPath (default — current behaviour)
   *  - 'agentic':  let Claude modify the project directory directly, capture summary to outputPath
   */
  readonly mode?: 'artifact' | 'agentic';
}
```

### 2. Update `ClaudeCodeCliExecutor` to support agentic mode

When `mode === 'agentic'`:
- Drop `--print` flag — run Claude in interactive mode so it can use tools
- Pass the prompt via `-p` flag (or stdin) with `--allowedTools` for file operations
- Let Claude write files directly to the project directory
- Capture the session transcript/summary and write it to `outputPath` as the artifact
- The artifact becomes the implementation notes (what was done, files changed)

When `mode === 'artifact'` (default):
- Current behaviour — `--print`, capture stdout, write to outputPath

### 3. Update `TicketRunUseCase` to set mode based on column phase

```typescript
// In execute(), when building the executor invocation:
const mode = columnSpec.phase === 'BUILD' ? 'agentic' : 'artifact';
```

BUILD phase columns (IMPLEMENTATION, CODE_REVIEW) use agentic mode. PLAN/PREPARE phase columns (PRODUCT_SCOPING, ARCH_SPIKE, TECH_SPEC) use artifact mode.

### 4. Update `ColumnSpec` schema (optional)

Add an optional `executorMode` field to column specs so users can override per-column:

```yaml
# implementation.yaml
executorMode: agentic  # override default phase-based mode
```

### 5. Update tests

- `ClaudeCodeCliExecutor` tests: add test cases for agentic mode (args without `--print`, different output handling)
- `TicketRunUseCase` tests: verify mode is set correctly based on phase
- `StubExecutor`: support both modes (agentic mode returns a stub summary)

## Acceptance Criteria
- [ ] `ExecutorInvocation` has optional `mode` field (`'artifact' | 'agentic'`)
- [ ] `ClaudeCodeCliExecutor` drops `--print` flag when `mode === 'agentic'`
- [ ] IMPLEMENTATION column runs in agentic mode — Claude writes source files to the project
- [ ] After IMPLEMENTATION, `git diff` shows actual code changes in the project
- [ ] The implementation notes artifact is still written (as a summary of what Claude did)
- [ ] PLAN/PREPARE columns still use artifact mode (current behaviour unchanged)
- [ ] All existing tests pass; new tests cover agentic mode

## Out of Scope
- Sandboxing or permission scoping for Claude's file access
- Automatic `git add`/`git commit` of code changes (left to human or CODE_REVIEW column)
- Changes to CODE_REVIEW column (AEOS-14 handles diff injection)

## Dependencies
- M2-003: `ClaudeCodeCliExecutor` ✅ complete
- M5a-001: AEOS-9 engineer agent spec ✅ complete

## Blocks
- End-to-end pipeline: code changes must exist before CODE_REVIEW can review them
- AEOS-14 (diff injection): needs actual diffs to inject

## Definition of Done
- [ ] IMPLEMENTATION column produces real code changes in the project directory
- [ ] Implementation notes artifact written as summary
- [ ] Existing PLAN/PREPARE columns unaffected
- [ ] Tests pass
