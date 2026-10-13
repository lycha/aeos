# Review: M4-004 — AEOS-8 Tech Spec Template (`tech-spec-template.md`)

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Task file:** `docs/tasks/M4-004-AEOS-8-tech-spec-template.md`
**Cross-referenced against:**
- `docs/03-system-design.md` (System Design v0.3)
- `docs/02-prd.md` (PRD v0.1)
- `docs/05-action-plan-v1.md` (Action Plan)
- Sibling tasks: M3-003 (prd-template), M4-001 (architect-agent), M4-002 (spike-template), M4-003 (tech-spec-rubric), M5a-002 (impl-notes-template), M6-003 (qa-report-template)
- Column spec task: M4-000b (tech-spec column spec, archived)
- Prior reviews: REVIEW-20260408-M4-000b, REVIEW-20260408-M4-001-AEOS-5, REVIEW-20260408-M4-002-AEOS-6, REVIEW-20260408-M4-003-AEOS-7, REVIEW-20260408-M3-003-AEOS-3
- Source code: `src/infrastructure/spec-loader/schemas.ts`, `src/application/services/prompt-builder.ts`, `src/domain/model/agent-spec.ts`, `src/infrastructure/filesystem/fs-rubric-loader.adapter.ts`

---

## Verdict: APPROVE WITH REQUIRED CHANGES

Two critical issues, one medium issue, and four minor issues. The critical issues (C1, C2) are identical to those found and fixed in the M4-002 (spike-template) review — the `outputFormat` inline-text constraint and single-field sharing. These fixes were propagated to M4-002 but **not** to M4-004, despite M4-004 being the other half of the same shared field. The task is otherwise well-scoped and correctly coordinated with M4-003 (tech-spec rubric).

---

## Critical Issues

### 🔴 C1: `outputFormat` is inline text — task says "reference" a template file

**Task step 4:** _"Update `architect-agent.yaml` `outputFormat` to reference `tech-spec-template.md` for TECH_SPEC column."_

**Implemented `PromptBuilder`** (`src/application/services/prompt-builder.ts` line 27):
```typescript
sections.push(`[OUTPUT FORMAT]\n${agentSpec.outputFormat}`);
```

The `outputFormat` field is injected as **literal inline text**, not resolved as a file path. Setting `outputFormat` to `"tech-spec-template.md"` will inject the literal string `"tech-spec-template.md"` into the prompt — not the file contents.

This exact gap was flagged as:
- 🔴 HIGH (F-1) in the M3-003 review (prd-template) — M3-003 was amended
- 🔴 C1 in the M4-002 review (spike-template) — M4-002 was amended
- 🔴 C2 in the M4-001 review (architect-agent) — M4-001 was amended

**M4-004 has no such amendment.** The task uses the word "reference" which implies file path resolution — a mechanism that does not exist in the codebase.

**Impact:** The implementer will either (a) set `outputFormat` to a file path string (producing a broken prompt with a literal path instead of template content), or (b) not know to inline the content.

**Recommendation:** Add an implementation note (after Context section) and update step 4. See Proposed Amendments §1 and §2.

### 🔴 C2: Single `outputFormat` field — task does not acknowledge shared field with AEOS-6

**`AgentSpecSchema`** (`src/infrastructure/spec-loader/schemas.ts` line 31):
```typescript
outputFormat: z.string().min(1),
```

The architect agent serves **two columns** (ARCH_SPIKE and TECH_SPEC). There is one `outputFormat` field on `AgentSpecSchema`. M4-002 (AEOS-6, spike-template) adds the spike template under `### ARCH_SPIKE output`. M4-004 (this task) must add the tech-spec template under `### TECH_SPEC output` — **appending** to the existing field, not replacing it.

The M4-002 task was amended (post-review) to specify this concatenation pattern explicitly. M4-001 (architect-agent spec, step 7) also documents it:
> _"outputFormat: single multi-line YAML string with inline template content... concatenate both column-specific templates with section headers (`### ARCH_SPIKE output` / `### TECH_SPEC output`)."_

