# Review: M5a-004 — AEOS-12 CONSTRAINTS.md Injection into Agent Context

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Task file:** `docs/tasks/M5a-004-AEOS-12-constraints-injection.md`
**Cross-referenced against:**
- `docs/03-system-design.md` (System Design v0.3)
- `docs/02-prd.md` (PRD v0.1)
- `docs/05-action-plan-v1.md` (Action Plan)
- Same-milestone tasks: M5a-001 (engineer-agent, amended), M5a-002 (impl-notes-template, amended), M5a-003 (impl-structure-rubric, amended)
- Downstream task: M5b-002 (diff-injection — modifies same `ContextAssembler`)
- Prior M2 tasks: M2-004 (context-assembler, archived), M2-005 (prompt-builder, archived)
- Prior reviews: REVIEW-20260407-M2-004, REVIEW-20260407-M2-005, REVIEW-20260408-M5a-001, REVIEW-20260408-M5a-002, REVIEW-20260408-M5a-003
- Source code: `src/application/services/context-assembler.ts`, `src/application/services/prompt-builder.ts`, `src/domain/model/assembled-context.ts`, `src/domain/ports/driven/project-repository.port.ts`, `src/infrastructure/filesystem/fs-project.repository.ts`, `src/application/services/context-assembler.test.ts`, `src/application/services/prompt-builder.test.ts`, `src/application/project-init.use-case.ts`

---

## Verdict: REJECT — TASK IS LARGELY REDUNDANT

One critical issue (task work is already implemented), one major gap (missing placeholder scaffolding — the only genuinely new work), one medium accuracy issue (section label mismatch), and multiple minor findings. The task as written would cause the implementer to re-implement existing functionality or produce a no-op. Requires a full rewrite to focus on the only remaining gap: creating the `.aeos/CONSTRAINTS.md` placeholder file during project initialisation.

---

## Critical Issues

### 🔴 C1: Steps 2–5 are already fully implemented — ContextAssembler already loads CONSTRAINTS.md

**Task step 2:** _"Update `ContextAssembler` to load `.aeos/CONSTRAINTS.md` and inject it as a `[CONSTRAINTS]` section in the assembled context"_

**Reality:** This was implemented as part of M2-004 (Context Assembler). The full chain is already in place:

1. **Port:** `ProjectRepository.readConstraints(projectPath): string | null` — `src/domain/ports/driven/project-repository.port.ts` line 17
2. **Adapter:** `FsProjectRepository.readConstraints()` — `src/infrastructure/filesystem/fs-project.repository.ts` lines 107–112 — reads `{projectPath}/.aeos/CONSTRAINTS.md`, returns `null` on ENOENT
3. **Assembler:** `ContextAssembler.assemble()` — `src/application/services/context-assembler.ts` line 28 — calls `this.projectRepo.readConstraints(projectRoot)` and includes result in `AssembledContext.constraints`
4. **Domain model:** `AssembledContext.constraints: string | null` — `src/domain/model/assembled-context.ts` line 11
5. **Prompt builder:** `buildPrompt()` → `buildContextSection()` — `src/application/services/prompt-builder.ts` line 55 — renders constraints as `## Constraints\n{content}` or `## Constraints\n(none)` inside the `[CONTEXT]` section

**Task step 3:** _"If `CONSTRAINTS.md` does not exist, skip injection silently (no error)"_

**Reality:** Already implemented. `FsProjectRepository.readConstraints()` catches exceptions and returns `null`. `PromptBuilder` renders `(none)` when constraints is `null`. No error is thrown.

**Task step 4:** _"Update `ContextAssembler` tests to cover: constraints file present, constraints file absent, constraints file empty"_

**Reality:** Already tested in `src/application/services/context-assembler.test.ts`:
- "returns null constraints when CONSTRAINTS.md is not present" (line ~100)
- "returns constraints content when CONSTRAINTS.md is present" (line ~115)
Also tested in `src/application/services/prompt-builder.test.ts`:
- "shows (none) for constraints when constraints is null" (line ~69)
- "shows constraints content when constraints is provided" (line ~133)

