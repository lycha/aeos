# Review: M5b-002 — AEOS-14 Git Diff Injection into CODE_REVIEW Context

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Task file:** `docs/tasks/M5b-002-AEOS-14-diff-injection.md`
**Cross-referenced against:**
- `docs/03-system-design.md` (System Design v0.3)
- `docs/02-prd.md` (PRD v0.1)
- `docs/05-action-plan-v1.md` (Action Plan)
- Sibling task: M5b-001 (AEOS-13, code-structure rubric)
- Column spec: M5b-000 (code-review column spec, archived)
- Upstream tasks: M2-004 (ContextAssembler), M2-005 (PromptBuilder), M1-014 (GitGateway)
- Cross-task: M5a-004 (AEOS-12, constraints injection — also modifies ContextAssembler)
- Prior reviews: REVIEW-20260408-M5b-000, REVIEW-20260408-M5b-001, REVIEW-20260408-M5a-004
- Source code: `src/application/services/context-assembler.ts`, `src/application/services/prompt-builder.ts`, `src/domain/model/assembled-context.ts`, `src/domain/ports/driven/git-gateway.port.ts`, `src/infrastructure/git/simple-git-gateway.adapter.ts`, `src/application/ticket-run.use-case.ts`, `src/domain/model/column.ts`

---

## Verdict: APPROVE WITH REQUIRED CHANGES

One critical gap (GitGateway port has no `diff()` method), two major issues (wrong git repo target, missing AssembledContext extension), three medium issues, and four minor issues. The task correctly identifies the core requirement from system design §2.2 — Code Review needs the actual code diff — but lacks the implementation detail needed for an agentic implementer to execute it. The task as written would lead an implementer to dead ends on multiple fronts.

---

## Critical Issues

### 🔴 C1: `GitGateway` port has no `diff()` method — task assumes it exists

**Task step 2:** _"run `git diff` (or `git diff --cached`) via `SimpleGitGateway` to capture the current diff"_

**Actual `GitGateway` interface** (`src/domain/ports/driven/git-gateway.port.ts`):
```typescript
export interface GitGateway {
  init(dir: string): void;
  commit(dir: string, message: string): void;
  commitFiles(dir: string, files: string[], message: string): void;
}
```

There is **no `diff()` method** on the port or adapter. The `SimpleGitGateway` adapter (`src/infrastructure/git/simple-git-gateway.adapter.ts`) only implements `init`, `commit`, and `commitFiles` using `execFileSync`. The dependency listing says "M2: `SimpleGitGateway` exists and tested" — it does exist, but it cannot produce diffs.

**Impact:** The implementer will immediately hit a dead end. A `diff()` method must be added to both the `GitGateway` port (domain layer) and the `SimpleGitGateway` adapter (infrastructure layer). This is a prerequisite that should either be a sub-task or explicit step in this task.

**Recommendation:** Add explicit steps:
1. Extend `GitGateway` port with `diff(dir: string): string` method
2. Implement in `SimpleGitGateway` using `execFileSync('git', ['diff'], { cwd: dir })`
3. Add unit tests for the new method (empty diff, non-empty diff, binary files)

---

## Major Issues

### 🟠 J1: Wrong git repository target — project git vs AEOS artifact git

**System design §3.2:** _"Two separate git repositories: The project's `.git/` and AEOS's `.aeos/.git/` are completely independent."_

**System design §2.2:** Code Review input is _"Code diff + `SAAS-1-implementation-notes.md`"_ — the code diff comes from the **project's** `.git/`, not AEOS's `.aeos/.git/`.

The existing `SimpleGitGateway` operates on the `.aeos/.git/` artifact repository. Every call in `TicketRunUseCase` passes `path.join(projectPath, '.aeos')` as the `dir` argument (lines 131, 168–172, 221–225). Running `git diff` on `.aeos/` would show changes to Markdown artifact files, **not source code**.

**Impact:** If the implementer follows the task literally and uses `SimpleGitGateway` with the `.aeos/` dir (following the pattern in `TicketRunUseCase`), the diff will show artifact changes, not code changes. The diff must be run against `projectPath` (the project root where `.git/` lives).