**M4-004 step 4 says** _"Update `architect-agent.yaml` `outputFormat` to reference `tech-spec-template.md` for TECH_SPEC column"_ — no mention of the existing ARCH_SPIKE content or the concatenation pattern. If the implementer replaces the entire `outputFormat` field, the spike template content from AEOS-6 is lost.

**Impact:** Overwriting `outputFormat` destroys the spike template content. The ARCH_SPIKE column would then have no output format guidance in the prompt.

**Recommendation:** Update step 4 to specify the concatenation pattern. See Proposed Amendments §2.

---

## Major Issues

_None._

---

## Medium Issues

### ⚠️ M1: Template file path diverges from system design

**Task:** `.aeos/templates/tech-spec-template.md`
**System design §5.3 (Rubric Library):**
```
/rubrics/
  templates/
    tech-spec-template.md     ← artifact output template for architect-agent
```

The system design places templates under `rubrics/templates/`, making the canonical path `.aeos/rubrics/templates/tech-spec-template.md`. The task uses `.aeos/templates/` — a top-level directory not defined in the system design.

**Cross-task consistency:** All template tasks (M3-003, M4-002, M4-004, M5a-002, M6-003) consistently use `.aeos/templates/`. This was flagged in:
- M3-003 review (F-2) — recommended aligning to `.aeos/rubrics/templates/`
- M4-002 review (M1) — same recommendation

The M4-002 task was **subsequently amended** to use `.aeos/rubrics/templates/spike-template.md`. M4-004 was not updated.

**Impact:** Path inconsistency between M4-004 (uses `.aeos/templates/`) and the amended M4-002 (uses `.aeos/rubrics/templates/`). The system design is clear: templates live under `rubrics/templates/`.

**Recommendation:** Align to `.aeos/rubrics/templates/tech-spec-template.md` per system design and per the amended M4-002 convention.

---

## Minor Issues

### m1: Method header inconsistent with action plan

**Task header:** `Method: Agentic implementation`
**Action plan §M4:** _"Method: Dogfood."_ — All M4 tickets are listed as dogfood tickets run through the pipeline.
**Sibling M3-003 (after amendment):** `Method: Dogfood — run through AEOS pipeline`
**Sibling M4-002 (after amendment):** `Method: Dogfood — run through AEOS pipeline`

This has been flagged in every M4 task review (M4-001 H1, M4-002 m1, M4-003 m1). All M4 tasks originally used "Agentic implementation" but M4-002 was amended to "Dogfood."

**Recommendation:** Align to `Method: Dogfood — run through AEOS pipeline` per action plan.

### m2: Dependencies incomplete — missing column spec and template directory scaffolding

**Task Dependencies:** _"M4-003: AEOS-7 complete (`tech-spec-structure.md` rubric exists)"_

**Missing:**
- **M4-000b:** `tech-spec.yaml` column spec — step 4 implicitly requires knowing how the template is consumed. The column spec must exist. M4-000b is archived (complete), so this is technically satisfied, but should be listed for traceability.
- **M4-001 (AEOS-5):** `architect-agent.yaml` — step 4 updates this file. It must exist before it can be updated.
- **M4-002 (AEOS-6):** Spike template — the existing `outputFormat` content from AEOS-6 must be preserved when AEOS-8 adds the tech-spec template. The implementer needs to know AEOS-6 has already written to the same field.
- **Template directory scaffolding:** `.aeos/templates/` (or `.aeos/rubrics/templates/`) is not created by any existing task. `ProjectInitUseCase` scaffolds `.aeos/agents/` and `.aeos/column-specs/` (M2-014, M2-015) but does not scaffold template directories. Same gap flagged in M3-003 (F-5), M4-002 (dependency note), and M4-003 (M1).

If this is a dogfood ticket, additional pipeline dependencies would apply (all prior column specs and agents for pipeline transit).

**Recommendation:** Expand dependencies. See Proposed Amendments §4.

### m3: Template sections not validated against system design artifact table

