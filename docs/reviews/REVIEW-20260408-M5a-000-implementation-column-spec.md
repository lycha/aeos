# Review: M5a-000 — Create `implementation.yaml` Column Spec

**Reviewed:** 2026-04-08
**Task file:** `docs/tasks/M5a-000-implementation-column-spec.md`
**Reviewer:** Augment Agent (automated deep review)

---

## 1. Summary

This task creates `.aeos/column-specs/implementation.yaml`, the column spec file for the IMPLEMENTATION column (BUILD phase). It is a manual bootstrapping prerequisite — no pipeline ticket runs in the IMPLEMENTATION column without this file. The task follows the same pattern as the five sibling column-spec tasks (M3-000, M4-000a, M4-000b, M5b-000, M6-000).

**Overall verdict:** ✅ PASS with 2 medium findings and 3 minor findings.

---

## 2. Correctness vs System Design

### 2.1 Column and Phase

| Field | Task Value | System Design Reference | Verdict |
|-------|-----------|------------------------|---------|
| `column` | `IMPLEMENTATION` | §2.1: "Implement (eng agent)" in BUILD phase | ✅ |
| `phase` | `BUILD` | §2.1: BUILD phase group | ✅ |
| `Column.IMPLEMENTATION` enum | — | `src/domain/model/column.ts` line 8 | ✅ exists |

### 2.2 Output Artifact

| Field | Task Value | System Design Reference | Verdict |
|-------|-----------|------------------------|---------|
| `outputArtifact` | `implementation-notes.md` | §2.2: `SAAS-1-implementation-notes.md` | ✅ |

The ticket-ID prefix (`SAAS-1-`) is applied at runtime; the column spec only defines the suffix. Consistent with all sibling tasks.

### 2.3 Agent References

| Field | Task Value | System Design Reference | Verdict |
|-------|-----------|------------------------|---------|
| `workerAgentFile` | `agents/engineer-agent.yaml` | §5.2: `engineer-agent` — worker — BUILD | ✅ |
| `reviewerAgentFile` | `agents/reviewer-agent.yaml` | §5.2: `reviewer-agent` — reviewer — ALL | ✅ |

### 2.4 Orchestration Fields

| Field | Task Value | System Design Reference | Verdict |
|-------|-----------|------------------------|---------|
| `maxIterations` | `3` | §5.4: `max_iterations: 3` | ✅ |
| `escalation` | `escalate_to_human` | §5.4: `escalation: escalate_to_human` | ✅ |
| `advanceMode` | `manual` | Action plan open decisions: "v1 ships as manual-only" | ✅ |
| `preflight.enabled` | `true` | §7.2: pre-flight pass is a standard feature | ✅ |
| `preflight.questionsArtifact` | `questions.md` | §7.2: `T001-questions.md` (prefix applied at runtime) | ✅ |

### 2.5 Schema Compatibility

All YAML keys use camelCase (`workerAgentFile`, `reviewerAgentFile`, `outputArtifact`, `minWordCount`, `requiredSections`, `reviewerRubrics`, `maxIterations`, `advanceMode`) matching `ColumnSpecSchema` in `src/infrastructure/spec-loader/schemas.ts`. ✅

The `column` field is `z.string().min(1)` — accepts `"IMPLEMENTATION"` without restriction. ✅

### 2.6 Loader Filename Mapping

`COLUMN_SPEC_FILENAMES` in `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts` line 18:
```
[Column.IMPLEMENTATION]: 'implementation'
```
→ resolves to `.aeos/column-specs/implementation.yaml` ✅

---

## 3. Findings

### ⚠️ MEDIUM (F-1): Rubric filename mismatch between M5a-000 and M5a-003

The Notes section of M5a-000 states the future rubric path will be:
```yaml
reviewerRubrics:
  - rubrics/structure/impl-structure.md
```

But M5a-003 (AEOS-11) defines the output artifact as `implementation-structure.md` and its DoD says:
> `implementation-structure.md` committed with ≥ 5 criteria

These names don't match: `impl-structure.md` ≠ `implementation-structure.md`. When AEOS-11 completes and the rubric is added to this column spec, the path must be consistent with the actual filename.

System design §5.3 lists `code-structure.md` for code review but does not define a specific filename for the implementation column's structure rubric, so there is no canonical reference to break the tie.

**Recommendation:** Align on one name. Since M5a-003 is the producing task, update M5a-000 Notes to use `rubrics/structure/implementation-structure.md`.

### ⚠️ MEDIUM (F-2): No mention of placeholder `engineer-agent.yaml`

The sibling task M3-000 explicitly notes:
> Create `.aeos/agents/pm-agent.yaml` as a minimal placeholder (stub executor) before running AEOS-1.

M4-000a similarly notes:
> Create `.aeos/agents/architect-agent.yaml` as a minimal placeholder (stub executor) before running M4-001 (AEOS-5).

M5a-000 makes no mention of creating a placeholder for `engineer-agent.yaml`. The `YamlColumnSpecLoader` only validates the YAML structure — it does not resolve `workerAgentFile` at load time. However, `aeos ticket run` will fail when it tries to load the agent spec if `engineer-agent.yaml` does not exist.

**Recommendation:** Add a note: "Create `.aeos/agents/engineer-agent.yaml` as a minimal placeholder before AEOS-9 runs the IMPLEMENTATION column."

### ✅ MINOR (F-3): Missing preflight acceptance criteria

