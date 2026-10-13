# Review: M6-003 — AEOS-17 QA Report Template (`qa-report-template.md`)

**Reviewed:** 2026-04-08
**Task file:** `docs/tasks/M6-003-AEOS-17-qa-report-template.md`
**Reviewer:** Augment Agent (automated deep review)
**Cross-referenced against:**
- `docs/03-system-design.md` (System Design v0.3)
- `docs/02-prd.md` (PRD v0.1)
- `docs/05-action-plan-v1.md` (Action Plan)
- Sibling template tasks: M3-003 (prd-template, amended), M4-002 (spike-template, amended), M4-004 (tech-spec-template, amended), M5a-002 (impl-notes-template, amended)
- Same-milestone tasks: M6-002 (AEOS-16 qa-agent-spec), M6-004 (AEOS-18 qa-structure-rubric)
- Prerequisite tasks: M6-000 (qa column spec, archived), M6-001 (AEOS-15 deploy design)
- Prior reviews: REVIEW-20260408-M6-002, REVIEW-20260408-M6-000, REVIEW-20260408-M6-001, REVIEW-20260408-M5a-002, REVIEW-20260408-M3-003, REVIEW-20260408-M4-002
- Source code: `src/infrastructure/spec-loader/schemas.ts`, `src/application/services/prompt-builder.ts`, `src/domain/model/agent-spec.ts`, `src/infrastructure/spec-loader/yaml-agent-spec-loader.adapter.ts`

---

## 1. Verdict: ⚠️ APPROVE WITH REQUIRED CHANGES

Two critical issues, one major issue, and multiple medium/minor findings. The critical issues are identical to those found and fixed in all prior template task reviews (M3-003, M4-002, M4-004, M5a-002) but **not propagated** to this task. All findings are addressable with task amendments — no source code changes required. The QA agent serves a single column (QA), so the dual-column `outputFormat` concatenation issue that affected M4-002, M4-004, and M5a-002 does **not** apply here — the entire `outputFormat` field can be replaced.

---

## 2. Correctness vs System Design

| Aspect | Task | System Design | Verdict |
|--------|------|---------------|---------|
| Template filename | `qa-report-template.md` | §5.3: `qa-report-template.md` | ✅ Match |
| Template path | `.aeos/templates/qa-report-template.md` | §5.3: `.aeos/rubrics/templates/qa-report-template.md` | ⚠️ Wrong directory — see C2 |
| Template purpose | Output format for QA column | §4.4: `[OUTPUT FORMAT] {artifact template}` | ✅ Correct purpose |
| Agent YAML update | `qa-agent.yaml` `outputFormat` | §5.1: `output_template` (file path) | ⚠️ System design implies file path; implementation is inline text — see C1 |
| Output artifact | `qa-report.md` (implicit via column spec) | §2.2: `SAAS-1-qa-report.md` (worker output) | ✅ Match (ticket prefix at runtime) |
| Agent | `qa-agent` | §5.2: `qa-agent` — worker — DEPLOY | ✅ Match |
| Template sections | 6 sections | No enumeration in system design for QA report | ✅ Reasonable interpretation |
| Recommendation format | READY FOR DOD / NOT READY | §2.2: QA produces report, DOD_GATE evaluates | ✅ Appropriate |

---

## 3. Findings

### 🔴 CRITICAL (C1): `outputFormat` is inline text — task says "reference" a template file

**Task step 4:** _"Update `qa-agent.yaml` `outputFormat` to reference `qa-report-template.md`"_

**Implemented `PromptBuilder`** (`src/application/services/prompt-builder.ts` line 27):
```typescript
sections.push(`[OUTPUT FORMAT]\n${agentSpec.outputFormat}`);
```

The `outputFormat` field is injected as **literal inline text**, not resolved as a file path. There is no template file loading mechanism in the codebase. Setting `outputFormat` to `"qa-report-template.md"` will inject the literal string into the prompt — not the file contents.

This exact gap was flagged and fixed in:
- 🔴 HIGH (F-1) in M3-003 review → M3-003 amended
- 🔴 C1 in M4-002 review → M4-002 amended
- 🔴 C1 in M4-004 review → M4-004 amended
- 🔴 C1 in M5a-002 review → M5a-002 amended

