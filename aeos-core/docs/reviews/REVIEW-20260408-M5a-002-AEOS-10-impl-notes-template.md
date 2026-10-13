# Review: M5a-002 — AEOS-10 Implementation Notes Template (`impl-notes-template.md`)

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Task file:** `docs/tasks/M5a-002-AEOS-10-impl-notes-template.md`
**Cross-referenced against:**
- `docs/03-system-design.md` (System Design v0.3)
- `docs/02-prd.md` (PRD v0.1)
- `docs/05-action-plan-v1.md` (Action Plan)
- Sibling template tasks: M3-003 (prd-template, amended), M4-002 (spike-template, amended), M4-004 (tech-spec-template, amended), M6-003 (qa-report-template)
- Same-milestone tasks: M5a-001 (engineer-agent, amended), M5a-003 (impl-structure-rubric), M5a-004 (constraints-injection)
- Column spec: M5a-000 (implementation column spec, archived)
- Prior reviews: REVIEW-20260408-M5a-001, REVIEW-20260408-M4-004, REVIEW-20260408-M3-003, REVIEW-20260408-M4-002
- Source code: `src/infrastructure/spec-loader/schemas.ts`, `src/application/services/prompt-builder.ts`, `src/domain/model/agent-spec.ts`, `src/infrastructure/spec-loader/yaml-agent-spec-loader.adapter.ts`

---

## Verdict: APPROVE WITH REQUIRED CHANGES

Two critical issues, one major issue, and multiple medium/minor findings. The critical issues are identical to those found and fixed in all prior template task reviews (M3-003, M4-002, M4-004) but **not propagated** to this task. All findings are addressable with task amendments — no source code changes required.

---

## Critical Issues

### 🔴 C1: `outputFormat` is inline text — task says "reference" a template file

**Task step 4:** _"Update `engineer-agent.yaml` `outputFormat` to reference `impl-notes-template.md` for IMPLEMENTATION column"_

**Implemented `PromptBuilder`** (`src/application/services/prompt-builder.ts` line 27):
```typescript
sections.push(`[OUTPUT FORMAT]\n${agentSpec.outputFormat}`);
```

The `outputFormat` field is injected as **literal inline text**, not resolved as a file path. There is no template file loading mechanism in the codebase. Setting `outputFormat` to `"impl-notes-template.md"` will inject the literal string into the prompt — not the file contents.

This exact gap was flagged and fixed in:
- 🔴 HIGH (F-1) in M3-003 review → M3-003 amended
- 🔴 C1 in M4-002 review → M4-002 amended
- 🔴 C1 in M4-004 review → M4-004 amended

**M5a-002 has no such amendment.** The word "reference" actively misleads toward file path resolution.

**Impact:** The implementer will either (a) set `outputFormat` to a file path string (broken prompt), or (b) not know to inline the content.

**Recommendation:** Add an implementation note and update step 4 to specify inlining. See Proposed Amendments §1 and §2.

### 🔴 C2: Single `outputFormat` field — task does not acknowledge shared field with CODE_REVIEW

**`AgentSpecSchema`** (`src/infrastructure/spec-loader/schemas.ts` line 31):
```typescript
outputFormat: z.string().min(1),
```

The engineer agent serves **two columns** (IMPLEMENTATION and CODE_REVIEW). There is one `outputFormat` field. M5a-001 (amended) establishes the `outputFormat` with inline template content for both columns under section headers (`### IMPLEMENTATION output` / `### CODE_REVIEW output`). M5a-002 must **update** the `### IMPLEMENTATION output` section — not replace the entire field.

The amended M5a-001 (item 7) documents this:
> _"M5a-002 and M5b-002 will update this field later."_

But M5a-002 does not acknowledge the concatenation pattern, does not mention the `### IMPLEMENTATION output` header, and does not warn against overwriting the CODE_REVIEW section.

**Impact:** If the implementer replaces the entire `outputFormat` field, the CODE_REVIEW output format is lost. The CODE_REVIEW column would then have no output format guidance.

**Recommendation:** Update step 4 to specify the update-not-replace pattern. See Proposed Amendments §2.

---

## Major Issues

### ⚠️ H1: Template file path diverges from system design

**Task step 1:** `.aeos/templates/impl-notes-template.md`
**System design §5.3 (Rubric Library):**
```
/rubrics/
  templates/
    implementation-notes-template.md
```

Two divergences:

1. **Directory:** Task uses `.aeos/templates/` (top-level). System design uses `.aeos/rubrics/templates/`. All amended sibling template tasks (M3-003, M4-002, M4-004) have been corrected to `.aeos/rubrics/templates/`. M5a-002 was **not** updated.

