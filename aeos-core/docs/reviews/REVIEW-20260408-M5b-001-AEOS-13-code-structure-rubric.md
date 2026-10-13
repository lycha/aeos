# Review: M5b-001 — AEOS-13 Code Structure Rubric (`code-structure.md`)

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Task file:** `docs/tasks/M5b-001-AEOS-13-code-structure-rubric.md`
**Cross-referenced against:**
- `docs/03-system-design.md` (System Design v0.3)
- `docs/02-prd.md` (PRD v0.1)
- `docs/05-action-plan-v1.md` (Action Plan)
- Sibling rubric tasks: M3-002 (prd-structure, amended), M3-004 (intent-drift), M4-003 (tech-spec-structure), M5a-003 (impl-structure, amended), M6-004 (qa-report-structure)
- Same-milestone task: M5b-002 (AEOS-14, diff injection)
- Column spec: M5b-000 (code-review column spec, archived/amended)
- Prior reviews: REVIEW-20260408-M5b-000, REVIEW-20260408-M5a-003, REVIEW-20260408-M4-003, REVIEW-20260408-M3-002
- Source code: `src/infrastructure/spec-loader/schemas.ts`, `src/infrastructure/filesystem/fs-rubric-loader.adapter.ts`, `src/application/ticket-run.use-case.ts`, `src/domain/model/column-spec.ts`, `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts`

---

## Verdict: APPROVE WITH REQUIRED CHANGES

Two medium issues, four minor issues. No critical or major blockers. The task is structurally consistent with sibling rubric tasks and correctly scoped per both the system design §5.3 rubric library and the action plan §M5b. All findings are addressable with task amendments — no source code changes required.

---

## Critical Issues

_None._

---

## Major Issues

_None._

---

## Medium Issues

### ⚠️ M1: Missing prerequisite — `.aeos/rubrics/structure/` directory not scaffolded

**Problem:**
The task writes to `.aeos/rubrics/structure/code-structure.md`, but no existing task or `ProjectInitUseCase` creates the `rubrics/` or `rubrics/structure/` directories. `ProjectInitUseCase` (`src/application/project-init.use-case.ts`) scaffolds `.aeos/agents/` and `.aeos/column-specs/` (via M2-014 and M2-015) but does **not** scaffold `.aeos/rubrics/` or its subdirectories.

This is a recurring gap flagged in every prior rubric task review:
- F-1 (MEDIUM) in M3-002 review → **amended with mkdir step**
- M1 (MEDIUM) in M4-003 review
- M1 (MEDIUM) in M5a-003 review
- Recurring in M3-004, M6-004, M6-005

The `FsRubricLoader` (`src/infrastructure/filesystem/fs-rubric-loader.adapter.ts`) reads from `.aeos/{rubricPath}` and returns `null` on ENOENT — it does not create directories.

**Impact:** The implementer must manually `mkdir -p .aeos/rubrics/structure/` before writing the rubric file. Fragile for automated (agentic) execution.

**Recommendation:** Add step 0 per the amended M3-002 pattern: _"Ensure `.aeos/rubrics/structure/` directory exists (create it if it does not)"_

### ⚠️ M2: `code-review.yaml` column spec reference uses wrong filename casing in DoD

**Task DoD line 31:**
> `Rubric path added to `code-review.yaml` column spec under `reviewerRubrics``

This is now correct (post M5b-000 review amendment — F-3 flagged `CODE_REVIEW.yaml` uppercase). However, the **current task file still reads:**

> "Add rubric path to `code-review.yaml` column spec under `reviewerRubrics`"

This is correctly lowercase. ✅ No issue here after re-checking.

**Actual M2 — `reviewerRubrics` currently empty in `code-review.yaml`:**

The live `.aeos/column-specs/code-review.yaml` has `reviewerRubrics: []` (line 8). The M5b-000 task Notes document the expected final state:
```yaml
reviewerRubrics:
  - rubrics/structure/code-structure.md
  - rubrics/drift/intent-drift.md
```

The task correctly says to add the rubric path to `reviewerRubrics`. However, the task does NOT specify **ordering** — the structure rubric should be the FIRST entry (pass-1) and `intent-drift.md` (pass-2) should come second. The flat `string[]` schema in `ColumnSpecSchema` means array ordering determines pass assignment. If AEOS-4 (intent-drift) runs first and adds its path, AEOS-13 must insert at position 0, not append.

