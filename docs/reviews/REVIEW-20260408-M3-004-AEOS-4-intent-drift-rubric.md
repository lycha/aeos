# Review: M3-004 — AEOS-4 Intent Drift Rubric

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Task file:** `docs/tasks/M3-004-AEOS-4-intent-drift-rubric.md`
**Cross-referenced against:**
- `docs/03-system-design.md` (System Design v0.3)
- `docs/02-prd.md` (PRD v0.1)
- `docs/05-action-plan-v1.md` (Action Plan)
- Sibling tasks: M3-001 (archived), M3-002, M3-003, M3-000 (archived)
- Column spec tasks: M4-000a, M4-000b, M5a-000, M5b-000, M6-000 (all archived)
- Scaffolding tasks: M2-014 (agents), M2-015 (column specs)
- Source code: `src/infrastructure/spec-loader/schemas.ts`, `src/infrastructure/filesystem/fs-rubric-loader.adapter.ts`, `src/application/ticket-run.use-case.ts`, `src/domain/model/column-spec.ts`

---

## Verdict: APPROVE with findings (2 MEDIUM, 4 LOW)

The task is well-scoped, correctly aligned with the system design's rubric library layout, and produces a critical cross-cutting artifact. The rubric path, format, and placement match both the system design and the implemented codebase. Two medium-severity gaps require attention before implementation; neither is blocking.

---

## 1. Correctness vs System Design

### 1.1 Rubric Path ✅

**Task:** `.aeos/rubrics/drift/intent-drift.md`
**System design §5.3 (Rubric Library):**
```
/rubrics/
  drift/
    intent-drift.md           ← generic drift detection (all columns)
```
**Column spec tasks (M3-000, M4-000a, M4-000b, M5a-000, M5b-000, M6-000):** All reference `rubrics/drift/intent-drift.md` in their `reviewerRubrics` update notes.

All align. The path is relative to `.aeos/` as expected by `FsRubricLoader` (`src/infrastructure/filesystem/fs-rubric-loader.adapter.ts` line 11: `path.join(projectPath, AEOS_DIR, rubricPath)`). ✅

### 1.2 Rubric Role — Pass-2 Drift Detection ✅

**Task:** "a pass-2 rubric the reviewer applies after column-specific rubrics"
**System design §5.4 (Column Spec example):** `pass2_drift: rubrics/drift/intent-drift.md`
**System design §5.5 (Reviewer Prompt Assembly):** "[PASS 2 — DRIFT DETECTION] ... Drift rubric: {contents of rubrics/drift/intent-drift.md}"
**Implemented `ColumnSpecSchema`:** `reviewerRubrics: z.array(z.string()).default([])`

The system design describes a two-pass review model with named keys (`pass1_structure`, `pass2_drift`). The implementation uses a flat array. The task correctly targets the flat array — all rubric paths are injected into reviewer context in order. The pass-1/pass-2 distinction is not enforced by schema but by reviewer prompt assembly convention. ✅

### 1.3 Rubric Content — Drift Detection Criteria ✅

**Task criteria:** "scope creep, misaligned problem statement, answering a different question than asked, omitting the ticket's stated deliverable"
**System design §5.5:** "Evaluate whether the artifact still solves the original problem. Original intent: {ticket title + description from ticket.md}"
**PRD FR-04:** "Worker agent produces an artifact; reviewer agent evaluates it in two passes (structure + drift)"
**PRD FR-23:** "Reviewer agent runs two passes per review cycle: Pass 1 (structure vs rubric), Pass 2 (drift vs ticket intent)"

The four criteria (scope creep, misalignment, wrong question, omission) are a concrete decomposition of the system design's high-level "drift detection" concept. They cover the key failure modes that produce well-formed but wrong artifacts. ✅

### 1.4 PASS/WARN/FAIL Format ✅

**Task:** "named criteria with PASS/WARN/FAIL definitions (same format as `prd-structure.md`)"
**M3-002 (sibling):** Uses the same PASS/WARN/FAIL format.
**System design §5.5/§5.6:** Reviewer outputs INFO/WARNING/BLOCKER.

Same complementary relationship as noted in M3-002 review: rubric defines thresholds (PASS/WARN/FAIL), reviewer maps to finding severities (INFO/WARNING/BLOCKER). No conflict. ✅

### 1.5 Cross-Column Applicability ✅

**Task:** "Add `intent-drift.md` path to `reviewerRubrics` in ALL column specs"
**System design §5.4:** Shows `pass2_drift: rubrics/drift/intent-drift.md` in the product-scoping example.
**System design §5.2 (Agent Roster):** `reviewer-agent` role is ALL columns.

The system design explicitly states intent-drift is applied "in all columns" via the reviewer. ✅

---

## 2. Findings

