# Review: M4-000a — Architecture Spike Column Spec

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Task file:** `docs/tasks/M4-000a-architecture-spike-column-spec.md`
**Cross-referenced against:**
- `docs/03-system-design.md` (System Design v0.3)
- `docs/02-prd.md` (PRD v0.1)
- `docs/05-action-plan-v1.md` (Action Plan)
- Sibling tasks: M3-000, M4-000b, M4-001 through M4-004, M5a-000, M5b-000, M6-000
- Source code: `src/infrastructure/spec-loader/`, `src/domain/model/`, `src/shared/errors.ts`

---

## Verdict: APPROVE with findings

No blockers. Two medium issues and three minor issues identified.

---

## Critical Issues

_None._

---

## Major Issues

_None._

---

## Medium Issues

### ⚠️ M1: `Blocks` section states M4-001 runs "in PRODUCT_SCOPING" — incorrect column

**Task line 46:** _"M4-001 (AEOS-5): Architect agent spec — needs this column spec to run in PRODUCT_SCOPING"_

AEOS-5 is the architect agent spec. Per M4-001's own task file, this ticket runs through the AEOS pipeline to produce `architect-agent.yaml`. The column spec being created here is for `ARCH_SPIKE`, not `PRODUCT_SCOPING`. If AEOS-5 is a dogfood ticket running through the pipeline from BACKLOG, it would need the PRODUCT_SCOPING column spec (M3-000, already complete) to pass through that column, and the ARCH_SPIKE column spec (this task) to pass through the ARCH_SPIKE column.

The phrasing "needs this column spec to run in PRODUCT_SCOPING" is misleading — it should say "needs this column spec to run in ARCH_SPIKE" or more precisely "needs this column spec when the ticket reaches the ARCH_SPIKE column."

**Recommendation:** Correct the Blocks description to: _"M4-001 (AEOS-5): Architect agent spec — needs this column spec when the ticket reaches the ARCH_SPIKE column"_

### ⚠️ M2: Missing placeholder agent file note (weaker than sibling M3-000)

M3-000 (product-scoping column spec) includes an explicit note: _"Create `.aeos/agents/pm-agent.yaml` as a minimal placeholder (stub executor) before running AEOS-1."_

M4-000a says only: _"Create a placeholder agent file for bootstrapping."_ — without specifying the path (`.aeos/agents/architect-agent.yaml`) or the stub executor approach. Since `YamlColumnSpecLoader` only validates the YAML structure and doesn't resolve `workerAgentFile` at load time, this isn't a blocking gap, but the orchestrator (`ticket-run.use-case.ts`) will attempt to load the agent file via `YamlAgentSpecLoader` at runtime. If the placeholder doesn't exist at `.aeos/agents/architect-agent.yaml`, the run will fail with `AgentSpecNotFoundError`.

**Recommendation:** Match M3-000's level of specificity: _"Create `.aeos/agents/architect-agent.yaml` as a minimal placeholder (stub executor) before running M4-001 (AEOS-5)."_

---

## Minor Issues

### m1: Missing acceptance criterion for `preflight` fields

The acceptance criteria verify `column`, `phase`, and `outputArtifact`, but do not verify that the `preflight` block parses correctly (`enabled: true`, `questionsArtifact: questions.md`). Sibling M3-000 was flagged for the same gap in its review (m1). The Zod schema applies defaults so this is low risk, but adding one AC for `preflight` would be more thorough and consistent with M3-000's updated pattern.

### m2: No note about future `reviewerRubrics` update (weaker than sibling M4-000b)

Sibling M4-000b (tech-spec column spec) specifies exactly which rubrics to add later:
```yaml
reviewerRubrics:
  - rubrics/structure/tech-spec-structure.md
  - rubrics/drift/intent-drift.md
```

M4-000a says _"After the spike structure rubric is produced, add it here"_ — but there is no dedicated "spike structure rubric" ticket in the action plan or task list. AEOS-7 (M4-003) is `tech-spec-structure.md`, not a spike-specific rubric. M4-002 (AEOS-6) produces `spike-template.md` (an output template), not a reviewer rubric.

This means there's an implicit gap: **no task produces a spike-specific structure rubric.** The ARCH_SPIKE column's `reviewerRubrics` will either stay empty permanently or use the intent-drift rubric from AEOS-4 alone. This should be clarified — is the intent to reuse `tech-spec-structure.md` for spikes, create a new spike rubric task, or leave rubrics empty for v1?

### m3: `outputArtifact: spike.md` note references system design with `SAAS-1-spike.md`

The task notes: _"Worker output artifact is `spike.md` per system design Section 2.2 (`SAAS-1-spike.md`)."_

This is correct — Section 2.2 shows `SAAS-1-spike.md` as the Architecture Spike worker output. The `SAAS-1-` prefix is the ticket ID prefix added at runtime; the column spec only defines the suffix (`spike.md`). The note is accurate but could be clearer about why the prefix differs. Low priority — same pattern as M3-000.

---

## Correctness vs System Design

