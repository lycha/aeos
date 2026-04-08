# Review: M4-002 — AEOS-6 Architecture Spike Template (`spike-template.md`)

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Task file:** `docs/tasks/M4-002-AEOS-6-spike-template.md`
**Cross-referenced against:**
- `docs/03-system-design.md` (System Design v0.3)
- `docs/02-prd.md` (PRD v0.1)
- `docs/05-action-plan-v1.md` (Action Plan)
- Sibling tasks: M3-003 (prd-template), M4-001 (architect-agent), M4-003 (tech-spec-rubric), M4-004 (tech-spec-template)
- Column spec reviews: REVIEW-20260408-M4-000a (architecture-spike column spec)
- Prior agent spec review: REVIEW-20260408-M4-001-AEOS-5
- Prior template review: REVIEW-20260408-M3-003-AEOS-3 (prd-template — establishes template task pattern)
- Source code: `src/infrastructure/spec-loader/schemas.ts`, `src/application/services/prompt-builder.ts`, `src/domain/model/agent-spec.ts`

---

## Verdict: APPROVE WITH REQUIRED CHANGES

Two critical issues and two medium issues must be addressed before implementation. The task is correctly scoped in intent but is missing key technical constraints that were surfaced in sibling reviews (M3-003, M4-001) and have not been propagated here.

---

## Critical Issues

### 🔴 C1: `outputFormat` is inline text — task says "reference" a template file

**Task step 4:** _"Update `architect-agent.yaml` `outputFormat` to reference `spike-template.md` for ARCH_SPIKE column."_

**Implemented `PromptBuilder`** (`src/application/services/prompt-builder.ts` line 27):
```typescript
sections.push(`[OUTPUT FORMAT]\n${agentSpec.outputFormat}`);
```

The `outputFormat` field is injected as **literal inline text**, not resolved as a file path. Setting `outputFormat` to `"spike-template.md"` will inject the string `"spike-template.md"` into the prompt — not the file contents.

This exact gap was flagged as 🔴 HIGH (F-1) in the M3-003 review and as 🔴 C2 in the M4-001 review. The M3-003 task was subsequently amended with a prominent implementation note and updated steps. **M4-002 has no such amendment.**

**Impact:** The implementer will either (a) set `outputFormat` to a file path string (broken prompt), or (b) not know to inline the content.

**Recommendation:** Add the same implementation note as M3-003:
> ⚠️ **Implementation note:** The current `PromptBuilder` treats `outputFormat` as inline text, not a file path. The full spike template content must be inlined as a multi-line YAML string in the `architect-agent.yaml` `outputFormat` field. The `.aeos/templates/spike-template.md` file serves as the canonical source but must be manually copied into the YAML until a template resolver is implemented.

Update step 4 to: _"Update `architect-agent.yaml` `outputFormat` to contain the full spike template content inlined as a multi-line YAML string (since `PromptBuilder` treats `outputFormat` as literal text, not a file path)."_

### 🔴 C2: Single `outputFormat` field — cannot set per-column templates independently

**`AgentSpecSchema`** (`src/infrastructure/spec-loader/schemas.ts` line 31):
```typescript
outputFormat: z.string().min(1),
```

The architect agent serves **two columns** (ARCH_SPIKE and TECH_SPEC). There is one `outputFormat` field. This task says "update `outputFormat` for ARCH_SPIKE"; M4-004 (AEOS-8) says "update `outputFormat` for TECH_SPEC". Both tasks target the same single field on the same YAML file.

This was flagged as 🔴 C2 in the M4-001 review. The recommended resolution was to concatenate both templates with section headers (e.g., `### ARCH_SPIKE output` / `### TECH_SPEC output`). M4-001 was amended accordingly but **M4-002 has no acknowledgment of this constraint.**

**Impact:** If AEOS-6 sets `outputFormat` to the spike template only, AEOS-8 will overwrite it with the tech-spec template, losing the spike template. Or vice versa.

**Recommendation:** Update step 4 to acknowledge the concatenation pattern:
> _"Update `architect-agent.yaml` `outputFormat`: inline the spike template content under a `### ARCH_SPIKE output` section header. The `AgentSpecSchema` has a single `outputFormat` field; AEOS-8 will later add a `### TECH_SPEC output` section to the same field. Both templates are concatenated into one multi-line string."_

Update the Definition of Done accordingly.