**Task step 5:** _"Verify the prompt builder includes the constraints section in the final prompt"_

**Reality:** Already verified by prompt-builder tests. The `buildContextSection` function unconditionally includes the `## Constraints` sub-section.

**Impact:** An implementer following this task would either: (a) produce a no-op PR that changes nothing, (b) duplicate existing code, or (c) waste time investigating why the feature "doesn't exist" when it does. The task is misleading.

**Root cause:** The action plan §M5a lists AEOS-12 as _"CONSTRAINTS.md injection into engineer-agent context"_. The task was written as if this feature didn't exist yet, but M2-004 already included constraints loading as an explicit step (see archived task `docs/tasks/archive/M2-004-context-assembler.md` steps 2–3 and its review `REVIEW-20260407-M2-004`).

**Recommendation:** Rewrite the task entirely — see Proposed Rewrite section below.

---

## Major Issues

### ⚠️ H1: The only genuinely new work — `.aeos/CONSTRAINTS.md` placeholder file — has no creation mechanism

**Task step 1:** _"Create `.aeos/CONSTRAINTS.md` with placeholder content and document its expected format"_

This is the only step that addresses work NOT already done. However, the task treats this as a manual file creation, not as a scaffolding concern.

**Current state:**
- `ProjectInitUseCase` (`src/application/project-init.use-case.ts`) scaffolds `.aeos/` directory, `project.json`, `.aeos/.git/`, and `.aeos/column-specs/`
- It does NOT create `.aeos/CONSTRAINTS.md`
- No other task creates this file during `aeos project init`
- The system design §3.3 shows `CONSTRAINTS.md` as part of the per-project `.aeos/` layout — implying it should exist after init


**Impact:** Without scaffolding, the operator must manually create `CONSTRAINTS.md` after `aeos project init`. This is fragile and undiscoverable. The system design explicitly lists the file in the per-project layout (§3.3), implying it should be present after init.

**Recommendation:** The task should be reframed to:
1. Add `CONSTRAINTS.md` placeholder scaffolding to `ProjectInitUseCase` (or via a new `ProjectRepository` method)
2. Add a test for the scaffolding
3. Optionally scaffold `CONSTRAINTS.md` with example content matching system design §8.2

This aligns with M2-014 (scaffold agents on init) and M2-015 (scaffold column specs on init) which already established the pattern of scaffolding during `aeos project init`.

---

## Medium Issues

### ⚠️ M1: Section label mismatch — task says `[CONSTRAINTS]`, implementation uses `## Constraints`

**Task:** _"inject it as a `[CONSTRAINTS]` section in the assembled context"_

**Implementation:** The `PromptBuilder` renders constraints inside the `[CONTEXT]` section as a `## Constraints` sub-section — NOT as a top-level `[CONSTRAINTS]` section. The prompt structure is:

```
[ROLE]
...
[CONTEXT]
## Ticket
...
## Prior Artifacts
...
## Constraints       ← constraints appear HERE
...
[TASK]
...
```

This matches the system design §4.4 which shows `CONSTRAINTS.md` inside the `[CONTEXT]` block, not as a separate top-level section. The task's description of `[CONSTRAINTS]` is inaccurate relative to both the system design and the implementation.

**Impact:** Low — the task description is misleading but no code change is needed (the implementation is correct). An implementer might try to add a separate `[CONSTRAINTS]` section, breaking the existing prompt structure.

### ⚠️ M2: Phase scoping not addressed — CONSTRAINTS.md injected for ALL phases, not just PREPARE/BUILD/DEPLOY

**System design §8.1 (Context Scoping by Phase):**
| Context Object | PLAN | PREPARE | BUILD | DEPLOY |
|----------------|------|---------|-------|--------|
| `CONSTRAINTS.md` | — | ✓ | ✓ | ✓ |

**PRD §5.6:** _"CONSTRAINTS.md is a board-level config file... injected automatically to all agents in PREPARE and BUILD phases."_

**Current implementation:** `ContextAssembler.assemble()` loads constraints unconditionally — no phase filtering. The PLAN phase (Product Scoping) agent will receive CONSTRAINTS.md content even though the system design says it should not.