**Recommendation:** Add ordering note to step 5: _"Add rubric path as the FIRST entry in `reviewerRubrics` (before `rubrics/drift/intent-drift.md` if already present) to ensure correct pass-1 ordering."_

---

## Minor Issues

### m1: Method header inconsistent with action plan

**Task header:** `Method: Agentic implementation`
**Action plan §M5b:** _"Method: Dogfood."_ — All M5b tickets are listed as dogfood tickets.

Pattern check across sibling rubric tasks:
- M3-002 (prd-structure, amended): `Dogfood — run through AEOS pipeline` ✅
- M4-003 (tech-spec-structure): `Agentic implementation` ❌
- M5a-003 (impl-structure): `Agentic implementation` ❌ (reviewed, same finding)
- **M5b-001 (code-structure): `Agentic implementation`** ❌
- M6-004 (qa-structure): `Agentic implementation` ❌

This is entrenched across all M4+ rubric tasks. Only M3-002 was amended.

**Recommendation:** Change to `Method: Dogfood — run through AEOS pipeline` per action plan, or accept "Agentic implementation" as the de facto convention and document the divergence.

### m2: Dependencies incomplete — wrong dependency listed

**Listed:** `M5a complete (engineer agent and implementation templates working)`

**Problems:**
1. **Too coarse.** "M5a complete" is the entire milestone. The rubric's actual dependency is only on the column spec file (`code-review.yaml`) that defines `reviewerRubrics`. The column spec is M5b-000 (archived, complete), not M5a.
2. **Wrong milestone.** The code-structure rubric targets the CODE_REVIEW column, not the IMPLEMENTATION column. The column spec dependency is M5b-000, not any M5a task.
3. **Missing explicit column spec dependency.** Every amended sibling rubric task lists its column spec as the dependency:
   - M3-002: `M3-000: product-scoping.yaml`
   - M4-003: `M4-000b: tech-spec.yaml`
   - M5a-003 (amended): `M5a-000: implementation.yaml`

**Recommendation:** Replace with:
```markdown
## Dependencies
- M5b-000: `code-review.yaml` column spec exists (provides `reviewerRubrics` array to update)
```

### m3: Acceptance criteria missing validation step from task step 4

**Task step 4:** _"Validate against a hypothetical sloppy code review that says 'LGTM' with no detail — confirm it FAILs"_
**Acceptance criteria:** No corresponding checkbox.

This gap has been flagged and fixed in M3-002 (amended) and flagged in M4-003, M5a-003. The pattern is:
```markdown
- [ ] Validated against a hypothetical sloppy code review — at least one criterion triggers FAIL
```

**Recommendation:** Add AC: `- [ ] Validated against a hypothetical sloppy code review (e.g. "LGTM" with no detail) — at least one criterion triggers WARN or FAIL`

### m4: Agent field says "prompt-engineering" — not a recognized agent spec

**Task header:** `Agent: prompt-engineering`

This is not a recognized agent in the system design §5.2 roster (`pm-agent`, `architect-agent`, `engineer-agent`, `qa-agent`, `reviewer-agent`). "prompt-engineering" appears to be a task classification label, not an agent reference. Sibling rubric tasks use the same label inconsistently:
- M3-002: `Agent: —` (dash, indicating no agent / dogfood)
- M4-003, M5a-003, M5b-001, M6-004: `Agent: prompt-engineering`

This is cosmetic — the `Agent` header is not consumed by any code. No action required, but noting for completeness.

---

## Correctness vs System Design


