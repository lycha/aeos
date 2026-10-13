# Review: M3-002 — AEOS-2 PRD Structure Rubric

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Task file:** `docs/tasks/M3-002-AEOS-2-prd-structure-rubric.md`
**Cross-referenced against:**
- `docs/03-system-design.md` (System Design v0.3)
- `docs/02-prd.md` (PRD v0.1)
- `docs/05-action-plan-v1.md` (Action Plan)
- Sibling tasks: M3-001 (archived), M3-003, M3-004, M3-000 (archived), M2-014, M2-015
- Source code: `src/infrastructure/spec-loader/schemas.ts`, `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts`, `src/infrastructure/filesystem/fs-project.repository.ts`, `src/application/project-init.use-case.ts`

---

## Verdict: APPROVE with findings (2 MEDIUM, 2 LOW)

The task is well-scoped, structurally sound, and correctly aligned with the implemented `ColumnSpecSchema`. It produces the first rubric in the library and correctly targets the `reviewerRubrics` array in `product-scoping.yaml`. Two medium-severity gaps require attention before implementation.

---

## 1. Correctness vs System Design

### 1.1 Rubric Path

**Task:** `.aeos/rubrics/structure/prd-structure.md`
**System design §5.3:** `/rubrics/structure/prd-structure.md` (relative to `.aeos/`)
**M3-000 column spec notes:** `rubrics/structure/prd-structure.md` in `reviewerRubrics` array

All three align. The `.aeos/` prefix is the project-local root; rubric paths in column specs are relative to `.aeos/`. ✅

### 1.2 Column Spec Field Name

**Task:** "Add rubric path to `product-scoping.yaml` column spec under `reviewerRubrics`"
**System design §5.4:** Uses `rubrics:` as a map with named keys (`pass1_structure`, `pass2_drift`)
**Implemented `ColumnSpecSchema`:** `reviewerRubrics: z.array(z.string()).default([])`

The task correctly matches the **implemented** schema (flat array), not the system design's map format. This is a known divergence — the system design is aspirational, the Zod schema is the contract. ✅

### 1.3 Rubric Content Criteria

**Task:** "problem statement clarity, user persona definition, success metrics measurability, scope (in/out), acceptance criteria testability"
**System design §5.3:** "required sections, measurable metrics, no ambiguity"
**PRD §5.2 artifact tree:** PRD produced by PRODUCT_SCOPING column

The criteria in the task are a superset of the system design's high-level description and align with what a PRD should evaluate. ✅

### 1.4 PASS/WARN/FAIL Format

**Task:** "each criterion has a name, description of what PASS/WARN/FAIL looks like"
**System design §5.5 / §5.6:** Reviewer outputs `INFO / WARNING / BLOCKER`

Minor terminology gap: the rubric uses PASS/WARN/FAIL to define criterion thresholds, while the reviewer outputs INFO/WARNING/BLOCKER findings. These are complementary — the rubric defines what each level looks like, the reviewer maps its evaluation to the finding severity. No conflict. ✅

---

## 2. Findings

### ⚠️ MEDIUM (F-1): Missing prerequisite — `.aeos/rubrics/structure/` directory not scaffolded

**Problem:**
The task writes to `.aeos/rubrics/structure/prd-structure.md`, but no task creates the `rubrics/` or `rubrics/structure/` directories. M2-014 scaffolds `.aeos/agents/`. M2-015 scaffolds `.aeos/column-specs/`. Neither scaffolds `.aeos/rubrics/` or `.aeos/templates/`. The `FsProjectRepository` has no `ensureRubricsDir()` method. `ProjectInitUseCase` does not create these directories.

**Impact:**
The implementor must manually `mkdir -p .aeos/rubrics/structure/` or the file write will fail. This is fine for manual/dogfood execution, but fragile — there is no guarantee the directory exists when a fresh project is initialised.

**Recommendation:**
Either:
1. Add a note to this task: "Create `.aeos/rubrics/structure/` directory if it does not exist" (tactical)
2. Create a new task (M2-017 or similar) to scaffold `.aeos/rubrics/` and `.aeos/templates/` during `project init`, analogous to M2-014/M2-015 (strategic — also needed by M3-003, M3-004, M4-003, M5a-003, M5b-001, M6-004, M6-005)

Option 2 is recommended: M3-003 (`.aeos/templates/prd-template.md`) and M3-004 (`.aeos/rubrics/drift/intent-drift.md`) both face the same gap. A single scaffolding task covers all rubric and template tasks across M3–M6.

### ⚠️ MEDIUM (F-2): Dependency on M3-001 (AEOS-1) is unnecessary and may slow delivery

**Problem:**
The task declares: "M3-001: AEOS-1 complete (`pm-agent.yaml` exists)". The rubric defines structural criteria for evaluating PRDs — it does not depend on the PM agent spec. `prd-structure.md` defines what a good PRD looks like regardless of which agent produces it. The PM agent spec (output format, system prompt) is informed *by* the rubric, not the other way around.