**Impact:** Medium — this is an existing gap in the ContextAssembler (introduced in M2-004), not specific to this task. However, the task's title is "CONSTRAINTS.md Injection into Agent Context" — if it's going to address constraints injection, it should address the phase-scoping gap. The M2-004 review flagged this as a deferred concern.

**Recommendation:** Either:
1. Add phase-scoping to this task: `ContextAssembler.assemble()` should accept a `column` or `phase` parameter and skip constraints loading when `phase === 'PLAN'`
2. Or explicitly declare phase-scoping as out of scope with a note that it's a known gap

---

## Minor Issues

### m1: Method header inconsistent with action plan

**Task header:** `Method: Agentic implementation`
**Action plan §M5a:** _"Method: Dogfood."_

Same issue flagged in M5a-001 (H1), M5a-003 (m1), and all M4+ task reviews. Only M3-002 was amended.

**Recommendation:** Change to `Method: Dogfood — run through AEOS pipeline` or accept the divergence.

### m2: Agent assignment questionable — "typescript-pro" for a task that may require no code changes

**Task header:** `Agent: typescript-pro`
**Sibling M5a tasks:** M5a-001 uses `prompt-engineering`, M5a-002 uses `prompt-engineering`, M5a-003 uses `prompt-engineering`.

If the task is rewritten to focus on scaffolding (H1), `typescript-pro` is appropriate since it involves `ProjectInitUseCase` code changes. As currently written (steps 2–5 are no-ops), the agent assignment is irrelevant.

### m3: Dependencies are correct but incomplete

**Listed:** _"M2: Context assembler and prompt builder exist"_

This is true — M2-004 and M2-005 are prerequisites. However, the dependency is already **satisfied and surpassed** — M2 didn't just create the assembler and builder, it already implemented constraints injection end-to-end.

**Missing dependency (if task is rewritten for scaffolding):**
- M2-014: `ProjectInitUseCase` scaffolding pattern established (agents directory)
- M2-015: `ProjectInitUseCase` scaffolding pattern established (column-specs directory)

### m4: Out of Scope statement is correct but narrow

_"Enforcing constraints at review time (constraints are informational to the agent, not enforced by rubrics)"_

This is accurate per system design — constraints are context, not rubric criteria. However, the M5b-001 task (code-structure rubric) includes "naming conventions" and "dependency changes justified" as rubric criteria, which overlap with typical CONSTRAINTS.md content. The boundary between "informational constraints" and "enforced rubric criteria" will blur in practice. This is a design observation, not a task defect.

### m5: Acceptance criteria are all already satisfied

All four acceptance criteria checkboxes describe functionality that is already implemented and tested:
- `ContextAssembler` loads `.aeos/CONSTRAINTS.md` when present ✅ (M2-004)
- Constraints appear in assembled context ✅ (M2-004 + M2-005)
- Missing `CONSTRAINTS.md` does not cause an error ✅ (M2-004)
- Existing `ContextAssembler` tests cover constraints injection ✅ (M2-004)

An implementer checking these boxes would verify existing behaviour, not implement new behaviour.

---

## Correctness vs System Design

| Aspect | Task | System Design | Verdict |
|--------|------|---------------|---------|
| File path | `.aeos/CONSTRAINTS.md` | §3.3: `.aeos/CONSTRAINTS.md` | ✅ Match |
| Injection target | `[CONSTRAINTS]` section | §4.4: Inside `[CONTEXT]` block | ❌ Task label wrong, implementation correct |
| Phase scoping | Not mentioned | §8.1: PREPARE + BUILD + DEPLOY only (not PLAN) | ❌ Gap — implementation injects for all phases |
| Content purpose | "style rules, forbidden dependencies, naming conventions" | §8.2: "architectural laws" | ✅ Consistent |
| Error handling | "skip injection silently" | §3.3 implies optional | ✅ Match |
| Column scope | Title says "engineer-agent context" | §8.1: all PREPARE/BUILD/DEPLOY agents | ⚠️ Task title is narrow; actual injection is broader (already implemented for all agents) |

---

## File Path Alignment with Hexagonal Scaffold