**Recommendation:** The task must explicitly specify:
- The diff target is the **project's git repo** (`projectPath`), not the AEOS artifact repo (`projectPath/.aeos/`)
- The new `diff()` method signature should make this clear
- Consider whether a separate port method or parameter distinguishes project-git vs artifact-git operations

### 🟠 J2: `AssembledContext` interface must be extended — not mentioned in task

**Current `AssembledContext`** (`src/domain/model/assembled-context.ts`):
```typescript
export interface AssembledContext {
  ticketContent: string;
  priorArtifacts: PriorArtifact[];
  constraints: string | null;
}
```

The task says to "inject the diff as a `[CODE DIFF]` section in the assembled context" but does not mention adding a field to `AssembledContext`. Without a new field (e.g., `codeDiff: string | null`), the diff has nowhere to live in the domain model.

**Downstream impact:** `PromptBuilder` (`src/application/services/prompt-builder.ts`) consumes `AssembledContext` and renders each field into the prompt. If a `codeDiff` field is added to `AssembledContext`, `buildContextSection()` must be updated to render it. If instead the diff is stuffed into `priorArtifacts` as a synthetic artifact, `buildPrompt()` needs no changes but the diff loses semantic identity.

**Recommendation:** Add explicit steps:
1. Add `codeDiff: string | null` to `AssembledContext` interface
2. Update `PromptBuilder.buildContextSection()` to render `## Code Diff` subsection when `context.codeDiff` is non-null
3. Update `PromptBuilder` tests to cover the new section

---

## Medium Issues

### ⚠️ M1: `ContextAssembler.assemble()` signature must change — no column parameter

**Current signature** (`src/application/services/context-assembler.ts`):
```typescript
async assemble(ticketId: string, projectRoot: string): Promise<AssembledContext>
```

The task says "detect when the current column is CODE_REVIEW" but `assemble()` has no column parameter. It cannot detect anything.

**Callers** (`src/application/ticket-run.use-case.ts`):
- Line 124: `await this.contextAssembler.assemble(ticketId, projectPath)` — worker context
- Line 188: `await this.contextAssembler.assemble(ticketId, projectPath)` — reviewer context

Both calls must be updated with the column argument.

**Cross-task note:** The M5a-004 review (REVIEW-20260408-M5a-004, §X1) already flagged: _"M5b-002 adds git diff injection to ContextAssembler for the CODE_REVIEW column. If M5a-004 is rewritten to add phase-scoping to ContextAssembler.assemble() (adding a column or phase parameter), this changes the method signature that M5b-002 also targets."_ This coordination concern is now live.

**Recommendation:** Add explicit step: _"Add `column: string` (or `Column`) parameter to `ContextAssembler.assemble()`. Update both call sites in `TicketRunUseCase`."_

### ⚠️ M2: `PromptBuilder` update described ambiguously — step 6 is vague

**Task step 6:** _"Verify the prompt builder includes the diff section in the final prompt"_

"Verify" implies the prompt builder already handles it. It does not. `buildContextSection()` renders `ticketContent`, `priorArtifacts`, and `constraints` — nothing else. If a `codeDiff` field is added to `AssembledContext`, the prompt builder **must be updated**, not merely verified.

**Recommendation:** Change step 6 to: _"Update `PromptBuilder.buildContextSection()` to render `context.codeDiff` as a `## Code Diff` subsection inside [CONTEXT] when non-null. Update prompt builder tests."_

### ⚠️ M3: No truncation limit specified

**Task step 4:** _"very large diff (truncation with warning)"_

No character count, line count, or byte limit is specified. The implementer must invent a threshold. Context window sizes vary by model, and the system design does not specify a limit.

**Recommendation:** Specify a concrete default, e.g.: _"Truncate diffs exceeding 50,000 characters (approximately 1,000 lines of typical diff output). Append `\n\n[DIFF TRUNCATED — showing first 50,000 characters of N total]` when truncated. Make the limit a constant for future configurability."_

---

## Minor Issues

### m1: Method header inconsistent with action plan

**Task header:** `Method: Agentic implementation`
**Action plan §M5b:** _"Method: Dogfood."_ — All M5b tickets are listed as dogfood tickets.

