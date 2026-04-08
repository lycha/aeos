# Review: M3-000 — Product Scoping Column Spec

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Task file:** `docs/tasks/M3-000-product-scoping-column-spec.md`
**Cross-referenced against:**
- `docs/03-system-design.md` (System Design v0.3)
- `docs/02-prd.md` (PRD v0.1)
- `docs/05-action-plan-v1.md` (Action Plan)
- Sibling tasks: M3-001 through M3-004, M4-000a, M4-000b, M5a-000, M5b-000, M6-000
- Source code: `src/infrastructure/spec-loader/`, `src/domain/model/`

---

## Verdict: APPROVE with findings

No blockers. Three medium issues and four minor issues identified.

---

## Critical Issues

_None._

---

## Major Issues

_None._

---

## Medium Issues

### ⚠️ M1: `column` value uses `PRODUCT_SCOPING` — correct per code, but contradicts system design doc

**Task YAML:** `column: PRODUCT_SCOPING`
**System design (Section 5.4):** `column: product-scoping`
**Implemented code (test fixture):** `column: 'PRODUCT_SCOPING'` (see `yaml-column-spec-loader.adapter.test.ts` line 16)

The task correctly uses the `PRODUCT_SCOPING` enum value that the implemented code expects (the `ColumnSpecSchema` accepts any non-empty string, and the loader tests assert `PRODUCT_SCOPING`). However, the system design doc at Section 5.4 shows `product-scoping` (kebab-case). This is a known divergence — the system design was written before the Zod schema was implemented, and the code won the argument. The task is correct; the system design doc is stale on this point. No action needed in this task, but the system design doc should be updated for consistency.

### ⚠️ M2: System design uses different field names than implemented schema

The system design (Section 5.4) uses `worker_agent`, `reviewer_agent`, and a `rubrics` object with `pass1_structure` / `pass2_drift` keys. The implemented `ColumnSpecSchema` uses `workerAgentFile`, `reviewerAgentFile`, and a flat `reviewerRubrics` string array. The task correctly uses the **implemented** field names (`workerAgentFile`, `reviewerAgentFile`, `reviewerRubrics`), not the system design names. This is correct behaviour — the task tracks the code, not the stale design doc. Noting for completeness.

### ⚠️ M3: M3-001 (AEOS-1) hints at different column spec values for bootstrapping

M3-001's Technical Notes say: _"Bootstrap it manually with `outputArtifact: pm-agent.yaml`, `minWordCount: 200`, `requiredSections: [systemPrompt, taskInstruction, outputFormat]`"_

But M3-000 specifies `outputArtifact: prd.md`, `minWordCount: 50`, `requiredSections: []`.

These are **two different purposes**: M3-000 defines the long-lived column spec for PRODUCT_SCOPING (output = PRD). M3-001's note describes a temporary bootstrap override where the column is repurposed to produce `pm-agent.yaml` instead. The M3-000 task should note that for the AEOS-1 bootstrapping run, `outputArtifact` and related fields will need temporary overrides, or a second stub column spec is needed. Currently, M3-000 and M3-001 are subtly contradictory without this clarification.

**Recommendation:** Add a note to M3-000 clarifying that the spec as written is the canonical long-lived spec, and that M3-001 may require a temporary override of `outputArtifact`, `minWordCount`, and `requiredSections` for the bootstrapping run.

---

## Minor Issues

### m1: Missing acceptance criterion for `preflight` fields

The acceptance criteria verify `column`, `phase`, and `outputArtifact`, but do not verify that the `preflight` block parses correctly (`enabled: true`, `questionsArtifact: questions.md`). Sibling tasks (M4-000a, M5a-000) also omit this. Low risk since the Zod schema has defaults, but adding one AC would be more thorough.

### m2: No acceptance criterion for `aeos ticket run` actually advancing past pre-flight

AC #4 says: _"`aeos ticket run` no longer fails with `ColumnSpecNotFoundError` for PRODUCT_SCOPING"_. This only tests that the file loads — it does not test that the pre-flight pass or main execution proceed. Acceptable for a bootstrapping task, but worth noting the gap.

### m3: Dependency on M2-013 (`reviewer-agent.yaml`) — path not validated

The spec references `reviewerAgentFile: agents/reviewer-agent.yaml`. The task asserts M2-013 is complete and `reviewer-agent.yaml` exists, but does not specify or validate that it lives at `.aeos/agents/reviewer-agent.yaml`. If M2-013 placed the file elsewhere, the column spec would pass schema validation but fail at runtime when the orchestrator tries to load the agent spec. The existing M2-013 task and its review confirm the path is `.aeos/agents/reviewer-agent.yaml`, so this is a documentation gap, not a real risk.

### m4: `workerAgentFile` bootstrap note could be more explicit