| Referenced Path / Component | Exists in `src/` | Status |
|----------------------------|-----------------|--------|
| `ContextAssembler` | `src/application/services/context-assembler.ts` | ✅ Already has constraints loading |
| `ContextAssembler` tests | `src/application/services/context-assembler.test.ts` | ✅ Already has constraints tests |
| `PromptBuilder` | `src/application/services/prompt-builder.ts` | ✅ Already renders constraints |
| `PromptBuilder` tests | `src/application/services/prompt-builder.test.ts` | ✅ Already has constraints tests |
| `AssembledContext.constraints` | `src/domain/model/assembled-context.ts` | ✅ `constraints: string \| null` |
| `ProjectRepository.readConstraints` | `src/domain/ports/driven/project-repository.port.ts` | ✅ Line 17 |
| `FsProjectRepository.readConstraints` | `src/infrastructure/filesystem/fs-project.repository.ts` | ✅ Lines 107–112 |
| `ProjectInitUseCase` | `src/application/project-init.use-case.ts` | ✅ Missing CONSTRAINTS.md scaffolding |
| Runtime: `.aeos/CONSTRAINTS.md` | N/A (runtime content file) | ❌ Not scaffolded by any task |

No phantom paths. All referenced source paths exist and already contain the functionality the task describes.

---

## Dependency Validation

| Dependency | Status | Verified |
|-----------|--------|----------|
| M2-004: ContextAssembler | ✅ Complete (archived) | Constraints loading fully implemented |
| M2-005: PromptBuilder | ✅ Complete (archived) | Constraints rendering fully implemented |
| M2-014: Scaffolding pattern (agents) | ✅ Complete | Established `ProjectInitUseCase` scaffolding pattern |
| M2-015: Scaffolding pattern (column-specs) | ✅ Complete | Same pattern |

**Transitive:** No unresolved upstream dependencies. The gap is in what THIS task defines, not in what it depends on.

---

## Consistency with Sibling M5a Tasks

| Aspect | M5a-001 (agent spec) | M5a-002 (template) | M5a-003 (rubric) | **M5a-004 (constraints)** |
|--------|---------------------|-------------------|-----------------|--------------------------|
| Method | ❌ Agentic → amended to Dogfood | ❌ Agentic → amended to Dogfood | ❌ Agentic | ❌ Agentic |
| Agent | prompt-engineering | prompt-engineering | prompt-engineering | typescript-pro |
| Produces code changes | No (YAML file) | No (Markdown + YAML) | No (Markdown + YAML) | **Should** (scaffolding) |
| Already-implemented work | Partial (C1, C2 flagged) | Partial (C1 flagged) | None | **Full** (C1 — all steps done) |
| Dependency accuracy | Amended | Amended | Amended | ❌ Not amended |

**Key difference from siblings:** M5a-001 through M5a-003 all produce genuinely new artifacts (agent YAML, template Markdown, rubric Markdown). M5a-004 describes implementing functionality that already exists. This makes it fundamentally different from its siblings — it's not a content-production task, it's (at best) a scaffolding task.

---

## Cross-Task Coordination Issues

### X1: M5b-002 (AEOS-14) also modifies ContextAssembler

M5b-002 adds git diff injection to `ContextAssembler` for the CODE_REVIEW column. If M5a-004 is rewritten to add phase-scoping to `ContextAssembler.assemble()` (adding a `column` or `phase` parameter), this changes the method signature that M5b-002 also targets.

**Recommendation:** If phase-scoping is added, coordinate the signature change with M5b-002.

### X2: No task scaffolds `.aeos/rubrics/` directories either

The M5a-003 review flagged that `.aeos/rubrics/structure/` is not scaffolded by `ProjectInitUseCase`. The same gap exists for `.aeos/rubrics/templates/`, `.aeos/rubrics/drift/`, and `.aeos/rubrics/dod/`. A consolidated scaffolding task (proposed as M2-017 in the M3-002 review) would address both CONSTRAINTS.md and all rubric directories.

---

## Blocking Gaps

1. **C1 (CRITICAL):** Task steps 2–5 are already implemented. Executing the task as written produces no meaningful change. The task must be rewritten.