This is the same divergence flagged in M5b-001 review (m1). The action plan says all M3+ tasks are dogfood. Only M3-002 was amended.

**Recommendation:** Change to `Method: Dogfood — run through AEOS pipeline` per action plan.

### m2: Agent header "typescript-pro" is not a recognized agent

**Task header:** `Agent: typescript-pro`

System design §5.2 roster: `pm-agent`, `architect-agent`, `engineer-agent`, `qa-agent`, `reviewer-agent`. "typescript-pro" is not in the roster. Sibling M5b-001 uses `Agent: prompt-engineering`. Neither is recognized. This header is cosmetic — not consumed by code.

### m3: Dependencies too coarse and partially incorrect

**Listed dependencies:**
- "M2: `SimpleGitGateway` exists and tested" — ✅ Exists, but has no `diff()` method (see C1)
- "M5a complete" — too coarse; the actual dependencies are:
  - M2-004: `ContextAssembler` (✅ complete)
  - M2-005: `PromptBuilder` (✅ complete)
  - M5b-000: `code-review.yaml` column spec (✅ complete, archived)
  - M5b-001: `code-structure.md` rubric (not strictly required but same milestone)

**Missing dependencies:**
- `AssembledContext` interface extension (domain model change)
- `GitGateway` port extension (domain port change)
- `TicketRunUseCase` caller updates (application layer change)

**Recommendation:** Replace with:
```markdown
## Dependencies
- M2-004: `ContextAssembler` exists (✅ complete — modifying its signature and logic)
- M2-005: `PromptBuilder` exists (✅ complete — adding diff rendering)
- M1-014: `SimpleGitGateway` exists (✅ complete — extending with `diff()` method)
- M5b-000: `code-review.yaml` column spec (✅ complete, archived)
- M5a complete (CODE_REVIEW column reachable in pipeline)
```

### m4: No layer mapping — inconsistent with sibling task detail level

Sibling tasks M5a-004, M5b-001 include layer mapping sections showing exactly which files belong to which hexagonal layer. This task has no layer mapping, no file path references, and no implementation pseudocode. For an "agentic implementation" task, this lack of specificity will cause the agent to guess at file locations and interfaces.

**Recommendation:** Add layer mapping:
```
Domain model:     src/domain/model/assembled-context.ts — add codeDiff: string | null
Domain port:      src/domain/ports/driven/git-gateway.port.ts — add diff(dir: string): string
Infrastructure:   src/infrastructure/git/simple-git-gateway.adapter.ts — implement diff()
Application:      src/application/services/context-assembler.ts — add column param, inject diff
Application:      src/application/services/prompt-builder.ts — render codeDiff in [CONTEXT]
Application:      src/application/ticket-run.use-case.ts — pass column to assemble() calls
```

---

## Correctness vs System Design

| Aspect | Task | System Design | Verdict |
|--------|------|---------------|---------|
| Diff in CODE_REVIEW | ✅ Injects diff for CODE_REVIEW | §2.2: Code Review input = "Code diff + implementation-notes.md" | ✅ Correct |
| Diff source | "git diff" via SimpleGitGateway | §3.2: project's `.git/` separate from `.aeos/.git/` | ⚠️ Must target project git, not artifact git (J1) |
| Context section | `[CODE DIFF]` section | §4.4: Prompt sections are [ROLE]/[CONTEXT]/[TASK]/[OUTPUT FORMAT]/[SELF-VERIFICATION] | ⚠️ Should be subsection within [CONTEXT], not top-level (M2) |
| Column detection | "detect when column is CODE_REVIEW" | §8.1: context scoped by phase | ✅ Correct intent, but needs column param (M1) |
| Edge cases | Empty diff, large diff, binary files | Not specified in system design | ✅ Good defensive design |
| Column enum | CODE_REVIEW | `src/domain/model/column.ts` line 9: `CODE_REVIEW: 'CODE_REVIEW'` | ✅ Exists |
| Worker for CODE_REVIEW | Not specified | §2.2 + M5b-000: `workerAgentFile: agents/engineer-agent.yaml` | ✅ Compatible |

---