**Task step 1 sections:** Overview, Component Architecture, API Contracts, Data Model, Error Handling, Dependencies, Test Strategy, Migration Plan (8 sections)

**System design §5.3:** _"tech-spec-structure.md — ADRs, API contracts, data models"_ (3 items mentioned for rubric)

**M4-003 rubric criteria (step 2):** component diagram or module list, API contracts (endpoints, schemas), data model changes, error handling strategy, dependency declarations, test strategy outline (6 criteria)

The template sections (8) are a superset of the rubric criteria (6) — this is correct and desirable. The template includes "Overview" and "Migration Plan" which are not in the rubric. This is fine: templates guide the writer, rubrics evaluate the result. Having template sections that exceed rubric criteria is better than the reverse.

**However:** The task step 3 says _"Verify the template aligns with all criteria in `tech-spec-structure.md` (AEOS-7)"_. This verification step has no corresponding acceptance criterion.

**Impact:** Low — the sections clearly cover the rubric criteria. But the verification step should be testable.

**Recommendation:** Add AC: `- [ ] Every criterion in tech-spec-structure.md (AEOS-7) has a corresponding template section`

### m4: Definition of Done is weaker than Acceptance Criteria

**DoD:**
- `tech-spec-template.md` committed with all required sections
- `architect-agent.yaml` updated