The action plan lists AEOS-1 → AEOS-2 → AEOS-3 → AEOS-4 sequentially, but this ordering is not a hard dependency chain. AEOS-2 and AEOS-3 both depend on knowing what a PRD should contain (defined by the system design and PRD), not on the PM agent spec.

**Impact:**
Blocks AEOS-2 behind AEOS-1 unnecessarily. AEOS-1 is the first pipeline ticket and may require iteration. AEOS-2 is a pure content task (write a rubric markdown file) that could be done in parallel.

**Recommendation:**
Weaken the dependency to: "M3-000: `product-scoping.yaml` column spec exists (provides `reviewerRubrics` array to update)". Remove the hard dependency on M3-001/AEOS-1. If the action plan's sequential ordering is intentional for dogfooding reasons (run AEOS-2 *through* the pipeline after AEOS-1 proves the pipeline works), add a note explaining this.

### ℹ️ LOW (F-3): Method says "Agentic implementation" but action plan says dogfood pipeline ticket

**Task header:** `Agent: prompt-engineering`, `Method: Agentic implementation`
**Action plan §M3:** "Tickets to run through pipeline: AEOS-2 — PRD structure rubric"
**M3-001 (sibling):** `Agent: —`, `Method: Dogfood — run through AEOS pipeline`

The action plan explicitly says AEOS-2 is a pipeline ticket. The task header says "Agentic implementation" which is ambiguous — it could mean "run through the pipeline" or "have an agent write it directly outside the pipeline". M3-001 uses clearer language.

**Recommendation:**
Align the header with M3-001's format: `Agent: — (dogfood pipeline ticket)`, `Method: Dogfood — run through AEOS pipeline`. Or if the intent is to write it manually/agentically outside the pipeline, state that explicitly and explain why it diverges from the action plan.

### ℹ️ LOW (F-4): Acceptance criteria missing "validate against hypothetical bad PRD" from step 4

**Task step 4:** "Validate the rubric against a hypothetical bad PRD to confirm it catches issues"
**Acceptance criteria:** No corresponding checkbox.

Step 4 describes a validation step but there is no acceptance criterion to verify it was done. Sibling M3-004 has the same pattern (step 4 validation → AC includes it).

**Recommendation:**
Add: `- [ ] Validated against a hypothetical bad PRD — at least one criterion triggers WARN or FAIL`

---

## 3. File Path Alignment with Hexagonal Scaffold

This task produces a **content file** (`.aeos/rubrics/structure/prd-structure.md`), not source code. No `src/` file paths are referenced or needed. The hexagonal scaffold is not impacted. ✅

The only `src/` interaction is the `reviewerRubrics` field in `ColumnSpecSchema` (`src/infrastructure/spec-loader/schemas.ts` line 14: `reviewerRubrics: z.array(z.string()).default([])`), which already supports the rubric path as a plain string. No schema changes needed. ✅

---

## 4. Consistency with Sibling Tasks

| Sibling | Pattern Match | Notes |
|---------|--------------|-------|
| M3-001 (AEOS-1, archived) | ⚠️ Header format differs | M3-001 uses `Method: Dogfood`; M3-002 uses `Method: Agentic implementation` |
| M3-003 (AEOS-3, prd-template) | ✅ Structure matches | Same AC format, same dependency chain |
| M3-004 (AEOS-4, intent-drift) | ✅ Structure matches | Same rubric format, same PASS/WARN/FAIL convention |
| M3-000 (column spec, archived) | ✅ Rubric path consistent | M3-000 notes say update `reviewerRubrics` after AEOS-2 — this task does exactly that |
| M2-015 (scaffold column specs) | ✅ Supersedes M3-000 | Scaffolds with `reviewerRubrics: []`; this task populates it |

No cross-task conflicts. The M3-002 → M3-003 dependency is correct (template must align with rubric criteria).

---

## 5. Blocking Gaps

### Will block implementation without action:

1. **F-1 (MEDIUM):** `.aeos/rubrics/structure/` directory must exist before the file can be written. Either add a mkdir step to this task or create a scaffolding prerequisite task. **Severity: blocking if implementor doesn't know to create the directory.**

### Will not block but should be addressed:

2. **F-2 (MEDIUM):** Unnecessary dependency on M3-001. Weakening this unblocks parallel work on AEOS-1 and AEOS-2.

---

## 6. Summary

The task is correctly specified against the implemented system. Rubric path, column spec field name, criterion format, and content scope all align with the system design and codebase. Two actionable findings:

- **F-1:** Add rubric/template directory scaffolding (recommend a new M2-017 task covering all M3–M6 rubric/template tasks)
- **F-2:** Weaken dependency from M3-001 to M3-000 (or M2-015) — the rubric doesn't need the PM agent spec

No source code changes are needed for this task. No hexagonal scaffold impact. Ready to implement after F-1 is resolved.