**M6-003 has no such amendment.** The word "reference" actively misleads toward file path resolution.

**Impact:** The implementer will either (a) set `outputFormat` to a file path string (broken prompt), or (b) not know to inline the content. The [OUTPUT FORMAT] prompt section will read the literal path string, producing useless output.

**Recommendation:** Add an implementation note and update step 4 to specify inlining the full template content as a multi-line YAML string. See Proposed Amendments §1 and §2.

### 🔴 CRITICAL (C2): Template file path diverges from system design

**Task step 1:** `.aeos/templates/qa-report-template.md`
**System design §5.3 (Rubric Library):**
```
/rubrics/
  templates/
    qa-report-template.md
```

The system design places templates under `rubrics/templates/`, making the canonical path `.aeos/rubrics/templates/qa-report-template.md`. The task uses `.aeos/templates/` — a top-level directory under `.aeos/` not present in the system design layout (§3.3).

**All four amended sibling template tasks** have been corrected to `.aeos/rubrics/templates/`:
- M3-003 (prd-template): `.aeos/rubrics/templates/prd-template.md` ✅
- M4-002 (spike-template): `.aeos/rubrics/templates/spike-template.md` ✅
- M4-004 (tech-spec-template): `.aeos/rubrics/templates/tech-spec-template.md` ✅
- M5a-002 (impl-notes-template): `.aeos/rubrics/templates/impl-notes-template.md` ✅

**M6-003 is the last remaining unamended template task.** Using `.aeos/templates/` creates path inconsistency with all amended siblings and the system design.

**Impact:** Any future code that reads templates from `rubrics/templates/` (per system design) will not find this file. Inconsistent with all amended siblings.

**Recommendation:** Change to `.aeos/rubrics/templates/qa-report-template.md` throughout the task. See Proposed Amendments §3.

### ⚠️ MAJOR (H1): Method header inconsistent with action plan

**Task header:** `Method: Agentic implementation`
**Action plan §M6:** _"Method: Dogfood."_ — All M6 tickets are listed as dogfood tickets to run through the pipeline.

Pattern check across amended sibling template tasks:
- M3-003 (prd-template, amended): `Dogfood — run through AEOS pipeline` ✅
- M4-002 (spike-template, amended): `Dogfood — run through AEOS pipeline` ✅
- M4-004 (tech-spec-template, amended): `Dogfood — run through AEOS pipeline` ✅
- M5a-002 (impl-notes-template, amended): `Dogfood — run through AEOS pipeline` ✅
- **M6-003 (qa-report-template): `Agentic implementation`** ❌

**Recommendation:** Change to `Method: Dogfood — run through AEOS pipeline`.

### ⚠️ MEDIUM (M1): Dependencies incomplete

**Listed:** _"M6-002: AEOS-16 complete (`qa-agent.yaml` exists)"_

**Missing dependencies:**
1. **M6-000: `qa.yaml` column spec** — provides context for how the template is consumed in the QA column. All amended sibling template tasks list their column spec as a dependency.
2. **Template directory scaffolding** — `.aeos/rubrics/templates/` is not scaffolded by `project init`. Same gap as M3-003 (F-5), M4-002, M4-004, M5a-002 reviews. No task creates this directory.
3. **Prerequisite (not yet scheduled): template file resolution mechanism** — until built, template content must be inlined in agent YAML. Same prerequisite noted in all four amended sibling tasks.

**Recommendation:** Expand dependencies. See Proposed Amendments §4.

### ⚠️ MEDIUM (M2): Missing rubric alignment acceptance criterion

**Task step 3:** _"Verify the template aligns with `qa-report-structure.md` criteria (AEOS-18, if written — otherwise design for expected criteria)"_

There is no corresponding acceptance criterion. All amended sibling template tasks include a rubric alignment AC:
- M3-003: _"Comparing with `prd-structure.md` criteria, every rubric criterion has a corresponding template section"_
- M4-004: _"Every criterion in `tech-spec-structure.md` (AEOS-7) has a corresponding template section"_
- M5a-002: _"If `impl-structure.md` (AEOS-11) exists, every rubric criterion has a corresponding template section"_

