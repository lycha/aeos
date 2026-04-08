# Review: M3-003 — AEOS-3 PRD Artifact Template

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Task file:** `docs/tasks/M3-003-AEOS-3-prd-template.md`
**Cross-referenced against:**
- `docs/03-system-design.md` (System Design v0.3)
- `docs/02-prd.md` (PRD v0.1)
- `docs/05-action-plan-v1.md` (Action Plan)
- Sibling tasks: M3-001 (archived), M3-002, M3-004, M3-000 (archived), M4-002, M4-004
- Source code: `src/infrastructure/spec-loader/schemas.ts`, `src/application/services/prompt-builder.ts`, `src/domain/model/agent-spec.ts`, `src/infrastructure/spec-loader/yaml-agent-spec-loader.adapter.ts`, `src/infrastructure/filesystem/fs-rubric-loader.adapter.ts`

---

## Verdict: APPROVE WITH CAVEATS — 1 HIGH, 2 MEDIUM, 2 LOW

The task is correctly scoped and the template sections align with the rubric criteria from AEOS-2. However, a critical gap in the `outputFormat` loading mechanism must be resolved before implementation can succeed. The task assumes `pm-agent.yaml` can "reference" a template file, but the implemented `PromptBuilder` treats `outputFormat` as inline text, not a file path.

---

## 1. Correctness vs System Design

### 1.1 Template File Path — ⚠️ MISMATCH

**Task:** `.aeos/templates/prd-template.md`
**System design §5.3 (Rubric Library):**
```
/rubrics/
  templates/
    prd-template.md           ← artifact output template for pm-agent
```

The system design places templates under `rubrics/templates/`, making the canonical path `.aeos/rubrics/templates/prd-template.md`. The task uses `.aeos/templates/prd-template.md` — a different location that puts `templates/` as a top-level directory under `.aeos/`, not nested inside `rubrics/`.

**Sibling consistency:** M4-002 (spike-template) and M4-004 (tech-spec-template) also use `.aeos/templates/`. All template tasks are consistently wrong relative to the system design, but consistent with each other.

**System design §5.1 (pm-agent example):** Shows `output_template: rubrics/templates/prd-template.md` — confirming the system design intends `rubrics/templates/`.

**Impact:** If the implementor follows the task, the template path will diverge from the system design. Any future code that reads templates from `rubrics/templates/` (per system design) will fail.

**Recommendation:** Either:
1. Align all template tasks (M3-003, M4-002, M4-004, M5a-002, M6-003) to use `.aeos/rubrics/templates/` per system design
2. Or acknowledge the divergence and update the system design to show `templates/` as a top-level `.aeos/` directory

Option 1 is recommended — the system design is the authoritative source and other artifacts (column specs, rubric loader) already treat `.aeos/` paths consistently with the system design.

### 1.2 `outputFormat` Field Semantics — 🔴 CRITICAL MISMATCH

**Task step 6:** "Update `pm-agent.yaml` `outputFormat` to reference `prd-template.md`"
**System design §5.1 (pm-agent example):** `output_template: rubrics/templates/prd-template.md`

**Implemented `AgentSpec` interface** (`src/domain/model/agent-spec.ts` line 8):
```typescript
readonly outputFormat: string;
```

**Implemented `PromptBuilder`** (`src/application/services/prompt-builder.ts` line 27):
```typescript
sections.push(`[OUTPUT FORMAT]\n${agentSpec.outputFormat}`);
```

The `outputFormat` field is a **plain string** injected directly into the prompt — not a file path that gets resolved. There is no template file loading mechanism anywhere in the codebase for `outputFormat`. The `buildPrompt()` function does not read files; it interpolates the string value as-is.

The system design uses `output_template` (a file path); the implementation uses `outputFormat` (inline text). The field name changed during M2-007 implementation, but the semantics also changed: the system design intended a path reference, the implementation treats it as literal content.

**Impact:** If the implementor sets `outputFormat: "rubrics/templates/prd-template.md"` in `pm-agent.yaml`, the prompt will literally contain the path string, not the template content. The [OUTPUT FORMAT] section will read:
```
[OUTPUT FORMAT]
rubrics/templates/prd-template.md
```
...which is useless.

**Two viable resolutions:**

1. **Inline the template** — Set `outputFormat` in `pm-agent.yaml` to the full template text (multi-line YAML string). This works immediately with no code changes. Downside: template and agent spec are coupled; changing the template means editing the agent spec.

