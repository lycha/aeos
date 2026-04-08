# Review: M6-000 — Create `qa.yaml` Column Spec

**Reviewed:** 2026-04-08
**Task file:** `docs/tasks/M6-000-qa-column-spec.md`
**Reviewer:** Augment Agent (automated deep review)
**Cross-referenced against:**
- `docs/03-system-design.md` (System Design v0.3)
- `docs/02-prd.md` (PRD v0.1)
- `docs/05-action-plan-v1.md` (Action Plan)
- Sibling tasks: M3-000, M4-000a, M4-000b, M5a-000, M5b-000
- Downstream tasks: M6-001 through M6-006
- Source code: `src/domain/model/`, `src/infrastructure/spec-loader/`

---

## 1. Summary

This task creates `.aeos/column-specs/qa.yaml`, the column spec file for the QA column (DEPLOY phase). It is a manual bootstrapping prerequisite — no ticket runs in the QA column without this file. The task follows the same pattern as all five sibling column-spec tasks (M3-000, M4-000a, M4-000b, M5a-000, M5b-000).

**Overall verdict:** ✅ PASS with 3 medium findings, 1 minor finding, and 4 informational notes.

---

## 2. Correctness vs System Design

### 2.1 Column and Phase

| Field | Task Value | System Design Reference | Verdict |
|-------|-----------|------------------------|---------|
| `column` | `QA` | §2.1: "QA (qa agent)" in DEPLOY phase | ✅ |
| `phase` | `DEPLOY` | §2.1: DEPLOY phase group | ✅ |
| `Column.QA` enum | — | `src/domain/model/column.ts` line 10: `QA: 'QA'` | ✅ |

### 2.2 Output Artifact

| Field | Task Value | System Design Reference | Verdict |
|-------|-----------|------------------------|---------|
| `outputArtifact` | `qa-report.md` | §2.2: `SAAS-1-qa-report.md` (worker output) | ✅ |

The ticket-ID prefix (`SAAS-1-`) is applied at runtime; the column spec only defines the suffix. Consistent with all sibling tasks. Explicitly confirmed by the task's Notes: "Worker output artifact is `qa-report.md` per system design Section 2.2."

### 2.3 Agent References

| Field | Task Value | System Design Reference | Verdict |
|-------|-----------|------------------------|---------|
| `workerAgentFile` | `agents/qa-agent.yaml` | §5.2: `qa-agent` — worker — DEPLOY | ✅ |
| `reviewerAgentFile` | `agents/reviewer-agent.yaml` | §5.2: `reviewer-agent` — reviewer — ALL | ✅ |

### 2.4 Orchestration Fields

| Field | Task Value | System Design Reference | Verdict |
|-------|-----------|------------------------|---------|
| `maxIterations` | `3` | §5.4: `max_iterations: 3` | ✅ |
| `escalation` | `escalate_to_human` | §5.4: `escalation: escalate_to_human` | ✅ |
| `advanceMode` | `manual` | Action plan open decisions: "v1 ships as manual-only" | ✅ |
| `minWordCount` | `50` | Schema default | ✅ |
| `preflight.enabled` | `true` | §7.2: pre-flight pass is a standard feature | ✅ |
| `preflight.questionsArtifact` | `questions.md` | §7.2: `T001-questions.md` (prefix applied at runtime) | ✅ |

### 2.5 Schema Compatibility

All YAML keys use camelCase (`workerAgentFile`, `reviewerAgentFile`, `outputArtifact`, `minWordCount`, `requiredSections`, `reviewerRubrics`, `maxIterations`, `advanceMode`) matching `ColumnSpecSchema` in `src/infrastructure/spec-loader/schemas.ts`. ✅

The `column` field is `z.string().min(1)` — accepts `"QA"` without restriction. ✅

### 2.6 Loader Filename Mapping

`COLUMN_SPEC_FILENAMES` in `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts` line 20:
```
[Column.QA]: 'qa'
```
→ resolves to `.aeos/column-specs/qa.yaml` ✅

---

## 3. Findings

### ⚠️ MEDIUM (F-1): Missing preflight acceptance criteria

The YAML includes `preflight.enabled: true` and `preflight.questionsArtifact: questions.md`, but the acceptance criteria do not verify these fields. Sibling tasks M3-000, M4-000a, M4-000b, and M5a-000 (post-review) all include:
> Parsed spec has `preflight.enabled: true` and `preflight.questionsArtifact: questions.md`

M5b-000 has the same omission (flagged as F-2 in its review). This is a recurring inconsistency in later sibling tasks.

**Recommendation:** Add AC: "Parsed spec has `preflight.enabled: true` and `preflight.questionsArtifact: questions.md`" for consistency.

### ⚠️ MEDIUM (F-2): Missing placeholder agent note for `qa-agent.yaml`

Sibling tasks M3-000 (pm-agent), M4-000a (architect-agent), and M5a-000 (engineer-agent) all include explicit instructions to create a minimal placeholder agent YAML file before the first pipeline ticket runs in that column. For example, M3-000 states:
> Create `.aeos/agents/pm-agent.yaml` as a minimal placeholder (stub executor) before running AEOS-1.

