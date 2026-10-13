# Review: M5b-000 — Create `code-review.yaml` Column Spec

**Reviewed:** 2026-04-08
**Task file:** `docs/tasks/M5b-000-code-review-column-spec.md`
**Reviewer:** Augment Agent (automated deep review)
**Cross-referenced against:**
- `docs/03-system-design.md` (System Design v0.3)
- `docs/02-prd.md` (PRD v0.1)
- `docs/05-action-plan-v1.md` (Action Plan)
- Sibling tasks: M3-000, M4-000a, M4-000b, M5a-000, M6-000
- Downstream tasks: M5b-001, M5b-002
- Source code: `src/domain/model/`, `src/infrastructure/spec-loader/`, `src/application/services/`

---

## 1. Summary

This task creates `.aeos/column-specs/code-review.yaml`, the column spec file for the CODE_REVIEW column (BUILD phase). It is a manual bootstrapping prerequisite — no pipeline ticket runs in the CODE_REVIEW column without this file. The task follows the same pattern as all five sibling column-spec tasks (M3-000, M4-000a, M4-000b, M5a-000, M6-000).

**Overall verdict:** ✅ PASS — F-2, F-3, I-3 resolved in commit. F-1 (worker agent ambiguity) remains open as a design clarification item.

---

## 2. Correctness vs System Design

### 2.1 Column and Phase

| Field | Task Value | System Design Reference | Verdict |
|-------|-----------|------------------------|---------|
| `column` | `CODE_REVIEW` | §2.1: "Code Review (reviewer)" in BUILD phase | ✅ |
| `phase` | `BUILD` | §2.1: BUILD phase group | ✅ |
| `Column.CODE_REVIEW` enum | — | `src/domain/model/column.ts` line 9 | ✅ exists |

### 2.2 Output Artifact

| Field | Task Value | System Design Reference | Verdict |
|-------|-----------|------------------------|---------|
| `outputArtifact` | `code-review.md` | §2.2: `SAAS-1-code-review.md` (worker output) | ✅ |

The ticket-ID prefix (`SAAS-1-`) is applied at runtime; the column spec only defines the suffix. Consistent with all sibling tasks. Explicitly confirmed by the task's Notes: "Worker output artifact is `code-review.md` per system design Section 2.2."

### 2.3 Agent References

| Field | Task Value | System Design Reference | Verdict |
|-------|-----------|------------------------|---------|
| `workerAgentFile` | `agents/engineer-agent.yaml` | §5.2: `engineer-agent` — worker — BUILD | ⚠️ see F-1 |
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

The `column` field is `z.string().min(1)` — accepts `"CODE_REVIEW"` without restriction. ✅

### 2.6 Loader Filename Mapping

`COLUMN_SPEC_FILENAMES` in `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts` line 19:
```
[Column.CODE_REVIEW]: 'code-review'
```
→ resolves to `.aeos/column-specs/code-review.yaml` ✅

---

## 3. Findings

### ⚠️ MEDIUM (F-1): Worker agent choice ambiguous vs system design

The task assigns `workerAgentFile: agents/engineer-agent.yaml` with the note: "Uses the same `engineer-agent.yaml` as IMPLEMENTATION — the agent's behaviour is shaped by context and column spec, not a separate agent file."

However, the system design §2.1 labels Code Review as "(reviewer)", not "(eng agent)". The column headers read:

```
│  Implement     │    ← (eng agent)
│  Code Review   │    ← (reviewer)
```

This suggests the _reviewer_ agent is the primary actor for CODE_REVIEW, not the engineer agent. Meanwhile, §2.2 does show distinct worker and reviewer outputs for the column (`SAAS-1-code-review.md` and `SAAS-1-code-review-signoff.md`), implying a two-agent model consistent with the task.

The task's note acknowledges the choice may change ("Adjust if a dedicated code-review agent is created"), so this is not blocking. But the ambiguity between §2.1 (reviewer as primary) and §2.2 (separate worker + reviewer) should be resolved in the system design doc before AEOS-13/14 run.

**Recommendation:** Add a design clarification note to the task, or raise an OD (open decision) in the system design doc. If the intent is that the engineer agent runs the code review pass (producing `code-review.md`) and the reviewer agent then signs off (producing `code-review-signoff.md`), this should be stated explicitly in §2.1.

