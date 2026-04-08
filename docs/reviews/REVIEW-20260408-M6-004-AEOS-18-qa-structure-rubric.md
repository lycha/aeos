# Review: M6-004 — AEOS-18 QA Structure Rubric (`qa-report-structure.md`)

**Reviewed:** 2026-04-08
**Task file:** `docs/tasks/M6-004-AEOS-18-qa-structure-rubric.md`
**Reviewer:** Augment Agent (automated deep review)
**Cross-referenced against:**
- `docs/03-system-design.md` (System Design v0.3)
- `docs/02-prd.md` (PRD v0.1)
- `docs/05-action-plan-v1.md` (Action Plan)
- Sibling rubric tasks: M3-002 (prd-structure, amended), M3-004 (intent-drift), M4-003 (tech-spec-structure), M5a-003 (impl-structure, amended), M5b-001 (code-structure, amended)
- Same-milestone tasks: M6-002 (AEOS-16 qa-agent-spec), M6-003 (AEOS-17 qa-report-template, amended), M6-005 (AEOS-19 dod-evaluation-rubric)
- Column spec: M6-000 (qa column spec, archived)
- Prior reviews: REVIEW-20260408-M6-000, REVIEW-20260408-M6-001, REVIEW-20260408-M6-002, REVIEW-20260408-M6-003, REVIEW-20260408-M5b-001, REVIEW-20260408-M5a-003, REVIEW-20260408-M3-002
- Source code: `src/infrastructure/spec-loader/schemas.ts`, `src/infrastructure/filesystem/fs-rubric-loader.adapter.ts`, `src/application/ticket-run.use-case.ts`, `src/domain/model/column-spec.ts`, `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts`

---

## 1. Verdict: ⚠️ APPROVE WITH REQUIRED CHANGES

Two medium issues, four minor issues. No critical or major blockers. The task is structurally consistent with sibling rubric tasks and correctly scoped per both the system design §5.3 rubric library and the action plan §M6. All findings are addressable with task amendments — no source code changes required.

---

## 2. Correctness vs System Design

| Aspect | Task | System Design | Verdict |
|--------|------|---------------|---------|
| Artifact name | `qa-report-structure.md` | §5.3: `qa-report-structure.md` in `rubrics/structure/` | ✅ Exact match |
| Rubric path | `.aeos/rubrics/structure/qa-report-structure.md` | §5.3: `structure/qa-report-structure.md` | ✅ Correct directory |
| Rubric purpose | Reviewer pass-1 for QA column | §5.5: Pass 1 = structure vs rubric | ✅ Correct pass |
| Column | QA | §2.1: "QA" in DEPLOY phase | ✅ Match |
| Column spec update | Add to `qa.yaml` `reviewerRubrics` | §5.4: `rubrics: { pass1_structure: ... }` | ✅ Matches implemented schema (flat `string[]`), not system design's map |
| Criterion format | PASS/WARN/FAIL | §5.5/§5.6: reviewer outputs INFO/WARNING/BLOCKER | ✅ Complementary — rubric defines thresholds, reviewer maps to severity |
| Minimum criteria | ≥ 5 | Not specified in system design | ✅ Consistent with sibling pattern |
| Rubric description | §5.3: "test cases, edge cases, pass rate" | Task: "implementation notes addressed, edge cases specific, risk rating justified, recommendation consistency, no unfilled placeholders" | ✅ Superset — task covers more than system design's sketch |
| Recommendation consistency | READY + critical gaps → FAIL | §2.2: QA produces report, DOD_GATE evaluates holistically | ✅ Correct — rubric catches internal contradictions before DoD Gate |
| Agent producing output | `qa-agent` (worker) | §5.2: `qa-agent` — worker — DEPLOY | ✅ Match |

**No system design conflicts found.** The rubric is correctly positioned as a pass-1 structural reviewer check for the QA column. The recommendation consistency criterion (hypothetical contradictory report must FAIL) is a valuable addition not present in sibling rubric tasks — it catches a critical quality gap specific to the QA column where the recommendation is a binary gate input to DOD_GATE.

---

## 3. Findings

### ⚠️ MEDIUM (M1): Missing prerequisite — `.aeos/rubrics/structure/` directory not scaffolded

