# Review: M4-003 — AEOS-7 Tech Spec Structure Rubric (`tech-spec-structure.md`)

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Task file:** `docs/tasks/M4-003-AEOS-7-tech-spec-rubric.md`
**Cross-referenced against:**
- `docs/03-system-design.md` (System Design v0.3)
- `docs/02-prd.md` (PRD v0.1)
- `docs/05-action-plan-v1.md` (Action Plan)
- Sibling tasks: M3-002 (prd-structure-rubric), M3-004 (intent-drift-rubric), M4-001 (architect-agent), M4-002 (spike-template), M4-004 (tech-spec-template), M5a-003 (impl-structure-rubric), M5b-001 (code-structure-rubric)
- Column spec tasks: M4-000b (tech-spec column spec, archived)
- Prior reviews: REVIEW-20260408-M4-000b, REVIEW-20260408-M4-001-AEOS-5, REVIEW-20260408-M4-002-AEOS-6, REVIEW-20260408-M3-002-AEOS-2, REVIEW-20260408-M3-004-AEOS-4
- Source code: `src/infrastructure/spec-loader/schemas.ts`, `src/infrastructure/filesystem/fs-rubric-loader.adapter.ts`, `src/application/ticket-run.use-case.ts`, `src/domain/model/column-spec.ts`

---

## Verdict: APPROVE WITH REQUIRED CHANGES

One medium issue and four minor issues. No critical blockers, but the medium finding (M1) has been flagged in every prior rubric task review and remains unaddressed at the systemic level. The task is structurally consistent with sibling rubric tasks (M3-002, M3-004, M5a-003) and correctly scoped.

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
The task writes to `.aeos/rubrics/structure/tech-spec-structure.md`, but no existing task creates the `rubrics/` or `rubrics/structure/` directories. This exact gap was flagged as:
- F-1 (MEDIUM) in the M3-002 review (prd-structure rubric)
- Part of F-5 in the M3-003 review (prd-template)
- m3 in the M4-002 review (spike-template)

`ProjectInitUseCase` (`src/application/project-init.use-case.ts`) scaffolds `.aeos/agents/` and `.aeos/column-specs/` (via M2-014 and M2-015) but does **not** scaffold `.aeos/rubrics/` or `.aeos/rubrics/structure/`. The `FsRubricLoader` (`src/infrastructure/filesystem/fs-rubric-loader.adapter.ts`) reads from `.aeos/{rubricPath}` but does not create directories.

**Impact:** The implementer must manually `mkdir -p .aeos/rubrics/structure/` or the file creation will fail. This is a recurring gap across all rubric tasks (M3-002, M3-004, M4-003, M5a-003, M5b-001, M6-004, M6-005).

**Recommendation:**
1. Add step 0 to this task: _"Ensure `.aeos/rubrics/structure/` directory exists (create it if it does not)"_
2. Strategically: a scaffolding task (recommended in M3-002 review as M2-017) should add `.aeos/rubrics/structure/`, `.aeos/rubrics/drift/`, `.aeos/rubrics/dod/`, and `.aeos/rubrics/templates/` to `ProjectInitUseCase`. This would resolve the gap for all rubric/template tasks across M3–M6.

**Note:** M3-002's task was subsequently amended with this exact fix (step 1: "Ensure `.aeos/rubrics/structure/` directory exists"). M4-003 should follow suit.

---

## Minor Issues

### m1: Method header inconsistent with action plan

**Task header:** `Method: Agentic implementation`
**Action plan §M4:** _"Method: Dogfood."_ — All M4 tickets are listed as dogfood tickets run through the pipeline.
**Sibling M3-002 (after amendment):** `Method: Dogfood — run through AEOS pipeline`

This has been flagged in every M4 task review (M4-001 H1, M4-002 m1). All M4 tasks consistently use "Agentic implementation" while the action plan says "Dogfood." The pattern is now entrenched across M4, M5a, M5b, and M6 tasks.

**Impact:** Low — affects execution approach, not content quality. If this is a dogfood ticket, the dependency list needs expansion (see m2).

**Recommendation:** Either align to `Method: Dogfood — run through AEOS pipeline` per action plan, or accept "Agentic implementation" as the de facto convention for rubric/template tasks and document the divergence.

### m2: Dependencies incomplete — missing column spec and implicit transitive dependencies

**Task Dependencies:** _"M4-001: AEOS-5 complete (`architect-agent.yaml` exists)"_