| Field | Task Value | System Design (§5.4) | Code (ColumnSpecSchema) | Verdict |
|-------|-----------|----------------------|------------------------|---------|
| `column` | `ARCH_SPIKE` | `product-scoping` (different column shown in §5.4 example) | `z.string().min(1)` | ✅ Task uses correct Column enum value |
| `phase` | `PREPARE` | §2.1: Architecture Spike is in PREPARE | `z.enum([...]).optional()` | ✅ Match |
| `workerAgentFile` | `agents/architect-agent.yaml` | §5.2: `architect-agent` drives PREPARE | `z.string().min(1)` | ✅ Correct agent for column |
| `reviewerAgentFile` | `agents/reviewer-agent.yaml` | §5.2: one generic `reviewer-agent` | `z.string().min(1)` | ✅ Match |
| `outputArtifact` | `spike.md` | §2.2: `SAAS-1-spike.md` | `z.string().min(1)` | ✅ Correct (prefix added at runtime) |
| `reviewerRubrics` | `[]` | §5.4: `rubrics: {pass1_structure, pass2_drift}` | `z.array(z.string()).default([])` | ✅ Correct for bootstrapping |
| `maxIterations` | `3` | §5.4: `3` | `z.number().int().positive().default(3)` | ✅ Match |
| `escalation` | `escalate_to_human` | §5.4: `escalate_to_human` | `z.enum([...]).default(...)` | ✅ Match |
| `advanceMode` | `manual` | Action plan: v1 is manual-only | `z.enum([...]).default('manual')` | ✅ Match |
| `preflight` | `enabled: true` | §7.2: pre-flight is a system feature | Schema has defaults | ✅ Consistent |

---

## File Path Alignment with Hexagonal Scaffold

| Referenced Path | Exists in `src/` | Notes |
|----------------|-----------------|-------|
| `ColumnSpecSchema` | `src/infrastructure/spec-loader/schemas.ts` | ✅ |
| `YamlColumnSpecLoader` | `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts` | ✅ |
| `ColumnSpecNotFoundError` | `src/shared/errors.ts` | ✅ |
| `Column.ARCH_SPIKE` | `src/domain/model/column.ts` | ✅ (line 6: `ARCH_SPIKE: 'ARCH_SPIKE'`) |
| `ColumnSpec` interface | `src/domain/model/column-spec.ts` | ✅ |
| `ColumnSpecLoader` port | `src/domain/ports/driven/column-spec-loader.port.ts` | ✅ |
| Loader filename mapping | `yaml-column-spec-loader.adapter.ts` line 16 | ✅ `[Column.ARCH_SPIKE]: 'architecture-spike'` |
| Runtime target: `.aeos/column-specs/architecture-spike.yaml` | N/A (runtime file) | ✅ Correct per loader mapping |

All source references resolve correctly. No phantom paths.

---

## Dependency Validation

| Dependency | Status | Verified |
|-----------|--------|----------|
| M2-007: `ColumnSpecSchema` | ✅ complete | `src/infrastructure/spec-loader/schemas.ts` exists with full schema |
| M2-008: `YamlColumnSpecLoader` | ✅ complete | `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts` exists; `ARCH_SPIKE` mapping present |
| M2-013: `reviewer-agent.yaml` | ✅ complete | Task file in archive; code review exists |

No missing dependencies identified. All three claimed dependencies are verified complete.

---

## Consistency with Sibling Tasks

| Sibling | Pattern Match | Notes |
|---------|--------------|-------|
| M3-000 (product-scoping) | ✅ Identical structure | M3-000 has more detailed bootstrapping notes (recommended for M4-000a too — see M2) |
| M4-000b (tech-spec) | ✅ Identical structure | M4-000b has explicit future rubric paths |
| M5a-000 (implementation) | ✅ Identical structure | — |
| M5b-000 (code-review) | ✅ Identical structure | — |
| M6-000 (qa) | ✅ Identical structure | — |

M4-000a follows the established column-spec task pattern. Two areas where it's slightly less detailed than siblings are noted in M2 and m2 above.

---

## Blocking Gaps

No blocking gaps identified. The task can be executed as written. The YAML content will pass `ColumnSpecSchema.parse()` and `YamlColumnSpecLoader.load(Column.ARCH_SPIKE)` based on the implemented code.

The ARCH_SPIKE → `architecture-spike` filename mapping is already present in the loader (line 16 of `yaml-column-spec-loader.adapter.ts`), and the loader test suite includes a specific test for `ARCH_SPIKE` loading (line 62–68 of the test file).

---

## Summary

| Category | Count |
|----------|-------|
| Critical | 0 |
| Major | 0 |
| Medium | 2 |
| Minor | 3 |

**Overall:** Task is well-structured and correctly aligned with both the system design and the implemented codebase. The YAML content matches the `ColumnSpecSchema` exactly — all fields are valid and all defaults are explicitly stated. The two medium findings are: (1) an incorrect column reference in the Blocks section ("PRODUCT_SCOPING" should be "ARCH_SPIKE"), and (2) a less-specific placeholder agent note compared to the M3-000 sibling. The minor m2 finding highlights that no task in the plan produces a spike-specific reviewer rubric, which means `reviewerRubrics` for this column may stay empty unless an additional task is created or an existing rubric is reused.