| Aspect | Task | System Design | Verdict |
|--------|------|---------------|---------|
| Artifact name | `code-structure.md` | §5.3: `code-structure.md` in `rubrics/structure/` | ✅ Exact match |
| Rubric path | `.aeos/rubrics/structure/code-structure.md` | §5.3: `structure/code-structure.md` | ✅ Correct directory |
| Rubric purpose | Reviewer pass-1 for CODE_REVIEW | §5.5: Pass 1 = structure vs rubric | ✅ Correct pass |
| Column | CODE_REVIEW | §2.1: "Code Review" in BUILD phase | ✅ Match |
| Column spec update | Add to `code-review.yaml` `reviewerRubrics` | §5.4: `rubrics: { pass1_structure: ... }` | ✅ Matches implemented schema (flat `string[]`), not system design's map |
| Criterion format | PASS/WARN/FAIL | §5.5/§5.6: reviewer outputs INFO/WARNING/BLOCKER | ✅ Complementary — rubric defines thresholds, reviewer maps to severity |
| Minimum criteria | ≥ 5 | Not specified in system design | ✅ Consistent with sibling pattern |
| Rubric description | §5.3: "naming, test coverage, no raw SQL, patterns" | Task step 2: "diff alignment, naming, error handling, test coverage, no dead code, dependency changes" | ✅ Superset — task covers more than system design's sketch |
| Review scope | "evaluate code review artifacts" | §2.1: "Code Review sign-off reviews the actual code diff" | ⚠️ Nuance — see note below |

**Note on review scope:** System design §2.1 says Code Review sign-off reviews "the actual code diff (correctness, adherence to CONSTRAINTS.md, test coverage)." The task says the rubric evaluates "code review artifacts." These are compatible: the code-review artifact (`code-review.md`) IS the structured output of reviewing the diff. The rubric ensures the review artifact itself is thorough — it does not directly evaluate the diff. The diff is evaluated by the engineer agent (worker); the rubric ensures the engineer's review output is adequate. This distinction is correct and consistent with the two-pass review architecture.

---

## File Path Alignment with Hexagonal Scaffold

| Referenced Path / Component | Exists in `src/` | Notes |
|----------------------------|-----------------|-------|
| `ColumnSpec.reviewerRubrics` | `src/domain/model/column-spec.ts` line 11 | ✅ `readonly reviewerRubrics: string[]` |
| `ColumnSpecSchema.reviewerRubrics` | `src/infrastructure/spec-loader/schemas.ts` line 14 | ✅ `z.array(z.string()).default([])` |
| `FsRubricLoader` | `src/infrastructure/filesystem/fs-rubric-loader.adapter.ts` | ✅ Reads from `.aeos/{rubricPath}` — returns `null` on ENOENT |
| `RubricLoader` port | `src/domain/ports/driven/rubric-loader.port.ts` | ✅ `load(rubricPath, projectPath): Promise<string \| null>` |
| `TicketRunUseCase` rubric loading | `src/application/ticket-run.use-case.ts` lines 179–184 | ✅ Iterates `columnSpec.reviewerRubrics`, loads each, injects into reviewer context |
| `YamlColumnSpecLoader` CODE_REVIEW mapping | `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts` line 19 | ✅ `[Column.CODE_REVIEW]: 'code-review'` |
| Runtime: `.aeos/rubrics/structure/code-structure.md` | N/A (runtime content file) | ✅ Path consistent with rubric directory convention |
| Runtime: `.aeos/column-specs/code-review.yaml` | `.aeos/column-specs/code-review.yaml` exists | ✅ File exists, `reviewerRubrics: []` ready for update |

No source code changes required — task produces a content file and updates a YAML config. No phantom paths in `src/`.

**Runtime rubric loading path verified:**
1. `code-review.yaml` will have `reviewerRubrics: ['rubrics/structure/code-structure.md']`
2. `TicketRunUseCase` calls `this.rubricLoader.load('rubrics/structure/code-structure.md', projectPath)`
3. `FsRubricLoader` resolves to `{projectPath}/.aeos/rubrics/structure/code-structure.md`
4. Content is injected into `enrichedContext.priorArtifacts` as `reviewer-rubrics.md`

This chain is fully implemented and tested. The rubric path will resolve correctly through `FsRubricLoader` — provided the directory exists (see M1).

---

## Dependency Validation

| Dependency | Status | Verified |
|-----------|--------|----------|
| Listed: "M5a complete" | ⬜ Not yet complete | Overly broad — see m2 |
| Actual: M5b-000 (`code-review.yaml`) | ✅ Complete | Archived; `.aeos/column-specs/code-review.yaml` exists on disk |
| Implicit: M3-004 (AEOS-4, `intent-drift.md`) | ⬜ Not yet complete | Both rubrics will coexist in `code-review.yaml reviewerRubrics` |