### ⚠️ MEDIUM (F-1): "ALL column specs" is ambiguous — task must enumerate which specs to update

**Problem:**
The task says "Add `intent-drift.md` path to `reviewerRubrics` in ALL column specs" and the DoD says "Path added to `reviewerRubrics` in all existing column specs." However, there are 7 column spec files scaffolded by M2-015:
- `product-scoping.yaml`
- `architecture-spike.yaml`
- `tech-spec.yaml`
- `implementation.yaml`
- `code-review.yaml`
- `qa.yaml`
- `dod-gate.yaml`

Should `dod-gate.yaml` receive the drift rubric? System design §2.2 shows DoD Gate as "Human approval" — no reviewer agent runs. The `dod-gate.yaml` column spec exists as a placeholder with `workerAgentFile` and `reviewerAgentFile` set to stubs (see M2-015 notes: "DOD_GATE uses human-approval flow (AEOS-20), not agent execution"). Adding a `reviewerRubrics` entry to a column that will never invoke the reviewer agent is harmless but misleading.

Furthermore, `BACKLOG` has no column spec file and no agent execution — this is consistent and correct.

**Impact:** The implementor may blindly add intent-drift to all 7 specs (including dod-gate) or may miss one. Enumeration eliminates ambiguity.

**Recommendation:** Replace "ALL column specs" with an explicit list of the 6 agent-driven column specs: `product-scoping.yaml`, `architecture-spike.yaml`, `tech-spec.yaml`, `implementation.yaml`, `code-review.yaml`, `qa.yaml`. Add a note that `dod-gate.yaml` is excluded because it uses a human-approval flow (no reviewer invocation).

### ⚠️ MEDIUM (F-2): Missing prerequisite — `.aeos/rubrics/drift/` directory not scaffolded

**Problem:**
Same systemic gap identified in M3-002 review F-1 and M3-003 review F-5. No task creates the `.aeos/rubrics/` or `.aeos/rubrics/drift/` directories:
- M2-014 scaffolds `.aeos/agents/` ✅
- M2-015 scaffolds `.aeos/column-specs/` ✅
- **No task scaffolds `.aeos/rubrics/` or its subdirectories** ❌

The task requires writing to `.aeos/rubrics/drift/intent-drift.md`. If the directory does not exist, the file write fails.

**Impact:** Not blocking for manual/dogfood execution (implementor can `mkdir -p`), but fragile for fresh project init. This is the third task (after M3-002 and M3-003) to hit this gap.

**Recommendation:** This task should either:
1. Add step: "Ensure `.aeos/rubrics/drift/` directory exists (create it if it does not)" (tactical — same as M3-002 step 1)
2. Depend on the rubric/template directory scaffolding task recommended in M3-002 review F-1 (strategic)

Option 2 is preferred — a single scaffolding task (M2-017 or similar) covering `rubrics/structure/`, `rubrics/drift/`, and `rubrics/templates/` would resolve this for all M3–M6 rubric and template tasks.

### ℹ️ LOW (F-3): Dependency "M3-001 through M3-003 complete" is overly broad

**Problem:**
The task declares: "M3-001 through M3-003 complete." The intent-drift rubric is a standalone markdown file that defines drift detection criteria. It does not depend on:
- M3-001 (AEOS-1): PM agent spec — the rubric does not reference `pm-agent.yaml`
- M3-003 (AEOS-3): PRD template — the rubric does not reference `prd-template.md`

The only arguable dependency is M3-002 (AEOS-2 / `prd-structure.md`) as a format reference ("same format as `prd-structure.md`"). But format is a convention, not a hard dependency — the PASS/WARN/FAIL format can be described inline without referencing the sibling rubric.

**Impact:** Blocks M3-004 behind three tasks when at most one (M3-002, for format consistency) is a real dependency. Same over-dependency issue identified in M3-002 review F-2.

**Recommendation:** Weaken dependency to: "M3-000 or M2-015: column spec files exist (provides `reviewerRubrics` arrays to update)". Add optional soft dependency: "M3-002 recommended (format consistency reference)". If the sequential ordering is intentional for dogfooding (run AEOS-4 through the pipeline after AEOS-1–3 prove the pipeline works), add a note explaining this.

### ℹ️ LOW (F-4): Method header inconsistent with sibling M3-001

**Task header:** `Agent: prompt-engineering`, `Method: Agentic implementation`
**Action plan §M3:** Lists AEOS-4 as ticket #4 under "Tickets to run through pipeline"
**M3-001 (sibling, archived):** `Agent: —`, `Method: Dogfood — run through AEOS pipeline`
**M3-002 (sibling):** Same inconsistency — noted in M3-002 review F-3
**M3-003 (sibling):** Same inconsistency — noted in M3-003 review F-4