---

## Major Issues

_None._

---

## Medium Issues

### ⚠️ M1: Template file path diverges from system design

**Task:** `.aeos/templates/spike-template.md`
**System design §5.3 (Rubric Library):**
```
/rubrics/
  templates/
    prd-template.md
    tech-spec-template.md
```

The system design places templates under `rubrics/templates/`, making the canonical path `.aeos/rubrics/templates/spike-template.md`. The task uses `.aeos/templates/` — a top-level directory not defined in the system design.

**Cross-task consistency:** M3-003 (prd-template), M4-004 (tech-spec-template), M5a-002, and M6-003 all use `.aeos/templates/`. All are consistently divergent from the system design but consistent with each other. The M3-003 review (F-2) flagged this and recommended aligning to `.aeos/rubrics/templates/`.

**Recommendation:** Align to `.aeos/rubrics/templates/spike-template.md` per system design. Or, if `.aeos/templates/` is the intended convention, document the divergence in the system design. Apply whichever decision is made consistently across all template tasks.

### ⚠️ M2: No spike-specific structure rubric exists — template sections cannot be validated

**Sibling pattern:** M3-003 (prd-template) validates against `prd-structure.md` (AEOS-2). M4-004 (tech-spec-template) validates against `tech-spec-structure.md` (AEOS-7). These tasks explicitly require template sections to match rubric criteria.

**M4-002:** The task defines 5 sections (Decision Drivers, Options Considered, Tradeoff Analysis, Recommendation, Open Questions) but has **no rubric to validate against**. There is no spike-specific structure rubric task anywhere in the action plan or task list.

**Out of Scope section states:** _"Architecture rubric (not separately defined — covered by tech-spec-structure in AEOS-7)"_ — this is misleading. `tech-spec-structure.md` evaluates tech specs (API contracts, data models, component architecture), not architecture spikes (decision drivers, options, tradeoffs). Using a tech-spec rubric to review spikes would produce false failures.

This was also flagged in the M4-000a review (m2): _"no task produces a spike-specific structure rubric... the ARCH_SPIKE column's `reviewerRubrics` will either stay empty permanently or use the intent-drift rubric from AEOS-4 alone."_

**Impact:** The ARCH_SPIKE column has no structure rubric in its `reviewerRubrics` array. The reviewer will only run the drift pass (AEOS-4), not a structure pass. This is a design gap, not necessarily a blocker for M4-002 itself, but the task should acknowledge it.

**Recommendation:** Either:
1. Create a new task (e.g., AEOS-6.5) for a spike-specific structure rubric that this template's sections align with, or
2. Explicitly document in this task that no spike structure rubric exists by design and the template sections are self-standing, or
3. Add a validation step: _"Verify that the 5 sections, if used as implicit rubric criteria, would produce a reviewer-passable spike artifact."_


---

## Minor Issues

### m1: Method header inconsistent with action plan and sibling M3 tasks

**Task header:** `Method: Agentic implementation`
**Action plan §M4:** _"Method: Dogfood."_ — All M4 tickets are listed as dogfood tickets run through the pipeline.
**Sibling M3 tasks (M3-002, M3-003):** `Method: Dogfood — run through AEOS pipeline`

The M4-001 review (H1) flagged the same mismatch for the architect agent spec. M4-003 and M4-004 also use "Agentic implementation." This has become a consistent pattern for M4 tasks but diverges from the action plan's core principle: _"We use the pipeline to build the pipeline."_

**Impact:** Low — the method header affects the execution approach (pipeline vs direct), not the content produced. If this IS a direct agent invocation (no pipeline), the dependency list is complete. If it should be dogfood, the task needs pipeline-aware steps.

**Recommendation:** Align to `Method: Dogfood — run through AEOS pipeline` per action plan, or document why M4 template/rubric tasks are exempted from dogfooding.

### m2: Dependencies do not list ARCH_SPIKE column spec (M4-000a)

**Task Dependencies:** _"M4-001: AEOS-5 complete (`architect-agent.yaml` exists)"_

If this is a dogfood ticket, it would transit through the pipeline and need column specs. If it's a direct agent task, it still updates `architect-agent.yaml` which is consumed by the ARCH_SPIKE column. The column spec (M4-000a) should be listed as context for understanding how `outputFormat` is consumed.