**AC has 4 items** including "All sections match the criteria in `tech-spec-structure.md`" and "Placeholders are descriptive." The DoD omits these. If this is a dogfood ticket, DoD should also include pipeline completion (as in M3-003's amended DoD).

**Recommendation:** Align DoD to cover all AC items, or add pipeline completion if method is changed to dogfood.

---

## Correctness vs System Design

| Aspect | Task | System Design | Verdict |
|--------|------|---------------|---------|
| Artifact name | `tech-spec-template.md` | §5.3: `tech-spec-template.md` listed under `rubrics/templates/` | ✅ Exact match |
| Template path | `.aeos/templates/tech-spec-template.md` | §5.3: `.aeos/rubrics/templates/tech-spec-template.md` | ⚠️ Divergent — see M1 |
| Template purpose | Output format for TECH_SPEC column | §4.4: `[OUTPUT FORMAT] {artifact template}` | ✅ Correct purpose |
| Agent YAML update | `architect-agent.yaml` `outputFormat` | §5.1: `output_template: rubrics/templates/tech-spec-template.md` (file path) | ⚠️ System design implies file path; implementation is inline text — see C1 |
| Template sections | 8 sections | §5.3: "ADRs, API contracts, data models" for rubric | ✅ Superset of system design criteria |
| Column output | `tech-spec.md` | §2.2: `SAAS-1-tech-spec.md` | ✅ Match (ticket ID prefix added at runtime) |

**Note:** The system design §5.1 example shows `output_template: rubrics/templates/prd-template.md` — a file path reference. The implemented `AgentSpecSchema` has `outputFormat: z.string().min(1)` (inline text). The system design's intent (file path) differs from the implementation (inline text). This divergence is acknowledged in M4-001 technical notes and is consistent across all template tasks.

---

## File Path Alignment with Hexagonal Scaffold

| Referenced Path / Component | Exists in `src/` | Notes |
|----------------------------|-----------------|-------|
| `AgentSpecSchema` | `src/infrastructure/spec-loader/schemas.ts` (line 26) | ✅ |
| `AgentSpec.outputFormat` | `src/domain/model/agent-spec.ts` (line 8) | ✅ Single `readonly outputFormat: string` |
| `PromptBuilder` | `src/application/services/prompt-builder.ts` (line 27) | ✅ Inline text injection confirmed |
| `YamlAgentSpecLoader` | `src/infrastructure/spec-loader/yaml-agent-spec-loader.adapter.ts` | ✅ |
| `FsRubricLoader` | `src/infrastructure/filesystem/fs-rubric-loader.adapter.ts` | ✅ (not used by templates — templates are inlined) |
| `ColumnSpec.reviewerRubrics` | `src/domain/model/column-spec.ts` | ✅ (not directly modified by this task) |
| Runtime: `.aeos/agents/architect-agent.yaml` | N/A (runtime file) | ✅ Consistent with M4-001 |
| Runtime: `.aeos/templates/tech-spec-template.md` | N/A (runtime content file) | ⚠️ Path diverges from system design §5.3 |

No source code changes required — task produces content files and updates a YAML config. No phantom paths in `src/`.

---

## Dependency Validation

| Dependency | Status | Verified |
|-----------|--------|----------|
| M4-003 (AEOS-7): `tech-spec-structure.md` | ⬜ Not yet complete | Task file in `docs/tasks/` (not archived). |
| M4-001 (AEOS-5, implicit): `architect-agent.yaml` | ⬜ Not yet complete | Task file in `docs/tasks/`. Required by step 4 (update YAML). |
| M4-002 (AEOS-6, implicit): spike template in `outputFormat` | ⬜ Not yet complete | Task file in `docs/tasks/`. Must execute before AEOS-8 to avoid field collision. |
| M4-000b (implicit): `tech-spec.yaml` column spec | ✅ Complete | Archived; review at `REVIEW-20260408-M4-000b`. |

**Execution order matters:** M4-001 (create agent YAML) → M4-002 (add spike template to `outputFormat`) → M4-004 (append tech-spec template to `outputFormat`). If M4-004 executes before M4-002, the spike template section will be missing and AEOS-6's later execution would need to handle the append correctly. The dependency chain should make this ordering explicit.

---

## Consistency with Sibling Tasks

| Sibling | Pattern Match | Notes |
|---------|--------------|-------|
| M3-003 (prd-template) | ⚠️ Partial | M3-003 amended with: `outputFormat` note, inlining guidance, prerequisite dependency, expanded ACs. M4-004 lacks all of these. |
| M4-002 (spike-template) | ⚠️ Partial | M4-002 amended with: implementation note, concatenation pattern, `### ARCH_SPIKE output` header, expanded dependencies, corrected path. M4-004 has none of these amendments. |
| M4-003 (tech-spec-rubric) | ✅ Downstream match | M4-003 produces the rubric; M4-004 step 3 validates template sections against rubric criteria. Correctly coordinated. |
| M5a-002 (impl-notes-template) | ✅ Same structure | Same pattern, same issues (unamended). |
| M6-003 (qa-report-template) | ✅ Same structure | Same pattern, same issues (unamended). |

**Key gap vs M4-002 (amended):** M4-002 was updated post-review with: (1) ⚠️ implementation note about `outputFormat` inline-text constraint, (2) step 4 updated to specify inlining under `### ARCH_SPIKE output` header, (3) expanded dependencies including template directory note, (4) corrected path to `.aeos/rubrics/templates/`. M4-004 has **none** of these amendments — findings from the M4-002 review were not propagated to this task despite them being two halves of the same `outputFormat` field.

---

## Blocking Gaps

Two issues would block a clean implementation:

1. **C1:** The implementer does not know `outputFormat` is inline text, not a file path. The task wording ("reference") actively misleads toward file path resolution.

2. **C2:** The implementer does not know the spike template content already occupies the `outputFormat` field (added by AEOS-6). Without the concatenation pattern, the implementer will overwrite the spike template, breaking the ARCH_SPIKE column's output format.

**Non-blocking but fragile:**

3. **M1:** The template directory (`.aeos/templates/` or `.aeos/rubrics/templates/`) is not scaffolded by `project init`. The implementer must manually create it. This is a known workaround, not a hard blocker.

---

## Recommendations Summary

| # | Severity | Finding | Action |
|---|----------|---------|--------|
| C1 | Critical | `outputFormat` is inline text; task says "reference" | Add implementation note; update step 4 to specify inlining |
| C2 | Critical | Single `outputFormat` field shared with AEOS-6 (spike template) | Add concatenation guidance with `### TECH_SPEC output` header |
| M1 | Medium | Template path `.aeos/templates/` ≠ system design `.aeos/rubrics/templates/` | Align to `.aeos/rubrics/templates/` per system design and amended M4-002 |
| m1 | Minor | Method "Agentic implementation" ≠ action plan "Dogfood" | Align to action plan |
| m2 | Minor | Dependencies incomplete — missing M4-001, M4-002, M4-000b, template dir | Expand dependency list |
| m3 | Minor | Verification step (step 3) has no corresponding AC | Add validation AC |
| m4 | Minor | DoD weaker than AC | Align DoD to AC |

---

## Proposed Amendments

### 1. Add implementation note (after Context section)

```markdown
> **⚠️ Implementation note — `outputFormat` resolution gap:**
> The current `PromptBuilder` treats the `outputFormat` field as inline text, not a file path.
> There is no template file loading mechanism in the codebase. The full tech-spec template
> content must be inlined as a multi-line YAML string in `architect-agent.yaml` `outputFormat`
> field under a `### TECH_SPEC output` section header (the field is shared with AEOS-6's
> spike template via concatenation under `### ARCH_SPIKE output`).
```

### 2. Update step 4

```markdown
4. Update `architect-agent.yaml` `outputFormat`: inline the full tech-spec template content as a
   multi-line YAML string under a `### TECH_SPEC output` section header. The `AgentSpecSchema`
   has one `outputFormat` field; AEOS-6 has already added spike template content under
   `### ARCH_SPIKE output`. Append the tech-spec template — do NOT replace the existing content.