Since AEOS-18 (M6-004) depends on AEOS-17, it will not exist yet when AEOS-17 executes. Use the conditional pattern from M5a-002.

**Recommendation:** Add AC: _"If `qa-report-structure.md` (AEOS-18) exists, every rubric criterion has a corresponding template section"_


### ⚠️ MEDIUM (M3): `outputFormat` update pattern not explicit about replacement scope

The M6-002 review (C1) flagged that `outputFormat` was entirely absent from the AEOS-16 task. The amended M6-002 now includes `outputFormat` guidance (item 7):
> _"`outputFormat`: multi-line YAML string with inline placeholder template describing expected QA report sections. `PromptBuilder` treats `outputFormat` as inline text, not a file path. M6-003 (AEOS-17) will update this field with the full template content."_

Since the QA agent serves **one column only** (unlike `architect-agent` or `engineer-agent`), M6-003 can replace the entire `outputFormat` field without worrying about overwriting other column sections. This simplification should be explicitly stated to prevent confusion with the more complex update-not-replace pattern documented in M4-002, M4-004, and M5a-002.

**Recommendation:** Add note: _"The QA agent serves a single column (QA). The entire `outputFormat` field can be replaced — no concatenation with other column output formats needed."_

---

## 4. Minor Issues

### m1: No implementation note about `outputFormat` resolution gap

All amended sibling template tasks include a prominent implementation note:

```markdown
> **⚠️ Implementation note — `outputFormat` resolution gap:**
> The current `PromptBuilder` treats the `outputFormat` field as inline text, not a file path.
```

M6-003 has no such note. See Proposed Amendments §1.

### m2: Definition of Done is weaker than Acceptance Criteria

**DoD:**
- `qa-report-template.md` committed with all required sections
- `qa-agent.yaml` updated

The DoD does not mention:
- Inlining (not referencing) the template in `outputFormat`
- Pipeline completion (if dogfood)
- Reviewer sign-off

All amended sibling template tasks have expanded DoD. See Proposed Amendments §6.

### m3: Acceptance Criteria missing `outputFormat` inlining check

**Current AC:** _"`qa-agent.yaml` updated to reference template"_

The word "reference" is ambiguous and misleading per C1. The AC should specify **inline content**, not a file reference:
- M3-003 (amended): _"`pm-agent.yaml` `outputFormat` contains the full template content inlined as a multi-line YAML string"_
- M4-002 (amended): _"`architect-agent.yaml` `outputFormat` contains the spike template content inlined under a `### ARCH_SPIKE output` section header"_

**Recommendation:** Update AC to: _"`qa-agent.yaml` `outputFormat` contains the full QA report template content inlined as a multi-line YAML string"_

### m4: No "Technical Notes / Hints" section

Amended M4-002, M4-004, and M5a-002 include a Technical Notes section covering `outputFormat` behaviour, column spec context, and scaffolding considerations. M6-003 has none.

---

## 5. File Path Alignment with Hexagonal Scaffold

| Referenced Path / Component | Exists in `src/` | Notes |
|----------------------------|-----------------|-------|
| `AgentSpecSchema` | `src/infrastructure/spec-loader/schemas.ts` (line 26) | ✅ |
| `AgentSpec.outputFormat` | `src/domain/model/agent-spec.ts` (line 8) | ✅ Single `readonly outputFormat: string` |
| `PromptBuilder` | `src/application/services/prompt-builder.ts` (line 27) | ✅ Inline text injection confirmed |
| `YamlAgentSpecLoader` | `src/infrastructure/spec-loader/yaml-agent-spec-loader.adapter.ts` | ✅ |
| Runtime: `.aeos/agents/qa-agent.yaml` | N/A (runtime file) | ✅ Produced by M6-002 (AEOS-16) |
| Runtime: `.aeos/templates/qa-report-template.md` | N/A (runtime content file) | ⚠️ Path diverges from system design §5.3 — see C2 |
| Runtime: `.aeos/rubrics/templates/qa-report-template.md` | N/A | ✅ System design canonical path |