**Transitive dependency chain:**
- M5b-001 (this task) → M5b-000 (column spec, ✅ complete) → M2 (schema, loader, ✅ complete)
- If dogfood: M5b-001 would also transit through pipeline columns, requiring M5a complete

**Missing explicit dependencies:**
- M5b-000 should be listed as the primary dependency (task updates `code-review.yaml` which M5b-000 creates)
- "M5a complete" is only needed if running through the pipeline (dogfood), not for the task deliverable itself

---

## Consistency with Sibling Rubric Tasks

| Aspect | M3-002 (prd, amended) | M4-003 (tech-spec) | M5a-003 (impl, amended) | **M5b-001 (code)** | M6-004 (qa) |
|--------|----------------------|--------------------|-----------------------|---------------------|-------------|
| Method | Dogfood ✅ | ❌ Agentic | ❌ Agentic | ❌ Agentic | ❌ Agentic |
| mkdir step | ✅ | ❌ | ✅ (amended) | ❌ | ❌ |
| Validation AC | ✅ | ❌ | ✅ (amended) | ❌ | ❌ |
| Criteria count | 5 | 6 | 5 | 6 | varies |
| Dep = column spec | ✅ (M3-000) | ❌ (M4-001) | ✅ (amended, M5a-000) | ❌ (M5a) | varies |
| Ordering note | N/A (first rubric) | ❌ | ✅ (amended) | ❌ | ❌ |
| PASS/WARN/FAIL format | ✅ | ✅ | ✅ | ✅ | ✅ |
| ≥5 criteria AC | ✅ | ✅ | ✅ | ✅ | ✅ |

**Key gap vs amended siblings:** M3-002 and M5a-003 were amended post-review to fix mkdir step, validation AC, dependency precision, and ordering notes. These same fixes were **not propagated** to M5b-001 or M6-004. Each review flags the same issues.

---

## Cross-Task Coordination Issues

### X1: M5b-002 (AEOS-14) diff injection — no conflict

M5b-002 modifies `ContextAssembler` to inject git diffs when the column is CODE_REVIEW. This is independent of the rubric — the rubric evaluates the review artifact, not the diff itself. The rubric criterion "diff alignment with tech spec" means the code review artifact should demonstrate that the reviewer checked alignment, not that the rubric directly consumes the diff.

No coordination needed. ✅

### X2: Rubric ordering in `code-review.yaml`

When both AEOS-13 (this task) and AEOS-4 (intent-drift) are complete, `code-review.yaml` `reviewerRubrics` should be:
```yaml
reviewerRubrics:
  - rubrics/structure/code-structure.md    # pass 1 — structure
  - rubrics/drift/intent-drift.md          # pass 2 — drift
```

M5b-000 Notes correctly show this ordering. M3-004 (AEOS-4) says "Add to ALL column specs" but does not specify ordering. Neither does this task. Whichever runs second must maintain correct ordering.

**Recommendation:** Add ordering note per M2 finding above.

### X3: M5b-000 review F-1 — worker agent ambiguity

M5b-000 review flagged that system design §2.1 labels Code Review as "(reviewer)" while §2.2 shows a two-agent model. This ambiguity affects the rubric's scope: is the rubric evaluating the engineer agent's code review output, or the reviewer agent's sign-off? Per the column spec (`workerAgentFile: agents/engineer-agent.yaml`), the engineer agent is the worker producing `code-review.md`. The rubric evaluates this worker output. The reviewer agent then signs off using the rubric. This is consistent.

No blocking issue. ℹ️

---

## Blocking Gaps

**No hard blockers.** The task can be executed as written with one manual workaround:

1. **M1 (MEDIUM):** The implementer must create `.aeos/rubrics/structure/` before writing the rubric file. Known workaround from prior reviews. Not blocking if the implementer knows to do it, but fragile for automated execution.

