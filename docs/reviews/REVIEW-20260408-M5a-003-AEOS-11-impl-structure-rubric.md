# Review: M5a-003 — AEOS-11 Implementation Structure Rubric (`impl-structure.md`)

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Task file:** `docs/tasks/M5a-003-AEOS-11-impl-structure-rubric.md`
**Cross-referenced against:**
- `docs/03-system-design.md` (System Design v0.3)
- `docs/02-prd.md` (PRD v0.1)
- `docs/05-action-plan-v1.md` (Action Plan)
- Sibling rubric tasks: M3-002 (prd-structure-rubric, amended), M3-004 (intent-drift-rubric), M4-003 (tech-spec-rubric), M5b-001 (code-structure-rubric), M6-004 (qa-structure-rubric)
- Same-milestone tasks: M5a-001 (engineer-agent, amended), M5a-002 (impl-notes-template, amended), M5a-004 (constraints-injection)
- Column spec: M5a-000 (implementation column spec, archived/amended)
- Prior reviews: REVIEW-20260408-M5a-000, REVIEW-20260408-M5a-001, REVIEW-20260408-M5a-002, REVIEW-20260408-M4-003, REVIEW-20260408-M3-002
- Source code: `src/infrastructure/spec-loader/schemas.ts`, `src/infrastructure/filesystem/fs-rubric-loader.adapter.ts`, `src/application/ticket-run.use-case.ts`, `src/domain/model/column-spec.ts`

---

## Verdict: APPROVE WITH REQUIRED CHANGES

One medium issue (recurring directory scaffolding gap), one medium cross-task filename mismatch, and four minor issues. No critical or major blockers. The task is structurally consistent with sibling rubric tasks (M3-002, M4-003, M5b-001) and correctly scoped. All findings are addressable with task amendments — no source code changes required.

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
The task writes to `.aeos/rubrics/structure/impl-structure.md`, but no existing task creates the `rubrics/` or `rubrics/structure/` directories. This exact gap has been flagged in every prior rubric task review:
- F-1 (MEDIUM) in the M3-002 review (prd-structure rubric) → **amended with mkdir step**
- M1 (MEDIUM) in the M4-003 review (tech-spec rubric)
- Recurring in M3-004, M5b-001, M6-004, M6-005

`ProjectInitUseCase` (`src/application/project-init.use-case.ts`) scaffolds `.aeos/agents/` and `.aeos/column-specs/` (via M2-014 and M2-015) but does **not** scaffold `.aeos/rubrics/` or `.aeos/rubrics/structure/`. The `FsRubricLoader` (`src/infrastructure/filesystem/fs-rubric-loader.adapter.ts`) reads from `.aeos/{rubricPath}` but does not create directories.

**Impact:** The implementer must manually `mkdir -p .aeos/rubrics/structure/` or the file creation will fail. This is a known workaround documented in prior reviews. Not blocking if the implementer knows to do it, but fragile for automated execution.

**Recommendation:**
1. Add step 0 to this task (matching amended M3-002 pattern): _"Ensure `.aeos/rubrics/structure/` directory exists (create it if it does not)"_
2. Strategically: the M3-002 review recommended a scaffolding task (M2-017) to add all rubric subdirectories to `ProjectInitUseCase`. This would resolve the gap for all rubric/template tasks across M3–M6.

### ⚠️ M2: Rubric filename mismatch between M5a-000 (amended) and M5a-003

**M5a-003 task (this task):** Creates `impl-structure.md` at `.aeos/rubrics/structure/impl-structure.md`

**M5a-000 (archived, amended):** Notes section now says:
```yaml
reviewerRubrics:
  - rubrics/structure/implementation-structure.md
  - rubrics/drift/intent-drift.md
```

These names **do not match**: `impl-structure.md` ≠ `implementation-structure.md`.