2. **Build a template resolver** — Add a mechanism (new task) where the orchestrator reads the template file and injects its content into the `outputFormat` field before calling `buildPrompt()`. This matches the system design's intent. Requires code changes to `ticket-run.use-case.ts`.

**Recommendation:** Option 2 is architecturally correct and matches the system design. Create a prerequisite task (e.g., M3-002.5 or M2-018) to implement template file resolution. This task should:
- Add a `TemplateLoader` port (analogous to `RubricLoader`)
- In `ticket-run.use-case.ts`, after loading the agent spec, resolve `outputFormat` if it looks like a file path
- Or add a separate `outputTemplate` field to `AgentSpecSchema` and keep `outputFormat` for inline text

### 1.3 Template Sections vs PRD Content

**Task sections:** Problem Statement, User Personas, Success Metrics, Scope (In/Out), Acceptance Criteria, Out of Scope
**M3-002 rubric criteria:** problem statement clarity, user persona definition, success metrics measurability, scope (in/out), acceptance criteria testability
**System design §5.3:** "required sections, measurable metrics, no ambiguity"

The template sections are a direct match for the rubric criteria. Every criterion in M3-002 has a corresponding template section. ✅

### 1.4 Placeholder Format

**Task:** "Placeholders should be descriptive: `[Describe the problem in 2–3 sentences]`"
**System design §4.4:** `[OUTPUT FORMAT] {artifact template — required sections, format rules}`

The descriptive placeholder convention is sound and aligns with best practice for template-driven prompts. ✅

---

## 2. Dependencies

### 2.1 Declared Dependency: M3-002 (AEOS-2) — ✅ CORRECT

The template must align with `prd-structure.md` rubric criteria. Depending on AEOS-2 completion is correct.

### 2.2 Missing Dependency: M3-001 (AEOS-1) — ⚠️ IMPLICIT

**Task step 6:** "Update `pm-agent.yaml` `outputFormat` to reference `prd-template.md`"

This requires `pm-agent.yaml` to exist. `pm-agent.yaml` is the output of AEOS-1 (M3-001). The task does not list M3-001 as a dependency, but step 6 cannot be completed without it.

**Recommendation:** Add explicit dependency: "M3-001: AEOS-1 complete (`pm-agent.yaml` exists at `.aeos/agents/pm-agent.yaml`)"

### 2.3 Missing Dependency: Template directory scaffolding — ⚠️ UNSATISFIED

Same finding as M3-002 review F-1. No task creates `.aeos/templates/` (or `.aeos/rubrics/templates/`). M2-014 scaffolds `agents/`. M2-015 scaffolds `column-specs/`. Neither scaffolds `templates/` or `rubrics/`.

**Recommendation:** Same as M3-002 review: create a scaffolding task for `rubrics/` and `templates/` directories, or add a mkdir step to this task.

### 2.4 Missing Dependency: `outputFormat` template resolution — 🔴 BLOCKING

Per finding 1.2, there is no mechanism to resolve a file path in `outputFormat` to file content. This must be resolved before this task can achieve its stated goal. See 1.2 for recommendations.

---

## 3. File Path Alignment with Hexagonal Scaffold

This task produces a **content file** (`.aeos/templates/prd-template.md` or `.aeos/rubrics/templates/prd-template.md`), not source code. No new `src/` files are needed for the template itself.

However, if finding 1.2 is resolved via option 2 (template resolver), new source files would be needed:
- `src/domain/ports/driven/template-loader.port.ts` — driven port interface
- `src/infrastructure/filesystem/fs-template-loader.adapter.ts` — filesystem adapter
- Updates to `src/application/ticket-run.use-case.ts` — resolve template before prompt build
- Updates to `src/cli/container.ts` — wire the new adapter

The existing `FsRubricLoader` (`src/infrastructure/filesystem/fs-rubric-loader.adapter.ts`) provides a near-identical pattern: it reads a file path relative to `.aeos/` and returns its content. A `TemplateLoader` could follow the same structure or the `RubricLoader` could be generalised.

---

## 4. Consistency with Sibling Tasks