**Missing:**
- **M4-000b:** `tech-spec.yaml` column spec — this task's Definition of Done requires adding the rubric path to `tech-spec.yaml`. The column spec must exist before it can be updated. M4-000b is archived (complete), so this is technically satisfied, but the dependency should be listed for traceability.
- **M3-004 (AEOS-4):** The `tech-spec.yaml` column spec's `reviewerRubrics` will ultimately contain both `rubrics/structure/tech-spec-structure.md` (this task) and `rubrics/drift/intent-drift.md` (AEOS-4). While not a hard dependency (rubrics are added independently), listing it makes the reviewer configuration visible.

If this is a dogfood ticket, it would also need:
- M4-000a: `architecture-spike.yaml` (for pipeline transit through ARCH_SPIKE)
- M2-013: `reviewer-agent.yaml`

Sibling M3-002 was amended to weaken the dependency to just M3-000 (column spec). M4-003's dependency on M4-001 (AEOS-5) is stronger than needed — the rubric defines what a good tech spec looks like regardless of which agent produces it. The rubric depends on knowing the column spec exists (to update `reviewerRubrics`), not on the architect agent spec.

**Recommendation:** Weaken to:
```
- M4-000b: `tech-spec.yaml` column spec exists (provides `reviewerRubrics` array to update)
```

### m3: Rubric criteria list in task omits system design-specified criteria

**Task step 2:** _"component diagram or module list, API contracts (endpoints, schemas), data model changes, error handling strategy, dependency declarations, test strategy outline"_ (6 criteria)

**System design §5.3:** _"ADRs, API contracts, data models"_

The task criteria are a superset of the system design (good), but the system design mentions **ADRs** (Architecture Decision Records) which are not in the task's criteria list. The spike template (AEOS-6) covers decision drivers and recommendations, which partially overlap with ADRs. However, a tech spec rubric that checks for explicit architectural decisions (even if brief) would strengthen the review.

**Impact:** Low — the task already has 6 criteria (exceeding the ≥5 minimum). ADR coverage is arguably handled by the spike review, not the tech spec review.

**Recommendation:** Consider adding a 7th criterion: _"Architectural decisions: key decisions are stated with rationale (even if brief), not just asserted"_ — or explicitly note that ADR coverage is deferred to the spike column.

### m4: Acceptance criteria missing validation step from task step 4

**Task step 4:** _"Validate against a hypothetical vague tech spec to confirm it catches gaps"_
**Acceptance criteria:** No corresponding checkbox.

This exact gap was flagged as F-4 (LOW) in the M3-002 review. M3-002 was subsequently amended to add: _"Validated against a hypothetical bad PRD — at least one criterion triggers WARN or FAIL."_

**Recommendation:** Add AC: `- [ ] Validated against a hypothetical vague tech spec — at least one criterion triggers WARN or FAIL`

---

## Correctness vs System Design

| Aspect | Task | System Design | Verdict |
|--------|------|---------------|---------|
| Artifact name | `tech-spec-structure.md` | §5.3: `tech-spec-structure.md` listed under `rubrics/structure/` | ✅ Exact match |
| Rubric path | `.aeos/rubrics/structure/tech-spec-structure.md` | §5.3: `/rubrics/structure/tech-spec-structure.md` (relative to `.aeos/`) | ✅ Match |
| Rubric description | "ADRs, API contracts, data models" | §5.3 | ⚠️ Task omits ADRs — see m3 |
| Column spec update | Add to `tech-spec.yaml` `reviewerRubrics` | §5.4: `rubrics: { pass1_structure: ... }` | ✅ Task matches implemented schema (flat array), not system design's map format |
| Criterion format | PASS/WARN/FAIL | §5.5/§5.6: reviewer outputs INFO/WARNING/BLOCKER | ✅ Complementary — rubric defines thresholds, reviewer maps to finding severity |
| Minimum criteria | ≥ 5 | Not specified in system design | ✅ Consistent with M3-002 sibling pattern |

**Note on `reviewerRubrics` schema:** The system design §5.4 uses a structured map (`pass1_structure`, `pass2_drift`). The implemented `ColumnSpecSchema` uses a flat `string[]` array. The M2-007 review (m4) flagged this as a medium risk (fragile ordering). The task correctly targets the **implemented** schema. The flat array means rubric ordering in the YAML determines pass1 vs pass2 injection — the tech-spec rubric should be listed before the intent-drift rubric in `tech-spec.yaml` for correct pass ordering.

---

## File Path Alignment with Hexagonal Scaffold