```

### 3. Align template path (M1)

Replace all occurrences of `.aeos/templates/tech-spec-template.md` with `.aeos/rubrics/templates/tech-spec-template.md`.

### 4. Expand dependencies

```markdown
## Dependencies
- M4-003: AEOS-7 complete (`tech-spec-structure.md` rubric exists)
- M4-001: AEOS-5 complete (`architect-agent.yaml` exists — step 4 updates this file)
- M4-002: AEOS-6 complete (spike template already in `outputFormat` — step 4 must append, not replace)
- M4-000b: `tech-spec.yaml` column spec (context for how template is consumed)
- Prerequisite (not yet scheduled): template file resolution mechanism — until built,
  template content must be inlined in agent YAML
- Note: `.aeos/rubrics/templates/` directory not scaffolded by any existing task; create if needed
```

### 5. Add verification AC and align DoD (m3, m4)

Add to Acceptance Criteria:
```markdown
- [ ] Every criterion in `tech-spec-structure.md` (AEOS-7) has a corresponding template section
```

Update Definition of Done:
```markdown
## Definition of Done
- [ ] `tech-spec-template.md` committed at `.aeos/rubrics/templates/tech-spec-template.md` with all required sections
- [ ] `architect-agent.yaml` `outputFormat` contains the tech-spec template content inlined
      under a `### TECH_SPEC output` section header (appended to existing ARCH_SPIKE content)
- [ ] All acceptance criteria met
```

### 6. Align method header (m1)

```markdown
**Method:** Dogfood — run through AEOS pipeline
```

---

## Summary

| Category | Count |
|----------|-------|
| Critical | 2 |
| Major | 0 |
| Medium | 1 |
| Minor | 4 |

**Overall:** The task correctly identifies the tech-spec template's purpose, defines reasonable sections that are a superset of the rubric criteria (M4-003), and correctly coordinates the downstream validation (step 3: verify against `tech-spec-structure.md`). However, the two critical gaps — the `outputFormat` inline-text constraint and the single-field sharing with AEOS-6 — were surfaced and fixed in prior sibling reviews (M3-003, M4-001, M4-002) but were **not propagated** to this task. This is particularly concerning because M4-004 is the *second* half of the shared `outputFormat` field: it must append to the field AEOS-6 has already written to, not replace it. The template path divergence (`.aeos/templates/` vs `.aeos/rubrics/templates/`) has been resolved in M4-002's amendment but not applied here, creating an intra-M4 inconsistency. All findings are addressable with task amendments — no code changes required.