2. **Filename:** Task uses `impl-notes-template.md`. System design §5.3 lists `implementation-notes-template.md`. The system design filename is more descriptive and consistent with the output artifact name (`implementation-notes.md` per M5a-000 column spec).

**Impact:** Creates path inconsistency with amended sibling tasks and the system design. Any future code that reads templates from `rubrics/templates/` (per system design) will not find this file.

**Recommendation:** Align to `.aeos/rubrics/templates/impl-notes-template.md` per system design directory structure and amended sibling convention. The shortened filename `impl-notes-template.md` is acceptable (consistent with M5a-003's `impl-structure.md` convention) but should be a conscious choice documented in the task.

---

## Medium Issues

### ⚠️ M1: Method header inconsistent with action plan

**Task header:** `Method: Agentic implementation`
**Action plan §M5a:** _"Method: Dogfood."_ — All M5a tickets are listed as dogfood tickets.

Pattern check across amended sibling template tasks:
- M3-003 (prd-template, amended): `Dogfood — run through AEOS pipeline` ✅
- M4-002 (spike-template, amended): `Dogfood — run through AEOS pipeline` ✅
- M4-004 (tech-spec-template, amended): `Dogfood — run through AEOS pipeline` ✅
- **M5a-002 (impl-notes-template): `Agentic implementation`** ❌
- M6-003 (qa-report-template): `Agentic implementation` ❌ (same issue)

**Recommendation:** Change to `Method: Dogfood — run through AEOS pipeline`.

### ⚠️ M2: Template sections incomplete vs system design and sibling patterns

**Task step 1 sections:** Summary, Files Changed (with rationale per file), Test Plan, Rollback Plan, Open Risks (5 sections)

**System design §2.2:** `SAAS-1-implementation-notes.md` — the system design does not enumerate required sections for impl notes.

**System design §2.1:** _"Implementation sign-off reviews `implementation-notes.md` (the plan — approach, reasoning, design decisions)."_

The task sections cover most aspects but are missing explicit sections for:
- **Approach / Design Decisions** — the system design specifically calls out "approach, reasoning, design decisions" as what the sign-off reviews
- **Requirements Traceability** — mapping implementation steps back to tech spec requirements (mentioned in M5a-003 rubric scope: "all tech spec requirements addressed")

These are the primary sections the reviewer rubric (M5a-003) will evaluate against. Without them, the template may produce artifacts that fail the rubric's traceability criteria.

**Recommendation:** Add "Approach & Design Decisions" and "Requirements Traceability" sections, or verify that "Summary" and "Files Changed (with rationale)" adequately cover these concerns.

### ⚠️ M3: Dependencies incomplete

**Listed:** _"M5a-001: AEOS-9 complete (`engineer-agent.yaml` exists)"_

**Missing:**
- **M5a-000: `implementation.yaml` column spec** — implicit but should be listed for traceability. The template is consumed in the IMPLEMENTATION column, which requires this spec.
- **Template directory scaffolding** — `.aeos/rubrics/templates/` is not scaffolded by `project init`. Same gap as M3-003 (F-5), M4-002 (dependency note), M4-004 (m2). No task creates this directory.
- **Prerequisite (not yet scheduled): template file resolution mechanism** — until built, template content must be inlined in agent YAML. Same prerequisite noted in M3-003, M4-002, M4-004 amended versions.

**Recommendation:** Expand dependencies. See Proposed Amendments §4.


### ⚠️ M4: Step 3 cross-reference with AEOS-11 has a timing problem

**Task step 3:** _"Verify the template captures all criteria from `impl-structure.md` (AEOS-11, if already written — otherwise align with expected criteria)"_

The "(if already written)" caveat acknowledges AEOS-11 may not exist yet. But AEOS-11 (M5a-003) lists its dependency as:
> _"M5a-001: AEOS-9 complete (`engineer-agent.yaml` exists)"_

This means M5a-002 and M5a-003 share the **same dependency** (M5a-001) and have **no ordering constraint** between them. Either could execute first. If M5a-002 executes first (without the rubric), the template may not align with the rubric, requiring rework when AEOS-11 completes.

**Recommendation:** Either:
1. Add M5a-003 as an explicit dependency (stronger alignment guarantee), or
2. Keep the current "(if already written)" flexibility but add an AC: _"If `impl-structure.md` exists, every rubric criterion has a corresponding template section"_

---

## Minor Issues

### m1: No implementation note about `outputFormat` resolution gap

All amended sibling template tasks (M3-003, M4-002, M4-004) include a prominent implementation note:

```markdown
> **⚠️ Implementation note — `outputFormat` resolution gap:**
> The current `PromptBuilder` treats the `outputFormat` field as inline text, not a file path.
```

M5a-002 has no such note. See Proposed Amendments §1.

### m2: Definition of Done is weaker than Acceptance Criteria

**DoD:**
- `impl-notes-template.md` committed with all required sections
- `engineer-agent.yaml` updated

**AC has 3 items** including "All sections present with descriptive placeholders." The DoD does not mention placeholders or the agent YAML update pattern (inline vs reference). If dogfood, DoD should include pipeline completion per amended sibling pattern.

### m3: Acceptance Criteria missing rubric alignment check

**Task step 3** requires verifying alignment with `impl-structure.md`, but there is no corresponding AC. Amended M4-004 added:
> `- [ ] Every criterion in tech-spec-structure.md (AEOS-7) has a corresponding template section`

M5a-002 should have the equivalent.

### m4: Template filename inconsistent with system design

System design §5.3: `implementation-notes-template.md`
Task: `impl-notes-template.md`

The shortened name is not necessarily wrong but diverges from the system design's explicit listing. If the convention is to use shortened names (as M5a-003 uses `impl-structure.md` instead of `implementation-structure.md`), this should be documented as a conscious choice.

---

## Correctness vs System Design

| Aspect | Task | System Design | Verdict |
|--------|------|---------------|---------|
| Artifact name | `impl-notes-template.md` | §5.3: `implementation-notes-template.md` | ⚠️ Shortened — see m4 |
| Template path | `.aeos/templates/impl-notes-template.md` | §5.3: `.aeos/rubrics/templates/` | ⚠️ Wrong directory — see H1 |
| Template purpose | Output format for IMPLEMENTATION column | §4.4: `[OUTPUT FORMAT] {artifact template}` | ✅ Correct purpose |
| Agent YAML update | `engineer-agent.yaml` `outputFormat` | §5.1: `output_template` (file path) | ⚠️ System design implies file path; implementation is inline text — see C1 |
| Template sections | 5 sections | §2.1: "approach, reasoning, design decisions" | ⚠️ Partially covered — see M2 |
| Column output | `implementation-notes.md` | §2.2: `SAAS-1-implementation-notes.md` | ✅ Match (ticket prefix at runtime) |
| Agent | `engineer-agent` | §5.2: `engineer-agent` — worker — BUILD | ✅ Match |

---

## File Path Alignment with Hexagonal Scaffold

| Referenced Path / Component | Exists in `src/` | Notes |
|----------------------------|-----------------|-------|
| `AgentSpecSchema` | `src/infrastructure/spec-loader/schemas.ts` (line 26) | ✅ |
| `AgentSpec.outputFormat` | `src/domain/model/agent-spec.ts` (line 8) | ✅ Single `readonly outputFormat: string` |
| `PromptBuilder` | `src/application/services/prompt-builder.ts` (line 27) | ✅ Inline text injection confirmed |
| `YamlAgentSpecLoader` | `src/infrastructure/spec-loader/yaml-agent-spec-loader.adapter.ts` | ✅ |
| `FsRubricLoader` | `src/infrastructure/filesystem/fs-rubric-loader.adapter.ts` | ✅ (not used by templates — templates are inlined) |
| Runtime: `.aeos/agents/engineer-agent.yaml` | N/A (runtime file) | ✅ Consistent with M5a-001 |
| Runtime: `.aeos/templates/impl-notes-template.md` | N/A (runtime content file) | ⚠️ Path diverges from system design §5.3 |

No source code changes required — task produces content files and updates a YAML config. No phantom paths in `src/`.

---

## Dependency Validation

| Dependency | Status | Verified |
|-----------|--------|----------|
| M5a-001 (AEOS-9): `engineer-agent.yaml` | ⬜ Not yet complete | Task file in `docs/tasks/` (not archived). Amended. |
| M5a-000 (implicit, missing): `implementation.yaml` column spec | ✅ Complete | Archived; review at `REVIEW-20260408-M5a-000`. |
| M5a-003 (peer, not dependent): `impl-structure.md` rubric | ⬜ Not yet complete | Task file in `docs/tasks/`. No ordering constraint. |

**Note:** M5a-001's only listed dependency (M4 complete) appears not yet met — M4 tasks are not archived. M5a-002 transitively depends on M4 completion through M5a-001.

---

## Consistency with Sibling Template Tasks

| Aspect | M3-003 (prd, amended) | M4-002 (spike, amended) | M4-004 (tech-spec, amended) | **M5a-002 (impl-notes)** | M6-003 (qa-report) |
|--------|----------------------|------------------------|----------------------------|--------------------------|---------------------|
| Method | Dogfood ✅ | Dogfood ✅ | Dogfood ✅ | ❌ Agentic impl | ❌ Agentic impl |
| Template path | `.aeos/rubrics/templates/` ✅ | `.aeos/rubrics/templates/` ✅ | `.aeos/rubrics/templates/` ✅ | ❌ `.aeos/templates/` | ❌ `.aeos/templates/` |
| `outputFormat` note | ✅ | ✅ | ✅ | ❌ Missing | ❌ Missing |
| Inline guidance | ✅ | ✅ | ✅ | ❌ Says "reference" | ❌ Says "reference" |
| Shared field acknowledgment | N/A (1 column) | ✅ Concatenate w/ headers | ✅ Append, not replace | ❌ Missing | N/A (1 column) |
| Rubric alignment AC | ✅ | ✅ | ✅ | ❌ Missing | ❌ Missing |
| Dependencies expanded | ✅ | ✅ | ✅ | ❌ Minimal | ❌ Minimal |
| Template dir scaffolding note | ✅ | ✅ | ✅ | ❌ Missing | ❌ Missing |

**Key gap:** M5a-002 has NOT received the amendments that were applied to M3-003, M4-002, and M4-004 after their reviews. All critical and medium issues from those reviews apply identically here. M5a-002 and M6-003 are the two remaining unamended template tasks.

---

## Cross-Task Coordination Issues

### X1: M5a-001 (amended) expects M5a-002 to update `outputFormat`

M5a-001 item 7: _"M5a-002 and M5b-002 will update this field later."_

M5a-002 step 4 says "reference `impl-notes-template.md`" — which won't work (C1). The M5a-001 task explicitly expects M5a-002 to update the `### IMPLEMENTATION output` section of `outputFormat` with inlined template content. M5a-002 does not describe this operation.

### X2: M5a-003 rubric criteria vs M5a-002 template sections

M5a-003 rubric must cover: "all tech spec requirements addressed, file changes are justified, test plan covers happy path and error cases, rollback plan exists, no orphan changes."

M5a-002 template sections: Summary, Files Changed (with rationale), Test Plan, Rollback Plan, Open Risks.

Mapping:
- "all tech spec requirements addressed" → ❓ No explicit traceability section
- "file changes are justified" → ✅ "Files Changed (with rationale per file)"
- "test plan covers happy path and error cases" → ✅ "Test Plan"
- "rollback plan exists" → ✅ "Rollback Plan"
- "no orphan changes" → ❓ No explicit traceability section

Two rubric criteria ("all tech spec requirements addressed", "no orphan changes") don't have explicit template sections. Both relate to requirements traceability. See M2.

### X3: M5a-000 `requiredSections: []` — will need updating

The implementation column spec (M5a-000) has `requiredSections: []` (empty). Once the template is finalized, the column spec should be updated with the required section names so that `OutputValidator` can verify them during output validation. This is not blocked by M5a-002 but is a downstream coordination task.

---

## Blocking Gaps

Three issues would block a clean implementation:

1. **C1 + C2:** The implementer does not know `outputFormat` is inline text, not a file path. The task wording ("reference") actively misleads. Furthermore, the implementer does not know the `outputFormat` field is shared with CODE_REVIEW content (from M5a-001 item 7). Without the concatenation/update pattern, the implementer will either break the prompt or overwrite the CODE_REVIEW section.

2. **H1:** The template path (`.aeos/templates/`) diverges from the system design (`.aeos/rubrics/templates/`) and from all amended sibling tasks. This creates an intra-milestone inconsistency.

3. **X1:** The upstream task (M5a-001 amended) explicitly expects M5a-002 to perform a specific `outputFormat` update operation. M5a-002 describes a different, incompatible operation ("reference" a file path). The two tasks are misaligned.

---

## Recommendations Summary

| # | Severity | Finding | Action |
|---|----------|---------|--------|
| C1 | Critical | `outputFormat` is inline text; task says "reference" | Add implementation note; update step 4 to specify inlining |
| C2 | Critical | Single `outputFormat` field shared with CODE_REVIEW | Add update-not-replace guidance with `### IMPLEMENTATION output` header |
| H1 | Major | Template path `.aeos/templates/` ≠ system design `.aeos/rubrics/templates/` | Align to `.aeos/rubrics/templates/` per system design and amended siblings |
| M1 | Medium | Method "Agentic implementation" ≠ action plan "Dogfood" | Align to action plan |
| M2 | Medium | Template sections missing requirements traceability | Add section or verify coverage |
| M3 | Medium | Dependencies incomplete — missing M5a-000, template dir, prerequisite note | Expand dependency list |
| M4 | Medium | Step 3 cross-reference with AEOS-11 has no ordering constraint | Add dependency or conditional AC |
| m1 | Minor | No `outputFormat` implementation note | Add per amended sibling pattern |
| m2 | Minor | DoD weaker than AC | Align DoD to AC |
| m3 | Minor | No rubric alignment AC | Add conditional AC |
| m4 | Minor | Filename shortened vs system design | Document choice |
| X1 | Cross-task | M5a-001 expects specific `outputFormat` update; M5a-002 describes incompatible operation | Resolve via C1 + C2 |
| X2 | Cross-task | Two rubric criteria lack template sections (traceability) | Resolve via M2 |
| X3 | Cross-task | M5a-000 `requiredSections` will need downstream update | Informational — not blocking |

---

## Proposed Amendments

### 1. Add implementation note (after Context section)

```markdown
> **⚠️ Implementation note — `outputFormat` resolution gap:**
> The current `PromptBuilder` treats the `outputFormat` field as inline text, not a file path.
> There is no template file loading mechanism in the codebase. The full implementation notes
> template content must be inlined as a multi-line YAML string in `engineer-agent.yaml`
> `outputFormat` field under the `### IMPLEMENTATION output` section header (the field is
> shared with CODE_REVIEW output format via M5b-002). Update the IMPLEMENTATION section
> only — do NOT replace the entire `outputFormat` field.
```

### 2. Update step 4

```markdown
4. Update `engineer-agent.yaml` `outputFormat`: inline the full implementation notes template
   content as a multi-line YAML string under the `### IMPLEMENTATION output` section header.
   The `AgentSpecSchema` has one `outputFormat` field; M5a-001 has already established baseline
   content for both IMPLEMENTATION and CODE_REVIEW columns. Replace ONLY the
   `### IMPLEMENTATION output` section content — do NOT overwrite the CODE_REVIEW section.