**Problem:**
The task writes to `.aeos/rubrics/structure/qa-report-structure.md`, but no existing task or `ProjectInitUseCase` creates the `rubrics/` or `rubrics/structure/` directories. `ProjectInitUseCase` scaffolds `.aeos/agents/` and `.aeos/column-specs/` (via M2-014 and M2-015) but does **not** scaffold `.aeos/rubrics/` or its subdirectories.

This is a recurring gap flagged in every prior rubric task review:
- F-1 (MEDIUM) in M3-002 review → **amended with mkdir step**
- M1 (MEDIUM) in M4-003 review
- M1 (MEDIUM) in M5a-003 review → **amended with mkdir step**
- M1 (MEDIUM) in M5b-001 review → **amended with mkdir step**
- Recurring in M3-004, M6-005

The `FsRubricLoader` (`src/infrastructure/filesystem/fs-rubric-loader.adapter.ts`) reads from `.aeos/{rubricPath}` and returns `null` on ENOENT — it does not create directories.

**Impact:** The implementer must manually `mkdir -p .aeos/rubrics/structure/` before writing the rubric file. Fragile for automated (agentic) execution.

**Recommendation:** Add step 0 per the amended M3-002 pattern: _"Ensure `.aeos/rubrics/structure/` directory exists (create it if it does not)"_

### ⚠️ MEDIUM (M2): Missing rubric ordering note for `reviewerRubrics` in `qa.yaml`

**Problem:**
The task says to add the rubric path to `qa.yaml` under `reviewerRubrics` but does NOT specify ordering. The `ColumnSpecSchema` uses a flat `string[]` array (`z.array(z.string()).default([])`), meaning array ordering determines pass assignment. The structure rubric should be the FIRST entry (pass-1), and `intent-drift.md` (pass-2, from M3-004/AEOS-4) should come second.

M6-000 (archived) Notes document the expected final state:
```yaml
reviewerRubrics:
  - rubrics/structure/qa-report-structure.md
  - rubrics/drift/intent-drift.md
```

If AEOS-4 (intent-drift) runs first and adds its path, AEOS-18 must insert at position 0, not append — otherwise the reviewer runs drift detection as pass-1 and structure as pass-2, inverting the intended review sequence.

This same gap was flagged and fixed via amendments in:
- M5a-003 review (X2) → amended step 5 with ordering note
- M5b-001 review (M2) → amended step 6 with ordering note

**Recommendation:** Add ordering note to step 5: _"Add rubric path as the FIRST entry in `reviewerRubrics` (before `rubrics/drift/intent-drift.md` if already present) to ensure correct pass-1 ordering."_

---

## 4. Minor Issues

### m1: Method header inconsistent with action plan

**Task header:** `Method: Agentic implementation`
**Action plan §M6:** _"Method: Dogfood."_ — All M6 tickets are listed as dogfood tickets.

Pattern check across sibling rubric tasks:
- M3-002 (prd-structure, amended): `Dogfood — run through AEOS pipeline` ✅
- M4-003 (tech-spec-structure): `Agentic implementation` ❌
- M5a-003 (impl-structure, amended): `Dogfood — run through AEOS pipeline` ✅
- M5b-001 (code-structure, amended): `Dogfood — run through AEOS pipeline` ✅
- **M6-004 (qa-structure): `Agentic implementation`** ❌

This was amended in M3-002, M5a-003, and M5b-001 post-review but not propagated to M6-004.

**Recommendation:** Change to `Method: Dogfood — run through AEOS pipeline` per action plan.

### m2: Dependencies wrong — lists AEOS-17 instead of column spec

**Listed:** _"M6-003: AEOS-17 complete (`qa-report-template.md` exists)"_

**Problems:**
1. **Wrong dependency.** The rubric's actual dependency is the column spec file (`qa.yaml`) that defines `reviewerRubrics`. The column spec is M6-000 (archived, complete), not M6-003.
2. **AEOS-17 is not a prerequisite for AEOS-18.** The rubric defines criteria for evaluating QA reports. The template (AEOS-17) defines the QA report's output format. They are designed in parallel — neither requires the other to exist first. In fact, the action plan lists AEOS-18 after AEOS-17, but the rubric criteria are independent of the template structure. M6-003 step 4 actually says: _"Verify the template aligns with `qa-report-structure.md` criteria (AEOS-18, if written)"_ — acknowledging that AEOS-18 may exist first.
3. **Every amended sibling rubric task lists its column spec as the dependency:**
   - M3-002: `M3-000: product-scoping.yaml`
   - M5a-003 (amended): `M5a-000: implementation.yaml`
   - M5b-001 (amended): `M5b-000: code-review.yaml`