### ~~⚠️ MEDIUM (F-2): Missing preflight acceptance criteria~~ ✅ RESOLVED in commit

The YAML includes `preflight.enabled: true` and `preflight.questionsArtifact: questions.md`, but the acceptance criteria do not verify these fields. The earlier sibling tasks M3-000 and M4-000a/b include:
> Parsed spec has `preflight.enabled: true` and `preflight.questionsArtifact: questions.md`

The updated M5a-000 (post-review) also includes this AC. M6-000 similarly omits it. This is a recurring inconsistency in the later sibling tasks.

**Recommendation:** Add AC: "Parsed spec has `preflight.enabled: true` and `preflight.questionsArtifact: questions.md`" for consistency with M3-000 and M4-000a/b.

### ~~✅ MINOR (F-3): Sibling M5b-001 references `CODE_REVIEW.yaml` (uppercase)~~ ✅ RESOLVED in commit

M5b-001 (AEOS-13) Definition of Done states:
> Added to `CODE_REVIEW.yaml` column spec `reviewerRubrics`

The actual filename is `code-review.yaml` (lowercase, per `COLUMN_SPEC_FILENAMES` mapping). This is in the downstream task, not M5b-000 itself, but noted here for cross-reference completeness.

**Recommendation:** Update M5b-001 DoD to reference `code-review.yaml` (lowercase).


### ℹ️ INFO (I-1): No placeholder agent note needed (unlike M3-000 / M4-000a)

M3-000 and M4-000a include notes about creating placeholder agent YAML files before the first ticket runs. M5b-000 reuses `engineer-agent.yaml`, which is the same agent used by M5a (IMPLEMENTATION). Since M5a precedes M5b in the milestone sequence, the placeholder (or real agent file) will already exist by the time CODE_REVIEW runs. No action needed.

### ℹ️ INFO (I-2): Rubric paths in Notes are consistent with system design

The Notes section lists future rubric paths:
```yaml
reviewerRubrics:
  - rubrics/structure/code-structure.md
  - rubrics/drift/intent-drift.md
```

System design §5.3 lists `code-structure.md` under `structure/`. M5b-001 (AEOS-13) produces this file. The `intent-drift.md` rubric is produced by AEOS-4 (M3-004). Both paths are consistent with the system design and the producing tasks.

### ~~ℹ️ INFO (I-3): Diff injection dependency correctly documented~~ ✅ RESOLVED in commit (stale paths corrected in M5b-002)

The task notes: "This column requires diff injection (AEOS-14) to function fully — the code diff must be available in context." M5b-002 (AEOS-14) specifies that `ContextAssembler` and `PromptBuilder` must be extended. However, M5b-002 internally references stale paths (`src/prompt/context-assembler.ts` and `src/prompt/prompt-builder.ts`). The actual paths are `src/application/services/context-assembler.ts` and `src/application/services/prompt-builder.ts`. This is a finding for M5b-002's review, not M5b-000.

---

## 4. Dependencies Audit

| Dependency | Status | Verified |
|-----------|--------|----------|
| M2-007: `ColumnSpecSchema` | ✅ complete | `src/infrastructure/spec-loader/schemas.ts` exists |
| M2-008: `YamlColumnSpecLoader` | ✅ complete | `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts` exists |
| M2-013: `reviewer-agent.yaml` | ✅ complete | Referenced in archive |

**Missing dependencies:** None. The three listed dependencies are sufficient for this file-creation task.

**Implicit dependency (not blocking):** M5a completion is required before any M5b ticket runs through the pipeline, but M5b-000 is a file-creation task that does not run through the pipeline. The ordering is handled by milestone sequencing.

---

## 5. Blocks Audit

| Blocked Task | Relationship | Correct |
|-------------|-------------|---------|
| M5b-001 (AEOS-13) | Code structure rubric — needs CODE_REVIEW column spec to run | ✅ |
| M5b-002 (AEOS-14) | Diff injection — needs CODE_REVIEW column spec to run | ✅ |

**Missing blocks:** None identified. M5b-001 and M5b-002 are the only two tasks in M5b that depend on this column spec.

---