| Referenced Path / Component | Exists in `src/` | Notes |
|----------------------------|-----------------|-------|
| `ColumnSpec.reviewerRubrics` | `src/domain/model/column-spec.ts` line 11 | ✅ `readonly reviewerRubrics: string[]` |
| `ColumnSpecSchema.reviewerRubrics` | `src/infrastructure/spec-loader/schemas.ts` line 14 | ✅ `z.array(z.string()).default([])` |
| `FsRubricLoader` | `src/infrastructure/filesystem/fs-rubric-loader.adapter.ts` | ✅ Reads from `.aeos/{rubricPath}` — returns `null` on ENOENT |
| `RubricLoader` port | `src/domain/ports/driven/rubric-loader.port.ts` | ✅ `load(rubricPath, projectPath): Promise<string \| null>` |
| `TicketRunUseCase` rubric loading | `src/application/ticket-run.use-case.ts` lines 179–184 | ✅ Iterates `columnSpec.reviewerRubrics`, loads each, injects into reviewer context |
| `YamlColumnSpecLoader` TECH_SPEC mapping | `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts` line 17 | ✅ `[Column.TECH_SPEC]: 'tech-spec'` |
| Runtime: `.aeos/rubrics/structure/tech-spec-structure.md` | N/A (runtime content file) | ✅ Path consistent with system design §5.3 |
| Runtime: `.aeos/column-specs/tech-spec.yaml` | N/A (runtime config) | ✅ Loader resolves `TECH_SPEC` → `tech-spec.yaml` |

No source code changes required — task produces a content file and updates a YAML config. No phantom paths in `src/`.

**Runtime rubric loading path verified:**
1. `tech-spec.yaml` has `reviewerRubrics: ['rubrics/structure/tech-spec-structure.md']`
2. `TicketRunUseCase` calls `this.rubricLoader.load('rubrics/structure/tech-spec-structure.md', projectPath)`
3. `FsRubricLoader` resolves to `{projectPath}/.aeos/rubrics/structure/tech-spec-structure.md`
4. Content is injected into `enrichedContext.priorArtifacts` as `reviewer-rubrics.md`

This chain is fully implemented and tested (see `ticket-run.use-case.test.ts` lines 405–419). The rubric path `rubrics/structure/tech-spec-structure.md` will resolve correctly through `FsRubricLoader`.

---

## Dependency Validation

| Dependency | Status | Verified |
|-----------|--------|----------|
| M4-001 (AEOS-5): `architect-agent.yaml` | ⬜ Not yet complete | Task file in `docs/tasks/` (not archived). Depends on M3 completion. |
| M4-000b (implicit): `tech-spec.yaml` column spec | ✅ Complete | Archived; review at `REVIEW-20260408-M4-000b`. Column spec has `reviewerRubrics: []` ready for update. |
| M3-004 (AEOS-4, implicit): `intent-drift.md` | ⬜ Not yet complete | Task file in `docs/tasks/`. Both rubrics will be added to `tech-spec.yaml reviewerRubrics`. |

**Transitive dependency chain:**
- M4-003 (this task) → M4-001 (listed) → M3 complete → M4-000a + M4-000b (both complete)
- If dogfood: M4-003 would also transit through pipeline columns, requiring all prior column specs and agents

**Missing explicit dependencies:**
- M4-000b should be listed (task updates `tech-spec.yaml` which M4-000b creates)
- The dependency on M4-001 is arguably too strong (see m2 above)

---

## Consistency with Sibling Tasks

| Sibling | Pattern Match | Notes |
|---------|--------------|-------|
| M3-002 (prd-structure rubric) | ⚠️ Partial | M3-002 was amended with: mkdir step, weakened dependency, validation AC. M4-003 has none of these. |
| M3-004 (intent-drift rubric) | ✅ Structure match | Same format, same PASS/WARN/FAIL convention. M3-004 targets all column specs; M4-003 targets one. |
| M5a-003 (impl-structure rubric) | ✅ Identical structure | Same template: criteria list, ≥5 minimum, PASS/WARN/FAIL, column spec update. Same m1-m4 issues apply. |
| M5b-001 (code-structure rubric) | ✅ Identical structure | Same pattern. |
| M6-004 (qa-structure rubric) | ✅ Identical structure | Same pattern. |
| M4-004 (tech-spec template) | ✅ Downstream match | M4-004 step 3: "Verify the template aligns with all criteria in `tech-spec-structure.md` (AEOS-7)" — correct dependency. |