M4-001's review recommended adding M4-000a and M4-000b as explicit dependencies. The M4-001 task was amended. M4-002 was not updated.

**Recommendation:** Add: _"M4-000a: `architecture-spike.yaml` column spec (provides context for how the template is consumed)"_

### m3: Acceptance criterion does not address the single-field constraint

**AC line 3:** _"`architect-agent.yaml` updated to reference template for ARCH_SPIKE"_

Given C2 above, "reference" is ambiguous. Does "updated" mean the full `outputFormat` is replaced? Or that ARCH_SPIKE content is added under a section header? The AC should specify the expected outcome.

**Recommendation:** Amend to: _"`architect-agent.yaml` `outputFormat` contains the spike template content inlined under a `### ARCH_SPIKE output` section header"_

### m4: Definition of Done duplicates Acceptance Criteria without adding pipeline completion

M3-002 (a dogfood task) has a DoD that includes pipeline sign-off. M4-002's DoD just restates the AC. If this is a dogfood ticket, DoD should include pipeline completion. If it's a direct agent task, the current DoD is sufficient.

---

## Correctness vs System Design

| Aspect | Task | System Design | Verdict |
|--------|------|---------------|---------|
| Artifact name | `spike-template.md` | §5.3: not listed (only prd/tech-spec/impl/qa templates) | ⚠️ Missing from system design — justified by action plan |
| Template path | `.aeos/templates/` | §5.3: `.aeos/rubrics/templates/` | ⚠️ Divergent — see M1 |
| Sections | Decision Drivers, Options Considered, Tradeoff Analysis, Recommendation, Open Questions | §2.2: spike output is `SAAS-1-spike.md` (no sections specified) | ✅ Reasonable for a spike |
| Agent YAML update | `architect-agent.yaml` `outputFormat` | §5.1: `output_template` (file path) | ⚠️ Name/semantics differ — see C1 |
| Template purpose | Output format for ARCH_SPIKE column | §4.4: `[OUTPUT FORMAT] {artifact template}` | ✅ Correct purpose |

**Note:** The system design §5.3 lists templates for prd, tech-spec, implementation-notes, and qa-report — but no spike template. The action plan §M4 explicitly lists AEOS-6 as producing `spike-template.md`. The template is justified by the pipeline architecture (ARCH_SPIKE is a distinct column requiring its own output format), but the system design should be updated to include it.

---

## File Path Alignment with Hexagonal Scaffold

| Referenced Path / Component | Exists in `src/` | Notes |
|----------------------------|-----------------|-------|
| `AgentSpecSchema` | `src/infrastructure/spec-loader/schemas.ts` (line 26) | ✅ |
| `AgentSpec.outputFormat` | `src/domain/model/agent-spec.ts` (line 8) | ✅ Single string field |
| `PromptBuilder` | `src/application/services/prompt-builder.ts` (line 27) | ✅ Inline text injection |
| `YamlAgentSpecLoader` | `src/infrastructure/spec-loader/yaml-agent-spec-loader.adapter.ts` | ✅ |
| Runtime: `.aeos/agents/architect-agent.yaml` | N/A (runtime file) | ✅ Consistent with M4-001 |
| Runtime: `.aeos/templates/spike-template.md` | N/A (runtime file) | ⚠️ Path diverges from system design |

No source code changes required — task produces content files only. No phantom paths in `src/`.

---

## Dependency Validation

| Dependency | Status | Verified |
|-----------|--------|----------|
| M4-001 (AEOS-5): `architect-agent.yaml` | ⬜ Not yet complete | Task file in `docs/tasks/` (not archived). Depends on M3 completion. |
| M4-000a (implicit): `architecture-spike.yaml` | ✅ Complete | Archived; review exists at `REVIEW-20260408-M4-000a` |

**Missing dependencies:**
- Template directory scaffolding (`.aeos/templates/` or `.aeos/rubrics/templates/`) — not created by any existing task. Same gap flagged in M3-002 review (F-1) and M3-003 review (F-5).

---

## Consistency with Sibling Tasks

| Sibling | Pattern Match | Notes |
|---------|--------------|-------|
| M3-003 (prd-template) | ⚠️ Partial | M3-003 amended with `outputFormat` note + inlining guidance. M4-002 lacks these. |
| M4-004 (tech-spec-template) | ✅ Structure match | Same format. M4-004 validates against rubric — M4-002 has no rubric (M2). |
| M4-003 (tech-spec-rubric) | ✅ Structure match | Different artifact type, consistent format. |
| M5a-002 (impl-notes-template) | ✅ Structure match | Same `.aeos/templates/` path convention. |
| M6-003 (qa-report-template) | ✅ Structure match | Same pattern. |