## File Path Alignment with Hexagonal Scaffold

| Referenced Path / Component | Exists in `src/` | Status |
|----------------------------|-----------------|--------|
| `ContextAssembler` | `src/application/services/context-assembler.ts` | ✅ Exists — task correctly targets this |
| `SimpleGitGateway` | `src/infrastructure/git/simple-git-gateway.adapter.ts` | ✅ Exists — but no `diff()` method |
| `GitGateway` port | `src/domain/ports/driven/git-gateway.port.ts` | ✅ Exists — needs extension |
| `AssembledContext` | `src/domain/model/assembled-context.ts` | ✅ Exists — needs extension |
| `PromptBuilder` | `src/application/services/prompt-builder.ts` | ✅ Exists — needs update |
| `TicketRunUseCase` (caller) | `src/application/ticket-run.use-case.ts` | ✅ Exists — needs caller update |
| `ContextAssembler` tests | `src/application/services/context-assembler.test.ts` | ✅ Exists — needs new test cases |
| `PromptBuilder` tests | `src/application/services/prompt-builder.test.ts` | ✅ Exists — needs new test cases |
| `SimpleGitGateway` tests | `src/infrastructure/git/simple-git-gateway.adapter.test.ts` | ✅ Exists — needs new test cases |

**Previous path fix verified:** The M5b-000 code review (REVIEW-20260408-M5b-000, §5.1) noted that M5b-002 originally referenced stale paths `src/prompt/context-assembler.ts` and `src/prompt/prompt-builder.ts`. These were corrected to `src/application/services/`. The current task file does not include explicit file paths — the fix removed the wrong paths but did not add the correct ones. This contributes to the lack of implementation specificity (see m4).

---

## Dependency Validation

| Dependency | Status | Verified |
|-----------|--------|----------|
| Listed: "M2: SimpleGitGateway exists and tested" | ✅ Complete | Exists but missing `diff()` method — see C1 |
| Listed: "M5a complete" | ⬜ Not yet complete | Overly broad — see m3 |
| Implicit: AssembledContext extension | Not listed | Required — see J2 |
| Implicit: GitGateway port extension | Not listed | Required — see C1 |
| Implicit: PromptBuilder update | Not listed | Required — see M2 |
| Implicit: TicketRunUseCase caller update | Not listed | Required — see M1 |

**Transitive dependency chain:**
M5b-002 → M2-004 (ContextAssembler ✅) → M2-005 (PromptBuilder ✅) → M1-014 (GitGateway ✅) → M5b-000 (column spec ✅)

---

## Consistency with Sibling Tasks

| Aspect | M5b-001 (code-structure rubric) | **M5b-002 (diff injection)** |
|--------|-------------------------------|------------------------------|
| Method | `Agentic implementation` ❌ | `Agentic implementation` ❌ |
| Agent | `prompt-engineering` | `typescript-pro` |
| Layer mapping | N/A (content file) | ❌ Missing |
| File path references | Column spec path ✅ | ❌ No src/ paths |
| Dependencies precision | "M5a complete" ❌ (fixed in review) | "M5a complete" ❌ |
| mkdir/scaffold step | ✅ (amended) | N/A |
| Acceptance criteria | 5 checkboxes | 4 checkboxes |
| Implementation detail | Adequate for content task | ❌ Insufficient for code task |

**Key gap:** M5b-001 is a content-production task (write a rubric Markdown file). M5b-002 is a multi-layer code modification task touching domain model, domain port, infrastructure adapter, two application services, and one use case. The task description has the same level of detail as M5b-001, but needs significantly more. Compare with M5a-004 (AEOS-12, constraints injection) which also modifies ContextAssembler — that task's review found the functionality already existed. M5b-002 requires genuinely new code across 6+ files.

---

## Cross-Task Coordination Issues

### X1: M5a-004 (AEOS-12) also targets ContextAssembler

The M5a-004 review (REVIEW-20260408-M5a-004, §X1) flagged: _"M5b-002 adds git diff injection to ContextAssembler for the CODE_REVIEW column. If M5a-004 is rewritten to add phase-scoping to ContextAssembler.assemble() (adding a column or phase parameter), this changes the method signature that M5b-002 also targets."_