**Recommendation:** Replace with:
```markdown
## Dependencies
- M6-000: `qa.yaml` column spec exists (provides `reviewerRubrics` array to update)
```

### m3: Acceptance criteria missing validation hypothesis from task step 4

**Task step 4:** _"Validate against a hypothetical contradictory report (READY + critical gaps) — recommendation consistency criterion must FAIL"_
**Acceptance criteria:** Includes a corresponding checkbox. ✅

However, the validation hypothesis from step 4 is specific to ONE criterion (recommendation consistency). Step 3 defines PASS/WARN/FAIL for all criteria, but there is no AC that validates any other criterion catches issues. Compare with amended siblings:
- M3-002: `- [ ] Validated against a hypothetical bad PRD — at least one criterion triggers WARN or FAIL`
- M5a-003 (amended): `- [ ] Validated against a hypothetical incomplete implementation plan — at least one criterion triggers WARN or FAIL`
- M5b-001 (amended): `- [ ] Validated against a hypothetical sloppy code review — at least one criterion triggers WARN or FAIL`

The M6-004 task already has a stronger, more specific validation (contradictory report → FAIL on recommendation consistency), but a general validation AC for the other criteria would be consistent with siblings.

**Impact:** Low — the existing validation is adequate for the critical path. The recommendation consistency criterion is the unique and most important addition of this rubric.

### m4: Agent field says "prompt-engineering" — not a recognized agent spec

**Task header:** `Agent: prompt-engineering`

This is not a recognized agent in the system design §5.2 roster. "prompt-engineering" is used as a task classification label, not an agent reference. Same pattern as M4-003, M5a-003, M5b-001. Cosmetic — no action required.

---

## 5. File Path Alignment with Hexagonal Scaffold

| Referenced Path / Component | Exists in `src/` | Notes |
|----------------------------|-----------------|-------|
| `ColumnSpec.reviewerRubrics` | `src/domain/model/column-spec.ts` line 11 | ✅ `readonly reviewerRubrics: string[]` |
| `ColumnSpecSchema.reviewerRubrics` | `src/infrastructure/spec-loader/schemas.ts` line 14 | ✅ `z.array(z.string()).default([])` |
| `FsRubricLoader` | `src/infrastructure/filesystem/fs-rubric-loader.adapter.ts` | ✅ Reads from `.aeos/{rubricPath}` — returns `null` on ENOENT |
| `RubricLoader` port | `src/domain/ports/driven/rubric-loader.port.ts` | ✅ `load(rubricPath, projectPath): Promise<string \| null>` |

---

## 6. Dependency Validation

| Dependency | Status | Verified |
|-----------|--------|----------|
| Listed: M6-003 (AEOS-17, `qa-report-template.md`) | ⬜ Not yet complete | Task file in `docs/tasks/` (not archived). Amended after review. |
| Actual: M6-000 (`qa.yaml` column spec) | ✅ Complete | Archived; `.aeos/column-specs/qa.yaml` exists on disk. `reviewerRubrics: []` ready. |
| Implicit: M3-004 (AEOS-4, `intent-drift.md`) | ⬜ Not yet complete | Both rubrics will coexist in `qa.yaml reviewerRubrics`. |

**Transitive dependency chain:**
- M6-004 (this task) → M6-000 (column spec, ✅ complete) → M2 (schema, loader, ✅ complete)
- If dogfood: M6-004 would transit through pipeline columns, requiring M5b complete

**Key dependency note:** The listed dependency (M6-003) is incorrect. The rubric's actual dependency is M6-000 (`qa.yaml`) — the rubric needs the column spec to update `reviewerRubrics`. The rubric criteria are independent of the template structure: the rubric defines what makes a GOOD QA report, the template defines the report FORMAT. They can be authored in either order.

---

## 7. Consistency with Sibling Rubric Tasks