**Key gap vs M3-002:** The M3-002 task was amended post-review to fix findings F-1 (mkdir step), F-2 (weakened dependency), and F-4 (validation AC). These same fixes were **not propagated** to M4-003 or any subsequent rubric tasks (M5a-003, M5b-001, M6-004, M6-005). This is a systemic pattern — each review flags the same issues.

**Downstream impact:** M4-004 (tech-spec template) explicitly validates against this rubric's criteria. If M4-003 produces criteria covering "component diagram, API contracts, data model, error handling, dependencies, test strategy," then M4-004's template sections must include all of these. The current M4-004 template sections (Overview, Component Architecture, API Contracts, Data Model, Error Handling, Dependencies, Test Strategy, Migration Plan) appear to be a superset — ✅ no conflict.

---

## Blocking Gaps

**No hard blockers.** The task can be executed as written with one manual workaround:

1. **M1 (MEDIUM):** The implementer must create `.aeos/rubrics/structure/` before writing the rubric file. This is a known workaround documented in prior reviews. Not blocking if the implementer knows to do it, but fragile for automated execution.

**Soft blockers (won't prevent task completion but affect quality):**

2. The `tech-spec.yaml` `reviewerRubrics` should also include `rubrics/drift/intent-drift.md` (from AEOS-4). Neither this task nor AEOS-4's task specifies which task adds the drift rubric to `tech-spec.yaml`. M4-000b's notes say the full array should be:
   ```yaml
   reviewerRubrics:
     - rubrics/structure/tech-spec-structure.md
     - rubrics/drift/intent-drift.md
   ```
   M3-004 (intent-drift) says "Add to ALL column specs," which would include `tech-spec.yaml`. The ordering matters: structure rubric first (pass 1), drift rubric second (pass 2). Both tasks should be aware of the other's entry. Currently neither explicitly coordinates.

---

## Recommendations Summary

| # | Severity | Finding | Action |
|---|----------|---------|--------|
| M1 | Medium | `.aeos/rubrics/structure/` not scaffolded | Add mkdir step; recommend systemic scaffolding task |
| m1 | Minor | Method "Agentic implementation" ≠ action plan "Dogfood" | Align or document divergence |
| m2 | Minor | Dependencies incomplete / too strong | Weaken to M4-000b; remove M4-001 hard dep |
| m3 | Minor | Criteria omit ADRs from system design §5.3 | Consider adding ADR criterion or document exclusion |
| m4 | Minor | AC missing validation step from task step 4 | Add validation checkbox |

---

## Proposed Amendments

### 1. Add mkdir step (M1)

Add as step 0 or amend step 1:
```markdown
1. Ensure `.aeos/rubrics/structure/` directory exists (create it if it does not)
2. Create `.aeos/rubrics/structure/tech-spec-structure.md` — a rubric the reviewer uses to evaluate tech specs
```

### 2. Weaken and expand dependencies (m2)

```markdown
## Dependencies
- M4-000b: `tech-spec.yaml` column spec exists (provides `reviewerRubrics` array to update)
```

### 3. Add validation AC (m4)

```markdown
- [ ] Validated against a hypothetical vague tech spec — at least one criterion triggers WARN or FAIL
```

### 4. Add Out of Scope clarification (m3)

```markdown
## Out of Scope
- Tech spec template (AEOS-8) — separate task
- ADR coverage — handled by ARCH_SPIKE column (spike template decisions); tech spec rubric covers implementation-level concerns
```

---

## Summary

| Category | Count |
|----------|-------|
| Critical | 0 |
| Major | 0 |
| Medium | 1 |
| Minor | 4 |

**Overall:** The task is well-scoped and correctly aligned with both the system design and the implemented codebase. The rubric path `.aeos/rubrics/structure/tech-spec-structure.md` exactly matches the system design §5.3 layout. The `reviewerRubrics` field on `ColumnSpecSchema` is a flat `string[]` array that will accept the rubric path. The `FsRubricLoader` → `TicketRunUseCase` chain for loading and injecting rubric content is fully implemented and tested — no code changes needed.

The single medium finding (M1 — directory scaffolding) is a systemic gap affecting all rubric tasks. It has been flagged in every prior rubric review (M3-002, M3-004) and amended in M3-002 but not propagated forward. The four minor findings mirror patterns seen across all M4+ tasks: method header divergence, dependency precision, missing validation AC, and system design criteria coverage. None prevent execution.

The task correctly coordinates with M4-004 (tech-spec template), which validates its sections against this rubric's criteria. The downstream dependency chain is sound: M4-003 → M4-004 → architect agent produces tech specs reviewed by this rubric.