The YAML includes `preflight.enabled: true` and `preflight.questionsArtifact: questions.md`, but the acceptance criteria do not verify these fields. Sibling tasks M3-000 and M4-000a/b include:
> Parsed spec has `preflight.enabled: true` and `preflight.questionsArtifact: questions.md`

M5b-000 and M6-000 also omit this AC, so this is an inconsistency across the later sibling tasks, not unique to M5a-000.

**Recommendation:** Add AC: "Parsed spec has `preflight.enabled: true` and `preflight.questionsArtifact: questions.md`" for completeness, or document that preflight verification is covered by the schema defaults.

### ✅ MINOR (F-4): Missing `aeos ticket run` smoke AC

M3-000 includes:
> `aeos ticket run` no longer fails with `ColumnSpecNotFoundError` for PRODUCT_SCOPING

M5a-000 does not include an equivalent runtime smoke AC. Not blocking (the `YamlColumnSpecLoader.load()` AC covers the same ground), but would improve parity.

### ✅ MINOR (F-5): AEOS-11 references `IMPLEMENTATION.yaml` (uppercase)

M5a-003 (AEOS-11) DoD says:
> Added to `IMPLEMENTATION.yaml` column spec

The actual filename is `implementation.yaml` (lowercase). This is in the sibling task, not M5a-000 itself, but noted here for cross-reference completeness.

---

## 4. Dependencies Audit

| Dependency | Status | Verified |
|-----------|--------|----------|
| M2-007: `ColumnSpecSchema` | ✅ complete | `src/infrastructure/spec-loader/schemas.ts` exists |
| M2-008: `YamlColumnSpecLoader` | ✅ complete | `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts` exists |
| M2-013: `reviewer-agent.yaml` | ✅ complete | Referenced in archive |

**Missing dependencies:** None. The three listed dependencies are sufficient for this file-creation task.

**Implicit dependency (not blocking):** M4 completion is required before AEOS-9 (M5a-001) can run, but that dependency correctly belongs to M5a-001, not M5a-000.

---

## 5. Blocks Audit

| Blocked Task | Relationship | Correct |
|-------------|-------------|---------|
| M5a-001 (AEOS-9) | Cannot run IMPLEMENTATION column without this spec | ✅ |

**Missing blocks:**
- M5a-002 (AEOS-10), M5a-003 (AEOS-11), M5a-004 (AEOS-12) also transit the IMPLEMENTATION column and therefore also depend on this spec. However, their dependency chains go through M5a-001, so the transitive dependency is correct. No direct block listing required.

---

## 6. File Path Alignment with Hexagonal Scaffold

| Referenced Path | Exists in `src/` | Notes |
|----------------|-----------------|-------|
| `ColumnSpecSchema` | `src/infrastructure/spec-loader/schemas.ts` | ✅ |
| `YamlColumnSpecLoader` | `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts` | ✅ |
| `ColumnSpecNotFoundError` | `src/shared/errors.ts` line 24 | ✅ |
| `Column.IMPLEMENTATION` | `src/domain/model/column.ts` line 8 | ✅ |
| `ColumnSpec` interface | `src/domain/model/column-spec.ts` | ✅ |
| `ColumnSpecLoader` port | `src/domain/ports/driven/column-spec-loader.port.ts` | ✅ |
| Loader filename mapping | `yaml-column-spec-loader.adapter.ts` line 18 | ✅ `[Column.IMPLEMENTATION]: 'implementation'` |

All referenced source paths exist and are consistent with the hexagonal architecture.

---

## 7. Consistency with Reviewed Sibling Tasks

| Aspect | M3-000 | M4-000a | M4-000b | **M5a-000** | M5b-000 | M6-000 |
|--------|--------|---------|---------|-------------|---------|--------|
| Structure | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| YAML field names | camelCase | camelCase | camelCase | camelCase | camelCase | camelCase |
| Placeholder note | ✅ | ✅ | N/A (reuses) | ❌ **missing** | N/A (reuses) | — |
| Preflight AC | ✅ | ✅ | ✅ | ❌ missing | ❌ missing | ❌ missing |
| Runtime smoke AC | ✅ | — | — | ❌ missing | — | — |
| Rubric future path | ✅ consistent | ✅ consistent | ✅ consistent | ⚠️ **mismatch** | ✅ consistent | ✅ consistent |
| Dependencies (3) | ✅ | ✅ | ✅ +2 extra | ✅ | ✅ | ✅ |

---

## 8. Gaps That Would Block Implementation

**No blocking gaps.** The task as written can be executed immediately:
1. All source infrastructure exists (`ColumnSpecSchema`, `YamlColumnSpecLoader`, `Column.IMPLEMENTATION` enum, filename mapping).
2. The YAML content is schema-valid.
3. Dependencies are complete.

The medium findings (F-1 rubric name, F-2 placeholder note) are correctness/documentation issues that should be fixed before AEOS-9 runs but do not block creation of `implementation.yaml` itself.

---

## 9. Recommendations

1. **Fix F-1:** Update Notes section rubric path from `impl-structure.md` to `implementation-structure.md` to match M5a-003 output.
2. **Fix F-2:** Add placeholder note: "Create `.aeos/agents/engineer-agent.yaml` as a minimal placeholder before AEOS-9 runs."
3. **Optional (F-3):** Add preflight AC for consistency with M3-000/M4-000a/b.
4. **Optional (F-4):** Add runtime smoke AC: "`aeos ticket run` no longer fails with `ColumnSpecNotFoundError` for IMPLEMENTATION."
5. **Cross-task fix (F-5):** Update M5a-003 DoD to reference `implementation.yaml` (lowercase).