**History:** The M5a-000 review (F-1) identified a mismatch and recommended aligning to `implementation-structure.md`. The M5a-000 task was amended accordingly. However, M5a-003 was NOT amended — it still produces `impl-structure.md`. The "fix" introduced a new mismatch.

**Impact:** When AEOS-11 completes and the rubric path is added to `implementation.yaml`, the `FsRubricLoader` will look for whichever filename is in the column spec's `reviewerRubrics`. If the column spec says `implementation-structure.md` but the file is `impl-structure.md`, the loader returns `null` (ENOENT handled gracefully) and the reviewer runs without the structure rubric — silently degrading review quality.

**Recommendation:** Align on **one name** across M5a-000 and M5a-003. Two options:
1. **Use `impl-structure.md`** (M5a-003's current name): Update M5a-000 Notes to `rubrics/structure/impl-structure.md`. This is shorter and consistent with M5a-002's `impl-notes-template.md` naming convention.
2. **Use `implementation-structure.md`** (M5a-000's amended name): Update M5a-003 throughout. This is more descriptive and closer to sibling naming (`prd-structure.md`, `tech-spec-structure.md`, `code-structure.md`).

**Note:** Sibling rubrics use full-word names: `prd-structure.md`, `tech-spec-structure.md`, `code-structure.md`, `qa-report-structure.md`. Option 2 would be more consistent with siblings. However, M5a-002 already established `impl-notes-template.md` as a shortened convention. Either choice is defensible — the key is consistency between M5a-000 and M5a-003.

---

## Minor Issues

### m1: Method header inconsistent with action plan

**Task header:** `Method: Agentic implementation`
**Action plan §M5a:** _"Method: Dogfood."_ — All M5a tickets are listed as dogfood tickets.

Pattern check across sibling rubric tasks:
- M3-002 (prd-structure, amended): `Dogfood — run through AEOS pipeline` ✅
- M4-003 (tech-spec-structure): `Agentic implementation` ❌
- **M5a-003 (impl-structure): `Agentic implementation`** ❌
- M5b-001 (code-structure): `Agentic implementation` ❌
- M6-004 (qa-structure): `Agentic implementation` ❌

This is entrenched across all M4+ rubric tasks. Only M3-002 was amended.

**Recommendation:** Change to `Method: Dogfood — run through AEOS pipeline` per action plan, or accept "Agentic implementation" as the de facto convention for rubric tasks and document the divergence.

### m2: Dependencies incomplete — missing column spec dependency

**Listed:** _"M5a-001: AEOS-9 complete (`engineer-agent.yaml` exists)"_

**Missing:**
- **M5a-000: `implementation.yaml` column spec** — The Definition of Done requires adding the rubric path to `implementation.yaml` `reviewerRubrics`. The column spec must exist before it can be updated. M5a-000 is archived (complete), so this is technically satisfied, but the dependency should be listed for traceability. This is the same issue flagged as m2 in the M4-003 review.
- **M3-004 (AEOS-4):** The `implementation.yaml` `reviewerRubrics` will ultimately contain both `rubrics/structure/impl-structure.md` (this task) and `rubrics/drift/intent-drift.md` (AEOS-4). M3-004 says "Add to ALL column specs" which would include `implementation.yaml`. Neither task explicitly coordinates the ordering.

The dependency on M5a-001 (engineer-agent) is arguably too strong — the rubric defines what a good implementation plan looks like regardless of which agent produces it. The rubric depends on knowing the column spec exists (to update `reviewerRubrics`), not on the agent spec.

**Recommendation:** Weaken to:
```markdown
## Dependencies
- M5a-000: `implementation.yaml` column spec exists (provides `reviewerRubrics` array to update)
```

### m3: Acceptance criteria missing validation step from task step 4

**Task step 4:** _"Validate against a hypothetical incomplete implementation plan (e.g. missing test plan) to confirm it catches the gap"_
**Acceptance criteria:** No corresponding checkbox.

This exact gap was flagged as:
- F-4 (LOW) in the M3-002 review → M3-002 was amended with: `- [ ] Validated against a hypothetical bad PRD — at least one criterion triggers WARN or FAIL`
- m4 in the M4-003 review → recommended adding validation AC

**Recommendation:** Add AC: `- [ ] Validated against a hypothetical incomplete implementation plan — at least one criterion triggers WARN or FAIL`

### m4: Rubric criteria list is thin vs sibling rubric tasks

**Task step 2 criteria:** "all tech spec requirements addressed, file changes are justified, test plan covers happy path and error cases, rollback plan exists, no orphan changes" (5 criteria — meeting but not exceeding the ≥5 minimum)

**Comparison with sibling rubric scope:**
- M3-002 (prd-structure): problem statement clarity, persona definition, success metrics, scope, AC testability (5)
- M4-003 (tech-spec-structure): component diagram, API contracts, data model, error handling, dependencies, test strategy (6)
- M5b-001 (code-structure): diff alignment, naming, error handling, test coverage, no dead code, dependency changes (6)

M5a-003's 5 criteria are adequate but lean. Consider whether additional criteria would strengthen the rubric:
- **Approach / Design Decisions** — system design §2.1 says Implementation sign-off reviews "approach, reasoning, design decisions." This is distinct from "file changes are justified."
- **Incremental delivery** — can the plan be executed in reviewable steps?

**Impact:** Low — ≥5 is met. The rubric can always be iterated.

---

## Correctness vs System Design

| Aspect | Task | System Design | Verdict |
|--------|------|---------------|---------|
| Artifact name | `impl-structure.md` | §5.3: Not listed (new rubric) | ✅ Acceptable addition |
| Rubric path | `.aeos/rubrics/structure/impl-structure.md` | §5.3: `rubrics/structure/` directory | ✅ Correct directory |
| Rubric purpose | Reviewer pass-1 for IMPLEMENTATION | §5.5: Pass 1 = structure vs rubric | ✅ Correct pass |
| Column | IMPLEMENTATION | §2.1: "Implement (eng agent)" in BUILD | ✅ Match |
| Column spec update | Add to `implementation.yaml` `reviewerRubrics` | §5.4: `rubrics: { pass1_structure: ... }` | ✅ Matches implemented schema (flat `string[]` array), not system design's map |
| Criterion format | PASS/WARN/FAIL | §5.5/§5.6: reviewer outputs INFO/WARNING/BLOCKER | ✅ Complementary — rubric defines thresholds, reviewer maps to severity |
| Minimum criteria | ≥ 5 | Not specified | ✅ Consistent with sibling pattern |
| Review scope | "implementation notes artifacts before advancement to CODE_REVIEW" | §2.1: "Implementation sign-off reviews `implementation-notes.md` (the plan — approach, reasoning, design decisions)" | ✅ Correct scope |

**Note on system design §5.3:** The rubric library lists `prd-structure.md`, `tech-spec-structure.md`, `code-structure.md`, and `qa-report-structure.md` but does NOT list an implementation structure rubric. The action plan §M5a introduces AEOS-11 as a new rubric. This is a conscious extension of the system design — not a conflict.

**Note on `reviewerRubrics` schema:** The system design §5.4 uses a structured map (`pass1_structure`, `pass2_drift`). The implemented `ColumnSpecSchema` uses a flat `string[]` array (M2-007 review m4 flagged this as medium risk). The task correctly targets the **implemented** schema. The flat array means rubric ordering in the YAML determines pass1 vs pass2 injection — `impl-structure.md` should be listed before `intent-drift.md` in `implementation.yaml` for correct pass ordering.

---

## File Path Alignment with Hexagonal Scaffold

| Referenced Path / Component | Exists in `src/` | Notes |
|----------------------------|-----------------|-------|
| `ColumnSpec.reviewerRubrics` | `src/domain/model/column-spec.ts` line 11 | ✅ `readonly reviewerRubrics: string[]` |
| `ColumnSpecSchema.reviewerRubrics` | `src/infrastructure/spec-loader/schemas.ts` line 14 | ✅ `z.array(z.string()).default([])` |
| `FsRubricLoader` | `src/infrastructure/filesystem/fs-rubric-loader.adapter.ts` | ✅ Reads from `.aeos/{rubricPath}` — returns `null` on ENOENT |
| `RubricLoader` port | `src/domain/ports/driven/rubric-loader.port.ts` | ✅ `load(rubricPath, projectPath): Promise<string \| null>` |
| `TicketRunUseCase` rubric loading | `src/application/ticket-run.use-case.ts` lines 179–184 | ✅ Iterates `columnSpec.reviewerRubrics`, loads each, injects into reviewer context |
| `YamlColumnSpecLoader` IMPLEMENTATION mapping | `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts` line 18 | ✅ `[Column.IMPLEMENTATION]: 'implementation'` |
| Runtime: `.aeos/rubrics/structure/impl-structure.md` | N/A (runtime content file) | ✅ Path consistent with rubric directory convention |
| Runtime: `.aeos/column-specs/implementation.yaml` | N/A (runtime config) | ✅ Loader resolves `IMPLEMENTATION` → `implementation.yaml` |

No source code changes required — task produces a content file and updates a YAML config. No phantom paths in `src/`.

**Runtime rubric loading path verified:**
1. `implementation.yaml` will have `reviewerRubrics: ['rubrics/structure/impl-structure.md']`
2. `TicketRunUseCase` calls `this.rubricLoader.load('rubrics/structure/impl-structure.md', projectPath)`
3. `FsRubricLoader` resolves to `{projectPath}/.aeos/rubrics/structure/impl-structure.md`
4. Content is injected into `enrichedContext.priorArtifacts` as `reviewer-rubrics.md`

This chain is fully implemented and tested. The rubric path will resolve correctly through `FsRubricLoader` — provided the filename in the column spec matches the actual file (see M2).

---

## Dependency Validation

| Dependency | Status | Verified |
|-----------|--------|----------|
| M5a-001 (AEOS-9): `engineer-agent.yaml` | ⬜ Not yet complete | Task file in `docs/tasks/` (not archived). Amended. |
| M5a-000 (implicit, missing): `implementation.yaml` column spec | ✅ Complete | Archived; review at `REVIEW-20260408-M5a-000`. |
| M3-004 (AEOS-4, implicit): `intent-drift.md` | ⬜ Not yet complete | Both rubrics will coexist in `implementation.yaml reviewerRubrics`. |

**Transitive dependency chain:**
- M5a-003 (this task) → M5a-001 (listed) → M4 complete → M3 complete
- If dogfood: M5a-003 would also transit through pipeline columns, requiring all prior column specs, agents, and reviewer
- M5a-003 and M5a-002 share the same dependency (M5a-001) and have no ordering constraint between them — either can execute first

**Missing explicit dependencies:**
- M5a-000 should be listed (task updates `implementation.yaml` which M5a-000 creates) — see m2
- The dependency on M5a-001 is stronger than needed — see m2

---

## Consistency with Sibling Rubric Tasks

| Aspect | M3-002 (prd, amended) | M4-003 (tech-spec) | **M5a-003 (impl)** | M5b-001 (code) | M6-004 (qa) |
|--------|----------------------|--------------------|--------------------|-----------------|-------------|
| Method | Dogfood ✅ | ❌ Agentic | ❌ Agentic | ❌ Agentic | ❌ Agentic |
| mkdir step | ✅ | ❌ | ❌ | ❌ | ❌ |
| Validation AC | ✅ | ❌ | ❌ | ❌ | ❌ |
| Criteria count | 5 | 6 | 5 | 6 | varies |
| Dep = column spec | ✅ (M3-000) | ❌ (M4-001) | ❌ (M5a-001) | ✅ (M5a) | varies |
| PASS/WARN/FAIL format | ✅ | ✅ | ✅ | ✅ | ✅ |
| ≥5 criteria AC | ✅ | ✅ | ✅ | ✅ | ✅ |

**Key gap vs M3-002:** The M3-002 task was amended post-review to fix: mkdir step (F-1), weakened dependency (F-2), and validation AC (F-4). These same fixes were **not propagated** to M5a-003 or any subsequent rubric tasks. This is a systemic pattern — each review flags the same issues.

---

## Cross-Task Coordination Issues

### X1: M5a-002 (amended) cross-references this rubric

M5a-002 step 3 (amended): _"Verify the template captures all criteria from `impl-structure.md` (AEOS-11, if already written — otherwise align with expected criteria)"_

M5a-003 rubric criteria: all tech spec requirements addressed, file changes justified, test plan, rollback plan, no orphan changes.
M5a-002 template sections (amended): Summary, Approach & Design Decisions, Requirements Traceability, Files Changed, Test Plan, Rollback Plan, Open Risks.

Mapping:
- "all tech spec requirements addressed" → ✅ "Requirements Traceability"
- "file changes are justified" → ✅ "Files Changed (with rationale per file)"
- "test plan covers happy path and error cases" → ✅ "Test Plan"
- "rollback plan exists" → ✅ "Rollback Plan"
- "no orphan changes" → ✅ "Requirements Traceability" (covers traceability in both directions)

After M5a-002's amendments, all 5 rubric criteria have corresponding template sections. ✅ No conflict.

### X2: Rubric ordering in `implementation.yaml`

When both AEOS-11 (this task) and AEOS-4 (intent-drift) are complete, `implementation.yaml` `reviewerRubrics` should be:
```yaml
reviewerRubrics:
  - rubrics/structure/impl-structure.md    # pass 1 — structure
  - rubrics/drift/intent-drift.md          # pass 2 — drift
```

The flat `string[]` schema means ordering determines pass assignment. M3-004 (AEOS-4) says "Add to ALL column specs" but does not specify ordering. Neither does this task. The M5a-000 Notes section correctly shows structure first, drift second — but neither producing task references this ordering.

**Recommendation:** Add a note to step 5: _"Add as the FIRST entry in `reviewerRubrics` (before `intent-drift.md` if already present) to ensure correct pass-1 injection ordering."_

### X3: M5a-000 `requiredSections: []` — potential downstream update

The implementation column spec (M5a-000) has `requiredSections: []`. The rubric criteria imply certain sections should be present in the implementation notes artifact. Once the rubric is finalized, `requiredSections` in `implementation.yaml` could be updated to enable rule-based output validation (before the LLM reviewer runs). This is not blocked by M5a-003 but is a downstream coordination opportunity.

---

## Blocking Gaps

**No hard blockers.** The task can be executed as written with one manual workaround:

1. **M1 (MEDIUM):** The implementer must create `.aeos/rubrics/structure/` before writing the rubric file. This is a known workaround documented in prior reviews. Not blocking if the implementer knows to do it, but fragile for automated execution.

**Soft blockers (won't prevent task completion but affect downstream correctness):**

2. **M2 (MEDIUM):** The rubric filename mismatch between M5a-000 (`implementation-structure.md`) and M5a-003 (`impl-structure.md`) must be resolved before the rubric is added to `implementation.yaml`. If unresolved, `FsRubricLoader` will silently fail to find the rubric file, and the reviewer will run without the structure rubric.

---

## Recommendations Summary

| # | Severity | Finding | Action |
|---|----------|---------|--------|
| M1 | Medium | `.aeos/rubrics/structure/` not scaffolded | Add mkdir step per amended M3-002 pattern |
| M2 | Medium | Rubric filename mismatch: M5a-000 says `implementation-structure.md`, M5a-003 says `impl-structure.md` | Align both to one name (recommend `impl-structure.md` given M5a-002 precedent) |
| m1 | Minor | Method "Agentic implementation" ≠ action plan "Dogfood" | Align or document divergence |
| m2 | Minor | Dependencies: M5a-000 missing, M5a-001 too strong | Weaken to M5a-000 column spec dependency |
| m3 | Minor | AC missing validation step from task step 4 | Add validation checkbox |
| m4 | Minor | Criteria list is thin (exactly 5, no extras) | Consider adding approach/design decisions criterion |
| X1 | Cross-task | M5a-002 template alignment | ✅ No conflict after M5a-002 amendments |
| X2 | Cross-task | Rubric ordering in `implementation.yaml` | Add ordering note to step 5 |

---

## Proposed Amendments

### 1. Add mkdir step (M1)

Amend step 1:
```markdown
1. Ensure `.aeos/rubrics/structure/` directory exists (create it if it does not)
2. Create `.aeos/rubrics/structure/impl-structure.md` — a rubric for evaluating implementation notes
```
(Renumber subsequent steps.)

### 2. Resolve filename mismatch (M2)

**Option A (recommended):** Update M5a-000 Notes to use `rubrics/structure/impl-structure.md` (matching this task).
**Option B:** Update M5a-003 throughout to use `implementation-structure.md` (matching amended M5a-000).

### 3. Weaken and expand dependencies (m2)

```markdown
## Dependencies
- M5a-000: `implementation.yaml` column spec exists (provides `reviewerRubrics` array to update)
```

### 4. Add validation AC (m3)

```markdown
- [ ] Validated against a hypothetical incomplete implementation plan (e.g. missing test plan) — at least one criterion triggers WARN or FAIL
```

### 5. Add rubric ordering note to step 5 (X2)

```markdown
5. Add rubric path to `implementation.yaml` column spec under `reviewerRubrics` as the FIRST entry
   (before `rubrics/drift/intent-drift.md` if already present) to ensure correct pass-1 ordering
```

### 6. Add Out of Scope clarification (m4)

```markdown
## Out of Scope
- CONSTRAINTS.md injection (AEOS-12)
- Code structure rubric for CODE_REVIEW (AEOS-13)
- Approach / design decision quality (evaluated informally via rubric criteria, not as a separate gate)
```

---

## Summary

| Category | Count |
|----------|-------|
| Critical | 0 |
| Major | 0 |
| Medium | 2 |
| Minor | 4 |
| Cross-task | 3 (0 conflicts, 2 coordination notes, 1 downstream opportunity) |

**Overall:** The task is well-scoped and correctly aligned with both the action plan (§M5a, AEOS-11) and the implemented codebase. The rubric path `.aeos/rubrics/structure/impl-structure.md` follows the system design §5.3 directory convention, and the `reviewerRubrics` field on `ColumnSpecSchema` is a flat `string[]` array that will accept the path. The `FsRubricLoader` → `TicketRunUseCase` chain for loading and injecting rubric content is fully implemented and tested — no code changes needed.

The two medium findings are: (1) the recurring `.aeos/rubrics/structure/` directory scaffolding gap (flagged in every prior rubric review, amended only in M3-002), and (2) a rubric filename mismatch between M5a-000 (amended to `implementation-structure.md`) and M5a-003 (uses `impl-structure.md`). The mismatch was introduced by the M5a-000 amendment — M5a-003 was not updated to match. This must be resolved before the rubric is wired into `implementation.yaml`, or the reviewer will silently run without the structure rubric.

The four minor findings mirror patterns seen across all M4+ rubric tasks: method header divergence, dependency precision, missing validation AC, and criteria scope. All are addressable with task amendments. The cross-task coordination with M5a-002 (template alignment) is clean after M5a-002's amendments — all 5 rubric criteria have corresponding template sections. No source code changes are required.