No source code changes required — task produces a content file and updates a YAML config. No phantom paths in `src/`.

---

## 6. Dependency Validation

| Dependency | Status | Verified |
|-----------|--------|----------|
| M6-002 (AEOS-16): `qa-agent.yaml` | ⬜ Not yet complete | Task file in `docs/tasks/` (not archived). Amended after review. |
| M6-000 (implicit, missing): `qa.yaml` column spec | ✅ Complete | Archived; review at `REVIEW-20260408-M6-000`. |
| M6-001 (transitive via M6-002): AEOS-15 deploy design | ⬜ Not yet complete | Task file in `docs/tasks/`. |

**Key dependency note:** M6-002's amended task (item 7) establishes a baseline `outputFormat` in `qa-agent.yaml`. M6-003 depends on this field existing to update it. If M6-002 is executed without the amendment, `outputFormat` will be absent and M6-003 cannot "update" a non-existent field. The M6-002 review (C1 + X1) flagged this coordination issue.

---

## 7. Consistency with Sibling Template Tasks

| Aspect | M3-003 (prd, amended) | M4-002 (spike, amended) | M4-004 (tech-spec, amended) | M5a-002 (impl-notes, amended) | **M6-003 (qa-report)** |
|--------|----------------------|------------------------|----------------------------|-------------------------------|------------------------|
| Method | Dogfood ✅ | Dogfood ✅ | Dogfood ✅ | Dogfood ✅ | ❌ Agentic impl |
| Template path | `.aeos/rubrics/templates/` ✅ | `.aeos/rubrics/templates/` ✅ | `.aeos/rubrics/templates/` ✅ | `.aeos/rubrics/templates/` ✅ | ❌ `.aeos/templates/` |
| `outputFormat` note | ✅ | ✅ | ✅ | ✅ | ❌ Missing |
| Inline guidance | ✅ "inlined as multi-line YAML" | ✅ | ✅ | ✅ | ❌ Says "reference" |
| Shared field note | N/A (1 column) | ✅ Concatenate w/ headers | ✅ Append, not replace | ✅ Update section only | N/A (1 column) ✅ |
| Rubric alignment AC | ✅ | ✅ | ✅ | ✅ (conditional) | ❌ Missing |
| Dependencies expanded | ✅ | ✅ | ✅ | ✅ | ❌ Minimal |
| Template dir scaffolding note | ✅ | ✅ | ✅ | ✅ | ❌ Missing |
| DoD includes pipeline | ✅ | ✅ | ✅ | ✅ | ❌ Minimal |

**Key gap:** M6-003 has NOT received the amendments that were applied to all four prior template task reviews. It is the **last remaining unamended template task**. All critical and medium issues from those reviews apply identically here, except the dual-column concatenation issue (which does not apply — the QA agent serves one column).

---

## 8. Cross-Task Coordination Issues

### X1: M6-002 (amended) expects M6-003 to update `outputFormat` with inlined content

M6-002 item 7 (amended): _"M6-003 (AEOS-17) will update this field with the full template content."_

M6-003 step 4 says "Update `qa-agent.yaml` `outputFormat` to reference `qa-report-template.md`" — which won't work (C1). The M6-002 task explicitly expects M6-003 to update `outputFormat` with **inlined** template content. M6-003 describes a different, incompatible operation ("reference" a file path). The two tasks are misaligned.

**Resolution:** Fix via C1 — update M6-003 step 4 to specify inlining.

### X2: M6-004 (AEOS-18) rubric criteria vs M6-003 template sections

M6-004 rubric must cover: _"all implementation notes sections are addressed in the report, edge cases are specific (named, not generic), risk rating is justified with evidence, recommendation is consistent with findings, no unfilled template placeholders."_

M6-003 template sections: Executive Summary, Requirements Coverage Matrix, Edge Cases & Risk Assessment (with severity ratings), Test Results Summary, Findings (risk-rated), Recommendation.