| Aspect | M3-002 (prd, amended) | M4-003 (tech-spec) | M5a-003 (impl, amended) | M5b-001 (code, amended) | **M6-004 (qa)** |
|--------|----------------------|--------------------|-----------------------|------------------------|-----------------|
| Method | Dogfood ✅ | ❌ Agentic | Dogfood ✅ | Dogfood ✅ | ❌ Agentic |
| mkdir step | ✅ | ❌ | ✅ (amended) | ✅ (amended) | ❌ |
| Validation AC | ✅ | ❌ | ✅ (amended) | ✅ (amended) | ⚠️ Partial (specific only) |
| Criteria count | 5 | 6 | 5 | 6 | 5 |
| Dep = column spec | ✅ (M3-000) | ❌ (M4-001) | ✅ (amended, M5a-000) | ✅ (amended, M5b-000) | ❌ (M6-003) |
| Ordering note | N/A (first rubric) | ❌ | ✅ (amended) | ✅ (amended) | ❌ |
| PASS/WARN/FAIL format | ✅ | ✅ | ✅ | ✅ | ✅ |
| ≥5 criteria AC | ✅ | ✅ | ✅ | ✅ | ✅ |

**Key gap vs amended siblings:** M3-002, M5a-003, and M5b-001 were amended post-review to fix mkdir step, dependency precision, validation AC, and rubric ordering notes. These same fixes were **not propagated** to M6-004. The task is missing three amendments that all three most-recent siblings received.

---

## 8. Cross-Task Coordination Issues

### X1: M6-003 (amended) template sections vs M6-004 rubric criteria

M6-003 template sections (amended): Executive Summary, Requirements Coverage Matrix, Edge Cases & Risk Assessment (with severity ratings), Test Results Summary, Findings (risk-rated), Recommendation (READY FOR DOD / NOT READY with justification).

M6-004 rubric criteria: all implementation notes sections addressed, edge cases specific, risk rating justified with evidence, recommendation consistent with findings, no unfilled template placeholders.

Mapping:
- "all implementation notes sections are addressed in the report" → ✅ Requirements Coverage Matrix
- "edge cases are specific (named, not generic)" → ✅ Edge Cases & Risk Assessment
- "risk rating is justified with evidence" → ✅ Findings (risk-rated)
- "recommendation is consistent with findings" → ✅ Recommendation (READY/NOT READY with justification)
- "no unfilled template placeholders" → ✅ Structural check across all sections

All M6-004 criteria map to M6-003 template sections. ✅ No gap.

### X2: M6-005 (AEOS-19) depends on M6-004

M6-005 lists dependency: _"M6-004: AEOS-18 complete"_. M6-005 rubric criterion includes _"QA recommendation is READY FOR DOD"_ — which relies on the recommendation consistency check defined in M6-004. The dependency chain is correct. ✅

### X3: M6-000 `requiredSections: []` — downstream update needed

The QA column spec has `requiredSections: []` (empty). Once the rubric is finalized and the template sections are known, the column spec should be updated with required section names so that `OutputValidator` can verify them during rule-based output validation (before the LLM reviewer runs). This is not blocked by M6-004 but is a downstream coordination task.

### X4: Rubric ordering in `qa.yaml`

When both AEOS-18 (this task) and AEOS-4 (intent-drift) are complete, `qa.yaml` `reviewerRubrics` should be:
```yaml
reviewerRubrics:
  - rubrics/structure/qa-report-structure.md    # pass 1 — structure
  - rubrics/drift/intent-drift.md               # pass 2 — drift
```

M6-000 Notes correctly show this ordering. M3-004 (AEOS-4) says "Add to ALL column specs" but does not specify ordering. M6-004 does not specify ordering either. Whichever runs second must maintain correct ordering. Addressed by M2 recommendation.

---

## 9. Gaps That Would Block Implementation

### 9.1 Blocking gaps

**No hard blockers.** The task can be executed as written with one manual workaround:

1. **M1 (MEDIUM):** The implementer must create `.aeos/rubrics/structure/` before writing the rubric file. Known workaround from prior reviews. Not blocking if the implementer knows to do it, but fragile for automated execution.

### 9.2 Non-blocking but important

2. **M2 (MEDIUM):** Without an ordering note, the implementer may append the rubric path after `intent-drift.md` (if AEOS-4 runs first), causing the reviewer to run drift detection as pass-1 and structure as pass-2 — inverting the intended review sequence.
3. **m2 (MINOR):** Wrong dependency listed (M6-003 instead of M6-000). Does not block execution but creates false ordering constraint.

---

## 10. Recommendations Summary