**Soft blockers (won't prevent task completion but affect downstream correctness):**

2. **M2 (MEDIUM):** Without an ordering note, the implementer may append the rubric path after `intent-drift.md` (if AEOS-4 runs first), causing the reviewer to run drift detection as pass-1 and structure as pass-2 — inverting the intended review sequence.

---

## Recommendations Summary

| # | Severity | Finding | Action |
|---|----------|---------|--------|
| M1 | Medium | `.aeos/rubrics/structure/` not scaffolded | Add mkdir step per amended M3-002 pattern |
| M2 | Medium | Missing rubric ordering note for `reviewerRubrics` | Add ordering instruction to step 5 |
| m1 | Minor | Method "Agentic implementation" ≠ action plan "Dogfood" | Align or document divergence |
| m2 | Minor | Dependencies: "M5a complete" is wrong — should be M5b-000 column spec | Replace with `M5b-000: code-review.yaml` |
| m3 | Minor | AC missing validation step from task step 4 | Add validation checkbox |
| m4 | Minor | Agent "prompt-engineering" is not a recognized agent spec | Cosmetic — no action required |
| X1 | Cross-task | M5b-002 diff injection | ✅ No conflict |
| X2 | Cross-task | Rubric ordering in `code-review.yaml` | Addressed by M2 recommendation |

---

## Proposed Amendments

### 1. Add mkdir step (M1)

Amend step 1:
```markdown
1. Ensure `.aeos/rubrics/structure/` directory exists (create it if it does not)
2. Create `.aeos/rubrics/structure/code-structure.md` — a rubric for evaluating code review artifacts
```
(Renumber subsequent steps.)

### 2. Add rubric ordering note (M2)

Amend step 5 (renumbered to step 6):
```markdown
6. Add rubric path to `code-review.yaml` column spec under `reviewerRubrics` as the FIRST entry
   (before `rubrics/drift/intent-drift.md` if already present) to ensure correct pass-1 ordering
```

### 3. Fix dependencies (m2)

```markdown
## Dependencies
- M5b-000: `code-review.yaml` column spec exists (provides `reviewerRubrics` array to update)
```

### 4. Add validation AC (m3)

```markdown
- [ ] Validated against a hypothetical sloppy code review (e.g. "LGTM" with no detail) — at least one criterion triggers WARN or FAIL
```

### 5. Update Method header (m1)

```markdown
**Method:** Dogfood — run through AEOS pipeline
```

---

## Summary

| Category | Count |
|----------|-------|
| Critical | 0 |
| Major | 0 |
| Medium | 2 |
| Minor | 4 |
| Cross-task | 3 (0 conflicts, 2 coordination notes, 1 info) |

**Overall:** The task is well-scoped and correctly aligned with both the system design (§5.3 explicitly names `code-structure.md` under `rubrics/structure/`) and the action plan (§M5b, AEOS-13). The rubric path `.aeos/rubrics/structure/code-structure.md` follows the system design directory convention exactly — unlike `impl-structure.md` (M5a-003) which was a new addition, `code-structure.md` is explicitly listed in the system design §5.3 rubric library. The `reviewerRubrics` field on `ColumnSpecSchema` is a flat `string[]` array that will accept the path, and the `FsRubricLoader` → `TicketRunUseCase` chain for loading and injecting rubric content is fully implemented and tested — no code changes needed.

The two medium findings are: (1) the recurring `.aeos/rubrics/structure/` directory scaffolding gap (flagged in every prior rubric review, amended only in M3-002 and M5a-003), and (2) a missing rubric ordering note that could cause pass-1/pass-2 inversion if AEOS-4 runs first. Both are addressable with simple task amendments following patterns already established in M3-002 and M5a-003 reviews.

The dependency listing ("M5a complete") is incorrect — the task depends on M5b-000 (`code-review.yaml` column spec), not M5a. M5a is a prerequisite for the CODE_REVIEW column to function in the pipeline, but the rubric file creation only requires the column spec to exist for the `reviewerRubrics` update. This should be corrected for traceability.

The six rubric criteria listed in step 2 (diff alignment, naming, error handling, test coverage, no dead code, dependency changes) are a superset of the system design §5.3 sketch ("naming, test coverage, no raw SQL, patterns") and adequately cover the code review concerns documented in §2.1 ("correctness, adherence to CONSTRAINTS.md, test coverage"). The task criteria are specific to code review artifacts rather than implementation plans, correctly distinguishing M5b-001 from M5a-003.