M5a-004 currently does NOT modify the `assemble()` signature — it only adds `writeConstraintsPlaceholder()` to `ProjectRepository`. However, if M5a-004 is later amended to add phase scoping, M5b-002's signature change will conflict.

**Recommendation:** M5b-002 should own the signature change. Add explicit note: _"This task introduces the `column` parameter to `ContextAssembler.assemble()`. If M5a-004 needs phase scoping later, it should build on this parameter."_

### X2: TicketRunUseCase calls assemble() twice — which call gets the diff?

`TicketRunUseCase` calls `this.contextAssembler.assemble()` at:
- Line 124: worker context (pre-executor run)
- Line 188: reviewer context (post-executor, for reviewer sign-off)

For CODE_REVIEW, the **worker** (engineer agent producing `code-review.md`) needs the diff. The **reviewer** (evaluating the code review artifact) also benefits from the diff to verify the review's thoroughness.

The task does not specify whether both calls should inject the diff. Both should receive it.

**Recommendation:** Add note: _"Both the worker and reviewer invocations in `TicketRunUseCase` pass the column to `assemble()`. The diff is available to both."_

### X3: `git diff` vs `git diff --cached` — which working tree state?

The task says _(or `git diff --cached`)_ without deciding. This is ambiguous:
- `git diff` — unstaged changes only
- `git diff --cached` — staged changes only
- `git diff HEAD` — all uncommitted changes (staged + unstaged)

In the AEOS workflow, the engineer agent writes code during IMPLEMENTATION. Those changes may or may not be staged. `git diff HEAD` is the safest choice to capture all uncommitted work.

**Recommendation:** Specify `git diff HEAD` as the default.

---

## Blocking Gaps

**Hard blockers preventing implementation as written:**

1. **C1 (CRITICAL):** `GitGateway` port has no `diff()` method. Implementer cannot proceed without extending the port and adapter. This is the single biggest gap.

2. **J1 (MAJOR):** The task does not specify which git repo to diff. Using the existing `SimpleGitGateway` patterns would diff the wrong repo (`.aeos/` instead of project root). Implementer must know to use `projectPath` not `path.join(projectPath, '.aeos')`.

3. **J2 (MAJOR):** `AssembledContext` has no field for diff content. Without extending the interface, there is no type-safe way to pass the diff through the context pipeline.

**Soft blockers (implementation will succeed but with incorrect behavior):**

4. **M1 (MEDIUM):** No column parameter on `assemble()`. Without this, the conditional diff injection cannot be implemented.

5. **M2 (MEDIUM):** PromptBuilder will silently ignore the diff if not explicitly updated to render the new field.

---

## Recommendations Summary

| # | Severity | Finding | Action |
|---|----------|---------|--------|
| C1 | Critical | GitGateway port missing `diff()` method | Add port extension + adapter implementation steps |
| J1 | Major | Wrong git repo target (artifact vs project) | Specify project root as diff target |
| J2 | Major | AssembledContext needs `codeDiff` field | Add domain model extension step |
| M1 | Medium | `assemble()` signature needs column parameter | Add signature change step + caller updates |
| M2 | Medium | PromptBuilder needs update, not just "verify" | Change step 6 to explicit update |
| M3 | Medium | No truncation limit specified | Add concrete character limit |
| m1 | Minor | Method "Agentic implementation" ≠ action plan "Dogfood" | Align or document |
| m2 | Minor | Agent "typescript-pro" not recognized | Cosmetic |
| m3 | Minor | Dependencies too coarse / missing implicit deps | Replace with precise list |
| m4 | Minor | No layer mapping or file paths | Add layer mapping section |
| X1 | Cross-task | M5a-004 also targets ContextAssembler | M5b-002 owns signature change |
| X2 | Cross-task | Two assemble() calls — both need diff | Specify both get diff |
| X3 | Cross-task | git diff vs git diff --cached ambiguity | Specify `git diff HEAD` |

---

## Proposed Amendments

### 1. Extend GitGateway port (C1)