## 6. File Path Alignment with Hexagonal Scaffold

| Referenced Path | Exists in `src/` | Notes |
|----------------|-----------------|-------|
| `ColumnSpecSchema` | `src/infrastructure/spec-loader/schemas.ts` | ✅ |
| `YamlColumnSpecLoader` | `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts` | ✅ |
| `ColumnSpecNotFoundError` | `src/shared/errors.ts` | ✅ |
| `Column.CODE_REVIEW` | `src/domain/model/column.ts` line 9 | ✅ `CODE_REVIEW: 'CODE_REVIEW'` |
| `ColumnSpec` interface | `src/domain/model/column-spec.ts` | ✅ |
| `ColumnSpecLoader` port | `src/domain/ports/driven/column-spec-loader.port.ts` | ✅ |
| Loader filename mapping | `yaml-column-spec-loader.adapter.ts` line 19 | ✅ `[Column.CODE_REVIEW]: 'code-review'` |

All referenced source paths exist and are consistent with the hexagonal architecture.

**Cross-task scaffold note:** M5b-002 (AEOS-14) references `src/prompt/context-assembler.ts` and `src/prompt/prompt-builder.ts` in its Technical Notes. These do not exist. The actual paths are `src/application/services/context-assembler.ts` and `src/application/services/prompt-builder.ts`. This should be corrected in M5b-002, not M5b-000.

---

## 7. Consistency with Reviewed Sibling Tasks

| Aspect | M3-000 | M4-000a | M4-000b | M5a-000 | **M5b-000** | M6-000 |
|--------|--------|---------|---------|---------|-------------|--------|
| Structure | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| YAML field names | camelCase | camelCase | camelCase | camelCase | camelCase | camelCase |
| Placeholder agent note | ✅ | ✅ | N/A (reuses) | ✅ (post-review) | N/A (reuses eng-agent) | — |
| Preflight AC | ✅ | ✅ | ✅ | ✅ (post-review) | ✅ (post-review) | ❌ missing |
| Runtime smoke AC | ✅ | — | — | ✅ (post-review) | ✅ (post-review) | — |
| Rubric future path | ✅ | ✅ | ✅ | ✅ (post-review) | ✅ | ✅ |
| Dependencies (3) | ✅ | ✅ | ✅ +2 extra | ✅ | ✅ | ✅ |

---

## 8. Gaps That Would Block Implementation

**No blocking gaps.** The task as written can be executed immediately:
1. All source infrastructure exists (`ColumnSpecSchema`, `YamlColumnSpecLoader`, `Column.CODE_REVIEW` enum, filename mapping).
2. The YAML content is schema-valid.
3. Dependencies are complete.
4. The engineer-agent.yaml placeholder/file will exist from M5a (IMPLEMENTATION runs first).

The medium findings (F-1 worker agent ambiguity, F-2 missing preflight AC) are documentation/design-clarity issues that should be addressed but do not block creation of `code-review.yaml` itself.

**Cross-task gaps that would block M5b execution (not M5b-000 specifically):**
- M5b-002 references stale source paths (`src/prompt/` instead of `src/application/services/`). Must be corrected before AEOS-14 implementation.
- M5b-001 references `CODE_REVIEW.yaml` (uppercase) instead of `code-review.yaml`. Must be corrected before AEOS-13 DoD is evaluated.

---

## 9. Recommendations

1. **Fix F-1:** Add a design clarification note explaining the worker agent choice for CODE_REVIEW. Either: (a) update system design §2.1 to label Code Review as "(eng agent + reviewer)" to match §2.2's two-output model, or (b) add a sentence to the task's Notes section explaining that the engineer agent acts as the code reviewer worker while the reviewer agent provides sign-off.
2. **Fix F-2:** Add AC: "Parsed spec has `preflight.enabled: true` and `preflight.questionsArtifact: questions.md`" for consistency with M3-000, M4-000a/b, and M5a-000.
3. **Cross-task fix (F-3):** Update M5b-001 DoD to reference `code-review.yaml` (lowercase).
4. **Cross-task fix (I-3):** Update M5b-002 Technical Notes to use correct paths: `src/application/services/context-assembler.ts` and `src/application/services/prompt-builder.ts`.