2. **H1 (MAJOR):** The only genuinely new work (`.aeos/CONSTRAINTS.md` placeholder scaffolding) is not properly specified as a code change to `ProjectInitUseCase`.

---

## Proposed Rewrite

The task should be rewritten to focus on the one piece of genuinely new work:

```markdown
# Task: Implement AEOS-12 — Scaffold CONSTRAINTS.md on Project Init

**Milestone:** M5a — Engineer Agent (Implementation Column)
**Agent:** typescript-pro
**Method:** Dogfood — run through AEOS pipeline

## Context
The system design (§3.3) shows `.aeos/CONSTRAINTS.md` as part of the per-project layout.
The `ContextAssembler` and `PromptBuilder` already load and render CONSTRAINTS.md content
(implemented in M2-004 and M2-005). However, no task creates the placeholder file during
`aeos project init`. Without it, the operator must manually create the file to use constraints.

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
- Enforcing constraints at review time

## Dependencies
- M2-004: ContextAssembler (✅ complete — already loads constraints)
- M2-005: PromptBuilder (✅ complete — already renders constraints)
- M2-014: Scaffolding pattern established (agents directory)
- M2-015: Scaffolding pattern established (column-specs directory)

## Definition of Done
- [ ] CONSTRAINTS.md placeholder created on `aeos project init`
- [ ] Tests pass covering creation and idempotency
- [ ] Existing ContextAssembler → PromptBuilder chain verified end-to-end with placeholder content
```

---

## Recommendations Summary

| # | Severity | Finding | Action |
|---|----------|---------|--------|
| C1 | Critical | Steps 2–5 already implemented in M2-004/M2-005 | Rewrite task — see proposed rewrite |
| H1 | Major | Only new work (placeholder scaffolding) not properly specified | Rewrite as `ProjectInitUseCase` change |
| M1 | Medium | Section label `[CONSTRAINTS]` doesn't match implementation `## Constraints` | Correct in rewrite |
| M2 | Medium | Phase scoping gap — PLAN agents receive constraints | Defer explicitly or add to scope |
| m1 | Minor | Method "Agentic implementation" ≠ action plan "Dogfood" | Fix in rewrite |
| m2 | Minor | Agent "typescript-pro" appropriate for rewrite, not original | N/A after rewrite |
| m3 | Minor | Dependencies incomplete for scaffolding work | Fix in rewrite |
| m4 | Minor | Out of Scope correct but narrow | Add phase-scoping note |
| m5 | Minor | All acceptance criteria already satisfied | Rewrite ACs |
| X1 | Cross-task | M5b-002 also modifies ContextAssembler | Coordinate if phase-scoping added |
| X2 | Cross-task | Consolidated scaffolding task (M2-017) would help | Track as strategic improvement |

---

## Summary

| Category | Count |
|----------|-------|
| Critical | 1 |
| Major | 1 |
| Medium | 2 |
| Minor | 5 |
| Cross-task | 2 |

**Overall:** This task is fundamentally redundant. The core feature it describes — loading CONSTRAINTS.md into the agent's context and rendering it in the prompt — was fully implemented as part of M2-004 (ContextAssembler) and M2-005 (PromptBuilder). The `ProjectRepository.readConstraints()` port, its `FsProjectRepository` adapter, the `AssembledContext.constraints` field, the `ContextAssembler.assemble()` call, and the `PromptBuilder.buildContextSection()` rendering are all in place and tested.

The only genuinely new work is creating a `.aeos/CONSTRAINTS.md` placeholder file during `aeos project init`, which aligns with the system design §3.3 per-project layout and follows the scaffolding pattern established by M2-014 (agents) and M2-015 (column-specs). The task should be rewritten from scratch to focus on this scaffolding concern, with proper `ProjectRepository` port extension, `FsProjectRepository` adapter implementation, `ProjectInitUseCase` integration, and idempotency tests.

The phase-scoping gap (PLAN agents receiving constraints despite system design §8.1 excluding them) is a pre-existing issue from M2-004 that should be tracked but is reasonably deferred.