Add to "What needs to be done" as step 0:
```markdown
0. Extend `GitGateway` port (`src/domain/ports/driven/git-gateway.port.ts`) with:
   `diff(dir: string): string` — returns the output of `git diff HEAD` in the given directory.
   Implement in `SimpleGitGateway` (`src/infrastructure/git/simple-git-gateway.adapter.ts`)
   using `execFileSync('git', ['diff', 'HEAD'], { cwd: dir, encoding: 'utf-8' })`.
   Add tests: empty diff returns empty string, non-empty diff returns content.
```

### 2. Specify project git as target (J1)

Amend step 2:
```markdown
2. When in CODE_REVIEW, run `git diff HEAD` via `GitGateway.diff(projectRoot)` — targeting
   the **project's** `.git/` repository (NOT `.aeos/.git/`). The `projectRoot` is the same
   `projectPath` passed to `assemble()`, not `path.join(projectPath, '.aeos')`.
```

### 3. Extend AssembledContext (J2)

Add step 1b:
```markdown
1b. Add `codeDiff: string | null` field to `AssembledContext` interface
    (`src/domain/model/assembled-context.ts`). Default to `null` for all non-CODE_REVIEW columns.
```

### 4. Add column parameter to assemble() (M1)

Amend step 1:
```markdown
1. Add `column: string` parameter to `ContextAssembler.assemble()` signature.
   Update both call sites in `TicketRunUseCase` (lines 124 and 188) to pass
   `columnSpec.column`. When `column === Column.CODE_REVIEW`, inject the diff.
```

### 5. Fix PromptBuilder step (M2)

Replace step 6:
```markdown
6. Update `PromptBuilder.buildContextSection()` to render `context.codeDiff` as a
   `## Code Diff` subsection inside [CONTEXT] when non-null. Add prompt builder tests
   covering: codeDiff present, codeDiff null, codeDiff with truncation warning.
```

### 6. Add truncation limit (M3)

Amend step 4:
```markdown
4. Handle edge cases:
   - Empty diff: set `codeDiff` to `"No changes detected"`
   - Large diff: truncate at 50,000 characters with warning:
     `[DIFF TRUNCATED — showing first 50,000 characters of N total]`
   - Binary files: `git diff HEAD` already shows `Binary files differ` markers — no special handling
   Define truncation limit as a named constant `MAX_DIFF_CHARS = 50_000`.
```

### 7. Add layer mapping (m4)

```markdown
## Layer Mapping
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

### 8. Fix dependencies (m3)

```markdown
## Dependencies
- M2-004: `ContextAssembler` exists (✅ complete — modifying signature and logic)
- M2-005: `PromptBuilder` exists (✅ complete — adding codeDiff rendering)
- M1-014: `SimpleGitGateway` exists (✅ complete — extending with `diff()` method)
- M5b-000: `code-review.yaml` column spec (✅ complete, archived)
- M5a complete (CODE_REVIEW column reachable in pipeline)
```

---

## Summary

| Category | Count |
|----------|-------|
| Critical | 1 |
| Major | 2 |
| Medium | 3 |
| Minor | 4 |
| Cross-task | 3 (0 conflicts, 3 coordination notes) |

**Overall:** The task correctly identifies the core requirement — Code Review needs the actual code diff, per system design §2.2. The high-level intent is sound and well-scoped per action plan §M5b (AEOS-14). However, the implementation specification is critically incomplete. The three hard blockers (missing port method, wrong git target, missing domain model field) would each independently prevent a successful implementation. An agentic implementer following the task literally would fail at step 2 (no `diff()` method exists) and, if they improvised past that, would diff the wrong repository.

The task needs the eight proposed amendments to be implementable. After amendment, this becomes a well-defined multi-layer change touching domain model, domain port, infrastructure adapter, two application services, one use case, and three test suites — approximately 6–9 files modified. The scope is appropriate for a single task but the task description must reflect this complexity.

The cross-task coordination with M5a-004 (both modify ContextAssembler) is manageable — M5b-002 should own the signature change since it has the stronger reason (column-conditional behavior). The `git diff HEAD` recommendation resolves the staged/unstaged ambiguity. Both `assemble()` call sites in `TicketRunUseCase` should receive the column parameter to ensure the diff is available for both worker and reviewer invocations.