| Sibling | Pattern Match | Notes |
|---------|--------------|-------|
| M3-001 (AEOS-1, archived) | ⚠️ Header differs | M3-001: `Method: Dogfood`; M3-003: `Method: Agentic implementation` |
| M3-002 (AEOS-2, prd-structure) | ✅ Structure matches | Same format, same AC style. M3-002 reviewed and approved. |
| M3-004 (AEOS-4, intent-drift) | ✅ Structure matches | Consistent format and dependency chain |
| M4-002 (AEOS-6, spike-template) | ✅ Parallel structure | Same `.aeos/templates/` path convention, same "update agent YAML `outputFormat`" pattern |
| M4-004 (AEOS-8, tech-spec-template) | ✅ Parallel structure | Same pattern — confirms the `outputFormat` gap affects ALL template tasks |
| M3-000 (column spec, archived) | ✅ No conflict | Column spec doesn't reference templates directly |

**Cross-task observation:** The `outputFormat` loading gap (finding 1.2) is systemic. It affects M3-003, M4-002, M4-004, M5a-002, and M6-003. Fixing it once — via a template resolution mechanism — resolves all five tasks.

---

## 5. Findings Summary

### 🔴 HIGH (F-1): No `outputFormat` template file resolution mechanism

**Severity:** Blocks implementation of the stated goal.
**Details:** See §1.2. `PromptBuilder` treats `outputFormat` as inline text. No code exists to read a template file and inject its content. Setting `outputFormat` to a file path will produce a broken prompt.
**Resolution required before implementation:** Either (a) inline the full template text in `pm-agent.yaml` `outputFormat` field, or (b) build a template resolver (new prerequisite task).

### ⚠️ MEDIUM (F-2): Template path diverges from system design

**Severity:** Will cause path inconsistency across the project.
**Details:** See §1.1. Task uses `.aeos/templates/`; system design uses `.aeos/rubrics/templates/`. All sibling template tasks share this divergence.
**Recommendation:** Align to `.aeos/rubrics/templates/` per system design §5.3.

### ⚠️ MEDIUM (F-3): Missing implicit dependency on M3-001 (AEOS-1)

**Severity:** Step 6 cannot be completed without `pm-agent.yaml`.
**Details:** See §2.2.
**Recommendation:** Add: `M3-001: AEOS-1 complete (pm-agent.yaml exists)`

### ℹ️ LOW (F-4): Method header inconsistent with action plan and sibling M3-001

**Task header:** `Agent: prompt-engineering`, `Method: Agentic implementation`
**Action plan §M3:** Lists AEOS-3 as a pipeline ticket.
**M3-001:** `Method: Dogfood — run through AEOS pipeline`
**Recommendation:** Align to `Method: Dogfood — run through AEOS pipeline` or explain the divergence.

### ℹ️ LOW (F-5): Template directory not scaffolded

**Details:** See §2.3. Same gap as M3-002 review F-1. No `project init` step creates the `templates/` (or `rubrics/templates/`) directory.
**Recommendation:** Address via the scaffolding task recommended in the M3-002 review.

---

## 6. Blocking Gaps

### Will block implementation without action:

1. **F-1 (HIGH):** `outputFormat` template resolution. Without this, setting `outputFormat` to a file path produces a broken prompt. The implementor must know to either inline the full template text in the YAML or wait for a template resolver to be built.

### Will not block but should be addressed:

2. **F-2 (MEDIUM):** Template path alignment. Wrong path won't cause a runtime error during the task, but creates tech debt and divergence from the system design.
3. **F-3 (MEDIUM):** Missing dependency on M3-001. If AEOS-1 hasn't been completed, step 6 fails.

---

## 7. Recommendations (Prioritised)

1. **Create prerequisite task for template resolution** — New task (M2-018 or M3-002.5) to resolve `outputFormat` file paths to content before prompt building. Pattern: follow `FsRubricLoader`. This unblocks M3-003, M4-002, M4-004, M5a-002, M6-003. Alternatively, decide to inline template content in agent YAML and document this decision.

2. **Align template path to `.aeos/rubrics/templates/`** — Update M3-003, M4-002, M4-004, M5a-002, M6-003 to use the system design's path. Or update the system design if `.aeos/templates/` is preferred.

3. **Add M3-001 as explicit dependency** — The task updates `pm-agent.yaml`, which is produced by AEOS-1.

4. **Align method header** — Change to `Method: Dogfood — run through AEOS pipeline` per action plan.

5. **Scaffold directories** — Ensure `rubrics/templates/` (or `templates/`) is created during `project init` (joint recommendation with M3-002 review).