```

### 3. Align template path (H1)

Replace all occurrences of `.aeos/templates/impl-notes-template.md` with `.aeos/rubrics/templates/impl-notes-template.md`.

### 4. Expand dependencies

```markdown
## Dependencies
- M5a-001: AEOS-9 complete (`engineer-agent.yaml` exists with baseline `outputFormat`)
- M5a-000: `implementation.yaml` column spec (context for how template is consumed)
- Prerequisite (not yet scheduled): template file resolution mechanism — until built,
  template content must be inlined in agent YAML
- Note: `.aeos/rubrics/templates/` directory not scaffolded by any existing task; create if needed
```

### 5. Add rubric alignment AC (m3) and conditional verification

```markdown
- [ ] If `impl-structure.md` (AEOS-11) exists, every rubric criterion has a corresponding template section
```

### 6. Expand Definition of Done

```markdown
## Definition of Done
- [ ] `impl-notes-template.md` committed at `.aeos/rubrics/templates/impl-notes-template.md` with all required sections
- [ ] `engineer-agent.yaml` `outputFormat` `### IMPLEMENTATION output` section updated with inlined template content
      (CODE_REVIEW section preserved)
- [ ] All acceptance criteria met
```

### 7. Align method header (M1)

```markdown
**Method:** Dogfood — run through AEOS pipeline
```

---

## Summary

| Category | Count |
|----------|-------|
| Critical | 2 |
| Major | 1 |
| Medium | 4 |
| Minor | 4 |
| Cross-task | 3 (2 issues, 1 informational) |

**Overall:** The task correctly identifies the implementation notes template's purpose and defines reasonable sections that largely match the rubric criteria from M5a-003. However, it has NOT absorbed the amendments that were applied to all three prior template task reviews (M3-003, M4-002, M4-004). The same critical issues — `outputFormat` inline-text constraint and shared-field management — exist here. This is particularly important because the amended M5a-001 explicitly sets up the expectation that M5a-002 will update the `### IMPLEMENTATION output` section of a shared `outputFormat` field, but M5a-002 describes a completely different operation ("reference" a file path). The template path divergence (`.aeos/templates/` vs `.aeos/rubrics/templates/`) has been resolved in all three amended sibling tasks but not here, creating an intra-project inconsistency. Two rubric criteria (requirements traceability) lack corresponding template sections, which will cause friction when M5a-003's rubric evaluates artifacts produced from this template. All findings are addressable with task amendments — no code changes required.