Mapping:
- "all implementation notes sections are addressed" → ✅ Requirements Coverage Matrix
- "edge cases are specific" → ✅ Edge Cases & Risk Assessment
- "risk rating is justified with evidence" → ✅ Findings (risk-rated)
- "recommendation is consistent with findings" → ✅ Recommendation (READY/NOT READY with justification)
- "no unfilled template placeholders" → ✅ Template-level check (structural)

All M6-004 criteria map to M6-003 sections. ✅ No gap.

### X3: M6-000 `requiredSections: []` — will need updating

The QA column spec (M6-000) has `requiredSections: []` (empty). Once the template is finalized, the column spec should be updated with the required section names so that `OutputValidator` can verify them during output validation. This is not blocked by M6-003 but is a downstream coordination task.

---

## 9. Gaps That Would Block Implementation

### 9.1 Blocking gaps

1. **C1 (`outputFormat` is inline text):** The implementer does not know `outputFormat` is inline text, not a file path. The task wording ("reference") actively misleads. Without correction, the implementer will produce a broken prompt (literal file path injected instead of template content).

2. **C2 (template path):** The path `.aeos/templates/` diverges from system design (`.aeos/rubrics/templates/`) and all four amended sibling tasks. Creates inconsistency that will cause downstream lookup failures.

### 9.2 Non-blocking but important

3. **H1 (method mismatch):** Does not prevent execution, but task steps don't include pipeline execution steps.
4. **M1 (dependencies incomplete):** M6-000 and template directory scaffolding context are missing.
5. **M2 (rubric alignment AC):** Without this, template may not align with the rubric, requiring rework.
6. **M3 (`outputFormat` replacement scope):** Missing note that QA agent is single-column — the entire field can be replaced.

---

## 10. Recommendations Summary

| # | Severity | Finding | Action |
|---|----------|---------|--------|
| C1 | Critical | `outputFormat` is inline text; task says "reference" | Add implementation note; update step 4 to specify inlining |
| C2 | Critical | Template path `.aeos/templates/` ≠ system design `.aeos/rubrics/templates/` | Align to `.aeos/rubrics/templates/` per system design and amended siblings |
| H1 | Major | Method "Agentic implementation" ≠ action plan "Dogfood" | Align to action plan |
| M1 | Medium | Dependencies incomplete — missing M6-000, template dir, prerequisite note | Expand dependency list |
| M2 | Medium | No rubric alignment AC | Add conditional AC per M5a-002 pattern |
| M3 | Medium | `outputFormat` replacement scope unclear | Add note about single-column simplification |
| m1 | Minor | No `outputFormat` implementation note | Add per amended sibling pattern |
| m2 | Minor | DoD weaker than AC — no pipeline/reviewer mention | Expand per amended sibling pattern |
| m3 | Minor | AC says "reference" — ambiguous | Specify "inlined as multi-line YAML string" |
| m4 | Minor | No Technical Notes section | Add hints about PromptBuilder, column spec, scaffolding |
| X1 | Cross-task | M6-002 expects inlined content; M6-003 says "reference" | Resolve via C1 |
| X2 | Cross-task | M6-004 rubric criteria map to M6-003 sections | ✅ No gap |
| X3 | Cross-task | M6-000 `requiredSections` needs downstream update | Informational |

---

## 11. Proposed Amendments

### 1. Add implementation note (after Context section)

```markdown
> **⚠️ Implementation note — `outputFormat` resolution gap:**
> The current `PromptBuilder` treats the `outputFormat` field as inline text, not a file path.
> There is no template file loading mechanism in the codebase. The full QA report template
> content must be inlined as a multi-line YAML string in `qa-agent.yaml` `outputFormat` field.
> The QA agent serves a single column (QA), so the entire `outputFormat` field can be
> replaced — no concatenation with other column output formats is needed (unlike
> `architect-agent.yaml` or `engineer-agent.yaml`).
```

### 2. Rewrite "What needs to be done" (C1, C2)