The Notes section says: _"For bootstrapping, use `stub` executor in the agent spec or create a minimal placeholder agent file first."_ This is advice, not an actionable step. A more explicit note would say: _"Create `.aeos/agents/pm-agent.yaml` as a minimal placeholder (stub executor) before running AEOS-1."_ Sibling task M4-000a has the same pattern.

---

## Correctness vs System Design

| Field | Task Value | System Design (§5.4) | Code (ColumnSpecSchema) | Verdict |
|-------|-----------|----------------------|------------------------|---------|
| `column` | `PRODUCT_SCOPING` | `product-scoping` | `z.string().min(1)` | ✅ Task aligns with code convention |
| `phase` | `PLAN` | `PLAN` | `z.enum([...]).optional()` | ✅ Match |
| `workerAgentFile` | `agents/pm-agent.yaml` | `worker_agent: pm-agent` | `z.string().min(1)` | ✅ Task uses implemented field name |
| `reviewerAgentFile` | `agents/reviewer-agent.yaml` | `reviewer_agent: reviewer-agent` | `z.string().min(1)` | ✅ Task uses implemented field name |
| `outputArtifact` | `prd.md` | §2.2: `SAAS-1-prd.md` | `z.string().min(1)` | ✅ Correct (prefix added at runtime) |
| `reviewerRubrics` | `[]` | `rubrics: {pass1_structure, pass2_drift}` | `z.array(z.string()).default([])` | ✅ Correct for bootstrapping; updated after AEOS-2/4 |
| `maxIterations` | `3` | `3` | `z.number().int().positive().default(3)` | ✅ Match |
| `escalation` | `escalate_to_human` | `escalate_to_human` | `z.enum([...]).default(...)` | ✅ Match |
| `advanceMode` | `manual` | `manual` | `z.enum([...]).default('manual')` | ✅ Match |
| `preflight` | `enabled: true` | §7.2: pre-flight is a system feature | Schema has defaults | ✅ Consistent |

---

## File Path Alignment with Hexagonal Scaffold

| Referenced Path | Exists in `src/` | Notes |
|----------------|-----------------|-------|
| `ColumnSpecSchema` | `src/infrastructure/spec-loader/schemas.ts` | ✅ |
| `YamlColumnSpecLoader` | `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts` | ✅ |
| `ColumnSpecNotFoundError` | `src/shared/errors.ts` | ✅ |
| `Column.PRODUCT_SCOPING` | `src/domain/model/column.ts` | ✅ |
| `ColumnSpec` interface | `src/domain/model/column-spec.ts` | ✅ |
| `ColumnSpecLoader` port | `src/domain/ports/driven/column-spec-loader.port.ts` | ✅ (inferred from import) |
| Runtime target: `.aeos/column-specs/product-scoping.yaml` | N/A (runtime file, not in `src/`) | ✅ Correct path per loader |

All source references resolve correctly. No phantom paths.

---

## Dependency Validation

| Dependency | Status | Verified |
|-----------|--------|----------|
| M2-007: `ColumnSpecSchema` | ✅ complete | Exists at `src/infrastructure/spec-loader/schemas.ts` |
| M2-008: `YamlColumnSpecLoader` | ✅ complete | Exists at `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts` |
| M2-013: `reviewer-agent.yaml` | ✅ complete | Task file in archive; review exists |

No missing dependencies identified.

---

## Consistency with Sibling Tasks

| Sibling | Pattern Match | Notes |
|---------|--------------|-------|
| M4-000a (arch-spike column spec) | ✅ Identical structure | Same fields, same defaults, same dependency list |
| M4-000b (tech-spec column spec) | ✅ Identical structure | — |
| M5a-000 (implementation column spec) | ✅ Identical structure | — |
| M5b-000 (code-review column spec) | ✅ Identical structure | — |
| M6-000 (qa column spec) | ✅ Identical structure | — |

M3-000 established the pattern; all siblings follow it. No inconsistencies.

---

## Blocking Gaps

No blocking gaps identified. The task can be executed as written. The YAML content will pass `ColumnSpecSchema.parse()` and `YamlColumnSpecLoader.load(Column.PRODUCT_SCOPING)` based on the implemented code.

The M3 bootstrapping contradiction (M3-000 vs M3-001 `outputArtifact`) is a process clarification issue, not a blocking implementation gap — both tasks can proceed, but the operator needs to understand the temporary override described in M3-001.

---

## Summary

| Category | Count |
|----------|-------|
| Critical | 0 |
| Major | 0 |
| Medium | 3 |
| Minor | 4 |

**Overall:** Task is well-written, correctly aligned with the implemented codebase, and follows the same pattern as all sibling column-spec tasks. The primary finding (M3) is a process clarification between M3-000 and M3-001 regarding bootstrapping overrides. The system design doc field name divergences (M1, M2) are already resolved in code and don't affect this task.