**Key gap vs M3-003:** M3-003 was updated post-review with: (1) ⚠️ implementation note about `outputFormat`, (2) updated steps for inlining, (3) prerequisite dependency note, (4) additional dependency on agent spec. M4-002 has none of these amendments — findings from the M3-003 and M4-001 reviews were not propagated.

---

## Blocking Gaps

Two issues would block a clean implementation:

1. **C1:** The implementer does not know `outputFormat` is inline text, not a file path. Without guidance, they will produce a broken prompt or be confused by the wording.

2. **C2:** The implementer does not know `outputFormat` is a single field shared with AEOS-8. Without the concatenation pattern, either AEOS-6 or AEOS-8 will overwrite the other's template content.

---

## Recommendations Summary

| # | Severity | Finding | Action |
|---|----------|---------|--------|
| C1 | Critical | `outputFormat` is inline text; task says "reference" | Add implementation note; update step 4 to specify inlining |
| C2 | Critical | Single `outputFormat` field shared with AEOS-8 | Add concatenation guidance with section headers |
| M1 | Medium | Template path `.aeos/templates/` ≠ system design `.aeos/rubrics/templates/` | Align or document divergence |
| M2 | Medium | No spike structure rubric; template sections unvalidated | Create rubric task or document as intentional |
| m1 | Minor | Method "Agentic implementation" ≠ action plan "Dogfood" | Align to action plan |
| m2 | Minor | Missing M4-000a dependency | Add to dependencies |
| m3 | Minor | AC ambiguous about single-field constraint | Specify section header pattern |
| m4 | Minor | DoD doesn't include pipeline completion | Expand if method changed to dogfood |

---

## Proposed Amendments

### 1. Add implementation note (after Context section)

```markdown
> **⚠️ Implementation note — `outputFormat` resolution gap:**
> The current `PromptBuilder` treats the `outputFormat` field as inline text, not a file path.
> There is no template file loading mechanism in the codebase. The full spike template content
> must be inlined as a multi-line YAML string in `architect-agent.yaml` `outputFormat` field
> under a `### ARCH_SPIKE output` section header (the field is shared with AEOS-8's
> tech-spec template via concatenation).
```

### 2. Update step 4

```markdown
4. Update `architect-agent.yaml` `outputFormat`: inline the full spike template content as a
   multi-line YAML string under a `### ARCH_SPIKE output` section header. The `AgentSpecSchema`
   has one `outputFormat` field; AEOS-8 will later add a `### TECH_SPEC output` section to
   the same field.
```

### 3. Expand dependencies

```markdown
## Dependencies
- M4-001: AEOS-5 complete (`architect-agent.yaml` exists)
- M4-000a: `architecture-spike.yaml` column spec (context for how template is consumed)
- Prerequisite (not yet scheduled): template file resolution mechanism — until built,
  template content must be inlined in agent YAML
- Note: `.aeos/templates/` directory not scaffolded by any existing task; create if needed
```

### 4. Update Acceptance Criteria

```markdown
- [ ] `spike-template.md` exists at `.aeos/templates/spike-template.md`
- [ ] All 5 sections are present with descriptive placeholders
- [ ] `architect-agent.yaml` `outputFormat` contains the spike template content inlined
      under a `### ARCH_SPIKE output` section header
```

---

## Summary

| Category | Count |
|----------|-------|
| Critical | 2 |
| Major | 0 |
| Medium | 2 |
| Minor | 4 |

**Overall:** The task correctly identifies the spike template's purpose and defines reasonable sections for an architecture spike output format. However, two critical gaps — the `outputFormat` inline-text constraint and the single-field sharing with AEOS-8 — were surfaced in prior sibling reviews (M3-003 F-1, M4-001 C2) but were not propagated to this task. These are addressable with task amendments — no code changes required. The medium finding about the missing spike structure rubric is a design gap that affects the ARCH_SPIKE column's review quality. The `.aeos/templates/` vs `.aeos/rubrics/templates/` path divergence affects all template tasks and should be resolved once, consistently.