```markdown
## What needs to be done
1. Ensure the `.aeos/rubrics/templates/` directory exists (create it if not already scaffolded)
2. Create `.aeos/rubrics/templates/qa-report-template.md` with sections: Executive Summary,
   Requirements Coverage Matrix, Edge Cases & Risk Assessment (with severity ratings),
   Test Results Summary, Findings (risk-rated), Recommendation (READY FOR DOD / NOT READY —
   with justification)
3. Each section should have descriptive placeholder text
4. Verify the template aligns with `qa-report-structure.md` criteria (AEOS-18, if written —
   otherwise design for expected criteria)
5. Update `qa-agent.yaml` `outputFormat`: inline the full QA report template content as a
   multi-line YAML string. `PromptBuilder` treats `outputFormat` as inline text, not a file
   path. The QA agent serves a single column — replace the entire `outputFormat` field.
```

### 3. Align template path (C2)

Replace all occurrences of `.aeos/templates/qa-report-template.md` with `.aeos/rubrics/templates/qa-report-template.md`.

### 4. Expand Dependencies (M1)

```markdown
## Dependencies
- M6-002: AEOS-16 complete (`qa-agent.yaml` exists with baseline `outputFormat`)
- M6-000: `qa.yaml` column spec (context for how template is consumed)
- Prerequisite (not yet scheduled): template file resolution mechanism — until built,
  template content must be inlined in agent YAML
- Note: `.aeos/rubrics/templates/` directory not scaffolded by any existing task; create if needed
```

### 5. Expand Acceptance Criteria (M2, m3)

```markdown
## Acceptance Criteria
- [ ] `qa-report-template.md` exists at `.aeos/rubrics/templates/qa-report-template.md`
- [ ] All sections present with descriptive placeholders
- [ ] Recommendation section requires explicit READY/NOT READY with justification
- [ ] `qa-agent.yaml` `outputFormat` contains the full QA report template content inlined
      as a multi-line YAML string
- [ ] If `qa-report-structure.md` (AEOS-18) exists, every rubric criterion has a
      corresponding template section
```

### 6. Expand Definition of Done (m2)

```markdown
## Definition of Done
- [ ] `qa-report-template.md` committed at `.aeos/rubrics/templates/qa-report-template.md`
      with all required sections
- [ ] `qa-agent.yaml` `outputFormat` updated with inlined template content
- [ ] All acceptance criteria met
```

### 7. Align method header (H1)

```markdown
**Method:** Dogfood — run through AEOS pipeline
```

### 8. Add Technical Notes (m4)

```markdown
## Technical Notes / Hints
- `PromptBuilder` treats `outputFormat` as inline text, not a file path. Template content
  must be inlined as a multi-line YAML string.
- The QA agent serves a single column (QA). No dual-column concatenation needed — the
  entire `outputFormat` field can be replaced (unlike `architect-agent.yaml` or
  `engineer-agent.yaml`).
- The QA column spec (`qa.yaml`, M6-000) provides column-level context for how this
  template is consumed.
- `.aeos/rubrics/templates/` directory is not scaffolded by `project init`; create if needed.
- M6-002 (AEOS-16, amended) establishes a baseline `outputFormat` in `qa-agent.yaml`.
  M6-003 replaces this baseline with the full template content.
```

---

## 12. Summary

| Category | Count |
|----------|-------|
| Critical | 2 |
| Major | 1 |
| Medium | 3 |
| Minor | 4 |
| Cross-task | 3 (1 issue, 1 informational, 1 confirmed-OK) |

**Overall:** The task correctly identifies the QA report template's purpose and defines a reasonable set of sections (Executive Summary, Requirements Coverage Matrix, Edge Cases & Risk Assessment, Test Results Summary, Findings, Recommendation) that align well with the downstream rubric criteria in M6-004 (AEOS-18). The READY FOR DOD / NOT READY recommendation format is appropriate for the DoD Gate's input. However, M6-003 has NOT absorbed the amendments that were applied to all four prior template task reviews (M3-003, M4-002, M4-004, M5a-002). The same critical issues persist: (1) `outputFormat` is treated as inline text but the task says "reference" a file path, and (2) the template file path uses `.aeos/templates/` instead of the system design's `.aeos/rubrics/templates/`. M6-003 is the **last remaining unamended template task** in the project. The QA agent's single-column nature simplifies the `outputFormat` update (no concatenation needed), making this the simplest template task to amend. All recommended amendments are additive and require no source code changes.