M6-000 notes that `workerAgentFile` references `qa-agent.yaml` — "the output of AEOS-16" — but does not instruct the operator to create a placeholder. When a ticket first enters the QA column, `aeos ticket run` will attempt to load `qa-agent.yaml` via `YamlAgentSpecLoader`. If the file doesn't exist, the run will fail.

M5b-000 omits this note because it reuses `engineer-agent.yaml` (already created by M5a). M6-000 introduces a new agent file (`qa-agent.yaml`) and should include the placeholder instruction.

**Recommendation:** Add a note: "Create `.aeos/agents/qa-agent.yaml` as a minimal placeholder (stub executor) before the first ticket enters the QA column."

### ⚠️ MEDIUM (F-3): Blocks section lists M6-003 (AEOS-17) as directly blocked — should be transitive only

The task lists two blocks:
- M6-002 (AEOS-16): QA agent spec ✅ correct — AEOS-16 produces `qa-agent.yaml` referenced by this spec
- M6-003 (AEOS-17): QA report template ⚠️ questionable

M6-003 (AEOS-17) depends on M6-002 (AEOS-16), not on M6-000 directly. AEOS-17 is a dogfood pipeline ticket that runs through the normal pipeline columns (BACKLOG → PRODUCT_SCOPING → ... → CODE_REVIEW). It does not run in the QA column and therefore does not need `qa.yaml` to exist. The blocking relationship is transitive (M6-000 → M6-002 → M6-003), not direct.

No sibling task lists transitive blocks. For example, M3-000 blocks M3-001 (AEOS-1) only, not M3-002 through M3-004 (which depend on M3-001, not M3-000).

**Recommendation:** Remove M6-003 from the Blocks section. The transitive dependency is already captured by M6-003's own Dependencies section listing M6-002.

### ✅ MINOR (F-4): Downstream task M6-004 references `QA.yaml` (uppercase)

M6-004 (AEOS-18 — QA structure rubric) Definition of Done states:
> Added to `QA.yaml` column spec `reviewerRubrics`

The actual filename is `qa.yaml` (lowercase), per the `COLUMN_SPEC_FILENAMES` mapping: `[Column.QA]: 'qa'`. This is the same pattern as M5b-001 referencing `CODE_REVIEW.yaml` instead of `code-review.yaml` (flagged as F-3 in the M5b-000 review).

**Recommendation:** Update M6-004 DoD to reference `qa.yaml` (lowercase).

---

## 4. Dependencies Audit

| Dependency | Status | Verified |
|-----------|--------|----------|
| M2-007: `ColumnSpecSchema` | ✅ complete | `src/infrastructure/spec-loader/schemas.ts` exists |
| M2-008: `YamlColumnSpecLoader` | ✅ complete | `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts` exists |
| M2-013: `reviewer-agent.yaml` | ✅ complete | Referenced in archive |

**Missing dependencies:** None. The three listed dependencies are sufficient for this file-creation task.

**Considered and rejected — M6-001 (AEOS-15) as dependency:** The action plan states "Before running M6 tickets, complete the DEPLOY column design (DoD Gate human approval UX, QA agent context scope)." However, the column spec is structural configuration (agent paths, artifact names, orchestration settings) — not design-dependent. The design decisions from AEOS-15 affect the agent spec (AEOS-16), report template (AEOS-17), and rubrics (AEOS-18/19), not the column spec file. M6-000 can be executed before AEOS-15 without risk.

---

## 5. Blocks Audit

| Blocked Task | Relationship | Correct |
|-------------|-------------|---------|
| M6-002 (AEOS-16) | QA agent spec — needs QA column spec to validate integration | ✅ |
| M6-003 (AEOS-17) | QA report template — transitive via M6-002 | ⚠️ see F-3 |

**Missing blocks:** None identified beyond the F-3 correction. M6-001 (AEOS-15) is a design ticket that runs through earlier pipeline columns, not the QA column — it does not need this spec.

---

## 6. File Path Alignment with Hexagonal Scaffold

| Referenced Path | Exists in `src/` | Notes |
|----------------|-----------------|-------|
| `ColumnSpecSchema` | `src/infrastructure/spec-loader/schemas.ts` | ✅ |
| `YamlColumnSpecLoader` | `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts` | ✅ |
| `ColumnSpecNotFoundError` | `src/shared/errors.ts` | ✅ |
| `Column.QA` | `src/domain/model/column.ts` line 10 | ✅ `QA: 'QA'` |
| `ColumnSpec` interface | `src/domain/model/column-spec.ts` | ✅ |
| `ColumnSpecLoader` port | `src/domain/ports/driven/column-spec-loader.port.ts` | ✅ |
| Loader filename mapping | `yaml-column-spec-loader.adapter.ts` line 20 | ✅ `[Column.QA]: 'qa'` |

All referenced source paths exist and are consistent with the hexagonal architecture.

---

## 7. Consistency with Reviewed Sibling Tasks