All three active M3 tasks (M3-002, M3-003, M3-004) use `Agent: prompt-engineering` / `Method: Agentic implementation`, while the action plan and M3-001 say these are dogfood pipeline tickets. This is a consistent-within-siblings divergence from the action plan.

**Recommendation:** Either align all M3 tasks to `Method: Dogfood — run through AEOS pipeline` per the action plan, or add a note to the action plan acknowledging that M3 prompt-engineering tasks are run agentically outside the pipeline (with rationale).

### ℹ️ LOW (F-5): "Validate against a hypothetical drifted artifact" — no guidance on what this means practically

**Problem:**
Step 4: "Validate against a hypothetical drifted artifact to confirm at least one criterion FAILs"
AC line 3: "Applied to a hypothetical drifted PRD, at least one criterion FAILs"

The task provides no example of what a "drifted PRD" looks like or what type of drift should be tested. Compare with step 2 which gives four concrete drift types (scope creep, misalignment, wrong question, omission). The validation step should reference at least one of these.

**Impact:** The implementor may produce a superficial validation. Minor — the rubric criteria themselves are well-defined.

**Recommendation:** Add a concrete example: "For example, given a ticket about 'Add dark mode toggle', a drifted PRD that scopes a full theming engine should FAIL the scope creep criterion."

### ℹ️ LOW (F-6): Task does not mention the runtime rubric loading mechanism

**Problem:**
The task says to "Add `intent-drift.md` path to `reviewerRubrics` in ALL column specs" but does not mention how the rubric content is loaded at runtime. The implemented `FsRubricLoader` (`src/infrastructure/filesystem/fs-rubric-loader.adapter.ts`) reads rubric files from `.aeos/{rubricPath}` and injects them into reviewer context via `ticket-run.use-case.ts` lines 179–184. If the rubric file does not exist when `aeos ticket run` is invoked, `FsRubricLoader.load()` returns `null` and the rubric is silently skipped.

**Impact:** If the implementor adds the rubric path to column specs before the rubric file is written, the reviewer will run without drift detection — with no error or warning. This is by design (rubrics are optional per the `null` return), but the task could note it.

**Recommendation:** Add a note: "Until `intent-drift.md` is written to `.aeos/rubrics/drift/intent-drift.md`, the rubric path in column specs will be silently skipped by `FsRubricLoader`. The reviewer will function without drift detection."

---

## 3. File Path Alignment with Hexagonal Scaffold

This task produces a **content file** (`.aeos/rubrics/drift/intent-drift.md`), not source code. No new `src/` files are needed. ✅

Relevant `src/` touchpoints (all already implemented, no changes needed):

| Component | Path | Role |
|-----------|------|------|
| `ColumnSpec` interface | `src/domain/model/column-spec.ts` | `reviewerRubrics: string[]` — stores rubric paths |
| `ColumnSpecSchema` | `src/infrastructure/spec-loader/schemas.ts` | `reviewerRubrics: z.array(z.string()).default([])` — validates |
| `FsRubricLoader` | `src/infrastructure/filesystem/fs-rubric-loader.adapter.ts` | Reads rubric file content from `.aeos/{path}` |
| `TicketRunUseCase` | `src/application/ticket-run.use-case.ts` lines 179–184 | Iterates `columnSpec.reviewerRubrics`, loads via `FsRubricLoader`, injects into reviewer context |

The runtime pipeline is already wired to handle rubric paths in `reviewerRubrics`. Adding `rubrics/drift/intent-drift.md` to column spec YAML files will be picked up automatically. ✅

---

## 4. Consistency with Sibling Tasks

| Sibling | Pattern Match | Notes |
|---------|--------------|-------|
| M3-001 (AEOS-1, archived) | ⚠️ Header format differs | M3-001: `Method: Dogfood`; M3-004: `Method: Agentic implementation` (same gap as M3-002, M3-003) |
| M3-002 (AEOS-2, prd-structure) | ✅ Structure matches | Same rubric format (PASS/WARN/FAIL), same AC style, same directory creation gap |
| M3-003 (AEOS-3, prd-template) | ✅ Structure matches | Consistent format and dependency chain |
| M3-000 (column spec, archived) | ✅ Rubric path consistent | M3-000 notes: update `reviewerRubrics` with `rubrics/drift/intent-drift.md` after AEOS-4 |
| M4-000a (arch-spike column spec) | ✅ Consistent | Notes: "this column will rely on `intent-drift.md` from AEOS-4 once available" |
| M4-000b (tech-spec column spec) | ✅ Consistent | Notes: update `reviewerRubrics` with `rubrics/drift/intent-drift.md` |
| M5a-000 (implementation column spec) | ✅ Consistent | Notes: update `reviewerRubrics` with `rubrics/drift/intent-drift.md` |
| M5b-000 (code-review column spec) | ✅ Consistent | Notes: update `reviewerRubrics` with `rubrics/drift/intent-drift.md` |
| M6-000 (qa column spec) | ✅ Consistent | Notes: update `reviewerRubrics` with `rubrics/drift/intent-drift.md` |