| # | Severity | Finding | Action |
|---|----------|---------|--------|
| M1 | Medium | `.aeos/rubrics/structure/` not scaffolded | Add mkdir step per amended M3-002 pattern |
| M2 | Medium | Missing rubric ordering note for `reviewerRubrics` | Add ordering instruction to step 5 |
| m1 | Minor | Method "Agentic implementation" ≠ action plan "Dogfood" | Align to `Dogfood — run through AEOS pipeline` |
| m2 | Minor | Dependencies: M6-003 is wrong — should be M6-000 column spec | Replace with `M6-000: qa.yaml` |
| m3 | Minor | Validation AC is specific to recommendation consistency; no general validation AC | Add general validation AC per sibling pattern |
| m4 | Minor | Agent "prompt-engineering" is not a recognized agent spec | Cosmetic — no action required |
| X1 | Cross-task | M6-003 template sections vs M6-004 rubric criteria | ✅ No gap — all criteria map to template sections |
| X2 | Cross-task | M6-005 depends on M6-004 | ✅ Dependency chain correct |
| X3 | Cross-task | M6-000 `requiredSections` needs downstream update | Informational |
| X4 | Cross-task | Rubric ordering in `qa.yaml` | Addressed by M2 recommendation |

---

## 11. Proposed Amendments

### 1. Add mkdir step (M1)

Amend step 1, renumber subsequent steps:
```markdown
1. Ensure `.aeos/rubrics/structure/` directory exists (create it if it does not)
2. Create `.aeos/rubrics/structure/qa-report-structure.md` — a rubric for evaluating QA reports
```

### 2. Add rubric ordering note (M2)

Amend step 5 (renumbered to step 6):
```markdown
6. Add rubric path to `qa.yaml` column spec under `reviewerRubrics` as the FIRST entry
   (before `rubrics/drift/intent-drift.md` if already present) to ensure correct pass-1 ordering
```

### 3. Fix dependencies (m2)

```markdown
## Dependencies
- M6-000: `qa.yaml` column spec exists (provides `reviewerRubrics` array to update)
```

### 4. Update Method header (m1)

```markdown
**Method:** Dogfood — run through AEOS pipeline
```

### 5. Add general validation AC (m3)

Add to Acceptance Criteria:
```markdown
- [ ] Validated against a hypothetical bad QA report (e.g. missing edge cases, generic risk description) — at least one non-recommendation criterion triggers WARN or FAIL
```

---

## 12. Summary

| Category | Count |
|----------|-------|
| Critical | 0 |
| Major | 0 |
| Medium | 2 |
| Minor | 4 |
| Cross-task | 4 (0 conflicts, 2 confirmed-OK, 1 informational, 1 coordination) |

**Overall:** The task is well-scoped and correctly aligned with both the system design (§5.3 explicitly names `qa-report-structure.md` under `rubrics/structure/`) and the action plan (§M6, AEOS-18). The rubric path `.aeos/rubrics/structure/qa-report-structure.md` follows the system design directory convention exactly. The `reviewerRubrics` field on `ColumnSpecSchema` is a flat `string[]` array that will accept the path, and the `FsRubricLoader` → `TicketRunUseCase` chain for loading and injecting rubric content is fully implemented and tested — no code changes needed.

The rubric criteria (implementation notes coverage, edge case specificity, risk rating justification, recommendation consistency, no unfilled placeholders) are well-chosen for the QA column. The recommendation consistency criterion — requiring a contradictory report (READY + critical gaps) to FAIL — is a unique and valuable addition not present in sibling rubric tasks. It catches a critical quality gap where the QA report's recommendation feeds directly into the DOD_GATE as a binary input.

The two medium findings are: (1) the recurring `.aeos/rubrics/structure/` directory scaffolding gap (flagged and fixed in M3-002, M5a-003, and M5b-001 but not propagated to M6-004), and (2) a missing rubric ordering note that could cause pass-1/pass-2 inversion if AEOS-4 runs first. Both are addressable with simple task amendments following patterns already established in prior reviews.

The dependency listing (M6-003) is incorrect — the task depends on M6-000 (`qa.yaml` column spec), not M6-003 (`qa-report-template.md`). The rubric criteria are independent of the template structure: AEOS-18 defines what a good QA report looks like, AEOS-17 defines the report format. They can be authored in either order. All rubric criteria map cleanly to the M6-003 template sections (verified in X1). No source code changes are required.