| Aspect | M3-000 | M4-000a | M4-000b | M5a-000 | M5b-000 | **M6-000** |
|--------|--------|---------|---------|---------|---------|------------|
| Structure | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| YAML field names | camelCase | camelCase | camelCase | camelCase | camelCase | camelCase |
| Placeholder agent note | ✅ | ✅ | N/A (reuses) | ✅ | N/A (reuses) | ❌ **missing** (F-2) |
| Preflight AC | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ **missing** (F-1) |
| Runtime smoke AC | ✅ | — | — | ✅ | ❌ | ❌ missing |
| Rubric future path | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Dependencies (3) | ✅ | ✅ | ✅ +2 | ✅ | ✅ | ✅ |

**Runtime smoke AC note:** M3-000 and M5a-000 include: "`aeos ticket run` no longer fails with `ColumnSpecNotFoundError` for [column]". M6-000 omits this. Not a blocking gap — the loader unit tests cover this — but adds consistency.

---

## 8. Gaps That Would Block Implementation

**No blocking gaps.** The task as written can be executed immediately:
1. All source infrastructure exists (`ColumnSpecSchema`, `YamlColumnSpecLoader`, `Column.QA` enum, filename mapping).
2. The YAML content is schema-valid.
3. Dependencies are complete.

**Cross-milestone gap (informational — does not block M6-000):**

### ℹ️ INFO (I-1): No `DOD_GATE` column spec task exists

The `COLUMN_SPEC_FILENAMES` map in `yaml-column-spec-loader.adapter.ts` does not include `Column.DOD_GATE`. The loader test confirms `DOD_GATE` throws `ColumnSpecNotFoundError`. Yet M6-005 (AEOS-19) and M6-006 (AEOS-20) reference `DOD_GATE.yaml` in their DoD:
- M6-005: "Added to `DOD_GATE.yaml` column spec `reviewerRubrics`"
- M6-006: implements `aeos ticket dod-approve` which may need a column spec

There is no `M6-000b-dod-gate-column-spec.md` task, and no loader mapping to create. If DOD_GATE is human-only (like BACKLOG), it may not need a column spec — but then M6-005's DoD is incorrect. If DOD_GATE does need a column spec, a new task and loader mapping are required.

**Recommendation:** Decide whether DOD_GATE needs a column spec. If yes, create `M6-000b-dod-gate-column-spec.md` and add `[Column.DOD_GATE]: 'dod-gate'` to the loader mapping. If no, update M6-005 DoD to remove the `DOD_GATE.yaml` reference and clarify where the DoD rubric is configured.

### ℹ️ INFO (I-2): AEOS-15 design may alter this spec

The action plan explicitly states: "Before running M6 tickets, complete the DEPLOY column design." If AEOS-15 produces design decisions that affect the column spec (e.g., different preflight behaviour for QA, different escalation strategy), M6-000 may need revision after AEOS-15 completes. This is acceptable — column specs are mutable files — but the operator should be aware.

### ℹ️ INFO (I-3): Rubric paths in Notes are consistent with system design

The Notes section lists future rubric paths:
```yaml
reviewerRubrics:
  - rubrics/structure/qa-report-structure.md
  - rubrics/drift/intent-drift.md
```

System design §5.3 lists `qa-report-structure.md` under `structure/` and `intent-drift.md` under `drift/`. M6-004 (AEOS-18) produces the structure rubric. M3-004 (AEOS-4) produces the drift rubric. Both paths are consistent.

### ℹ️ INFO (I-4): System design §5.2 agent roster alignment

System design §5.2 describes the QA agent as: "`qa-agent` | worker | DEPLOY | Writes and runs automated tests". The task's context describes the QA agent as reading "implementation notes and code review artifacts and produces a QA report." M6-002 (AEOS-16) refines this to "identifies: uncovered edge cases, missing error handling tests, integration gaps, any spec deviation found in code review." The system design description ("writes and runs automated tests") is more aspirational than what the v1 QA agent actually does (produces a report). This is a system design documentation gap, not an M6-000 problem.

---

## 9. Recommendations

1. **Fix F-1:** Add AC: "Parsed spec has `preflight.enabled: true` and `preflight.questionsArtifact: questions.md`" for consistency with M3-000, M4-000a/b, and M5a-000.
2. **Fix F-2:** Add a note to the Notes section: "Create `.aeos/agents/qa-agent.yaml` as a minimal placeholder (stub executor) before the first ticket enters the QA column." This mirrors the pattern in M3-000, M4-000a, and M5a-000.
3. **Fix F-3:** Remove M6-003 (AEOS-17) from the Blocks section. It is transitively blocked via M6-002, not directly by M6-000.
4. **Cross-task fix (F-4):** Update M6-004 (AEOS-18) DoD to reference `qa.yaml` (lowercase) instead of `QA.yaml`.
5. **Cross-milestone (I-1):** Decide on DOD_GATE column spec — create a new task or update M6-005/M6-006 to remove references to `DOD_GATE.yaml`.
6. **Optional consistency:** Add runtime smoke AC: "`aeos ticket run` no longer fails with `ColumnSpecNotFoundError` for QA" (matches M3-000, M5a-000).