All six column spec tasks consistently reference `rubrics/drift/intent-drift.md` as the drift rubric to be added to `reviewerRubrics` after AEOS-4. The cross-column intent is well-documented and consistent. ✅

**Observation:** Each column spec task independently notes "update `reviewerRubrics` after AEOS-4" — but this task (M3-004) takes ownership of actually performing the update across ALL specs. This creates a single point of responsibility, which is good, but means the column spec tasks' notes are aspirational (they describe what should happen) while M3-004 is the executor. No conflict, but worth noting.

---

## 5. Blocking Gaps

### Will block implementation without action:

**None.** Both medium findings (F-1, F-2) are resolvable at implementation time with minimal effort (enumerate specs, mkdir directory). Neither requires a code change or architectural decision.

### Should be addressed before implementation:

1. **F-1 (MEDIUM):** Enumerate the 6 column specs to update — eliminates ambiguity about `dod-gate.yaml`.
2. **F-2 (MEDIUM):** Ensure `.aeos/rubrics/drift/` exists — add a mkdir step or depend on a scaffolding task.

---

## 6. Cross-Column Spec Consistency Check

The task requires updating `reviewerRubrics` in all column specs. Here is the expected final state of each column spec's `reviewerRubrics` array after all M3–M6 rubric tasks complete:

| Column Spec | Structure Rubric (pass-1) | Drift Rubric (pass-2) | Updated By |
|-------------|--------------------------|----------------------|------------|
| `product-scoping.yaml` | `rubrics/structure/prd-structure.md` (AEOS-2) | `rubrics/drift/intent-drift.md` (AEOS-4) | M3-002 + **M3-004** |
| `architecture-spike.yaml` | _(none in v1)_ | `rubrics/drift/intent-drift.md` (AEOS-4) | **M3-004** only |
| `tech-spec.yaml` | `rubrics/structure/tech-spec-structure.md` (AEOS-7) | `rubrics/drift/intent-drift.md` (AEOS-4) | M4-003 + **M3-004** |
| `implementation.yaml` | `rubrics/structure/implementation-structure.md` (AEOS-11) | `rubrics/drift/intent-drift.md` (AEOS-4) | M5a-003 + **M3-004** |
| `code-review.yaml` | `rubrics/structure/code-structure.md` (AEOS-13) | `rubrics/drift/intent-drift.md` (AEOS-4) | M5b-001 + **M3-004** |
| `qa.yaml` | `rubrics/structure/qa-report-structure.md` (AEOS-18) | `rubrics/drift/intent-drift.md` (AEOS-4) | M6-004 + **M3-004** |
| `dod-gate.yaml` | `rubrics/dod/dod-evaluation.md` (AEOS-19) | _(excluded — human gate)_ | M6-005 only |

**Timing concern:** M3-004 adds `intent-drift.md` to all column specs during M3, but the structure rubrics for M4–M6 columns don't exist yet. This means `architecture-spike.yaml`, `tech-spec.yaml`, `implementation.yaml`, `code-review.yaml`, and `qa.yaml` will have `intent-drift.md` in their `reviewerRubrics` but no structure rubric until their respective tasks complete. This is **correct and by design** — `FsRubricLoader` returns `null` for missing rubric files (silently skipped), and the column spec tasks (M4-000a/b, M5a-000, M5b-000, M6-000) all note that `reviewerRubrics` starts empty and is populated incrementally.

---

## 7. Summary

The task is correctly specified against the system design, the implemented codebase, and the sibling task constellation. The rubric path, format, and cross-column applicability all align. Six findings:

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| F-1 | ⚠️ MEDIUM | "ALL column specs" ambiguous — dod-gate unclear | Enumerate the 6 agent-driven specs explicitly |
| F-2 | ⚠️ MEDIUM | `.aeos/rubrics/drift/` not scaffolded | Add mkdir step or depend on scaffolding task (M2-017) |
| F-3 | ℹ️ LOW | Dependency chain overly broad (M3-001–003) | Weaken to M3-000/M2-015 + optional M3-002 |
| F-4 | ℹ️ LOW | Method header inconsistent with action plan | Align to `Dogfood` or document divergence |
| F-5 | ℹ️ LOW | No concrete drift validation example | Add a one-line example |
| F-6 | ℹ️ LOW | No mention of `FsRubricLoader` silent-skip behaviour | Add note about runtime loading |

No source code changes needed. No hexagonal scaffold impact. Ready to implement after F-1 and F-2 are addressed.