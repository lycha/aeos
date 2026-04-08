# Review: M4-000b — Tech Spec Column Spec

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Task file:** `docs/tasks/M4-000b-tech-spec-column-spec.md`
**Cross-referenced against:**
- `docs/03-system-design.md` (System Design v0.3)
- `docs/02-prd.md` (PRD v0.1)
- `docs/05-action-plan-v1.md` (Action Plan)
- Sibling tasks: M3-000, M4-000a, M4-001 through M4-004, M5a-000, M5b-000, M6-000
- Source code: `src/infrastructure/spec-loader/`, `src/domain/model/`, `src/shared/errors.ts`

---

## Verdict: APPROVE with findings

No blockers. One medium issue and three minor issues identified.

---

## Critical Issues

_None._

---

## Major Issues

_None._

---

## Medium Issues

### ⚠️ M1: Missing dependency on M4-000a (architecture-spike column spec)

**Task Dependencies section** lists M2-007, M2-008, M2-013, and M4-001 (AEOS-5). It does not list M4-000a (architecture-spike column spec). However, M4-001 (AEOS-5) is a dogfood pipeline ticket that must transit through both the PRODUCT_SCOPING and ARCH_SPIKE columns before reaching TECH_SPEC. The ARCH_SPIKE column requires M4-000a's `architecture-spike.yaml` to exist. Therefore M4-000a is an implicit transitive dependency of this task's blocking chain:

- M4-000b blocks M4-004 (AEOS-8)
- M4-004 depends on M4-003 (AEOS-7)
- M4-003 depends on M4-001 (AEOS-5)
- M4-001 (dogfood ticket) transits through ARCH_SPIKE → requires M4-000a

Since M4-000a and M4-000b are both manual bootstrapping tasks with no ordering dependency between themselves, this is not blocking — both can be created in parallel. However, the dependency list is incomplete and could confuse an implementer who creates `tech-spec.yaml` but not `architecture-spike.yaml`, then wonders why AEOS-5 fails at ARCH_SPIKE.

**Recommendation:** Add to Dependencies: `M4-000a: architecture-spike column spec (implicit — AEOS-5 transits ARCH_SPIKE before reaching TECH_SPEC)`

---

## Minor Issues

### m1: Missing acceptance criterion for `preflight` fields

The acceptance criteria verify `column: TECH_SPEC`, `phase: PREPARE`, and `outputArtifact: tech-spec.md`, but do not verify that the `preflight` block parses correctly (`enabled: true`, `questionsArtifact: questions.md`). Sibling M3-000 includes this AC (line 46), and sibling M4-000a's review (m1) flagged the same gap. The Zod schema applies defaults so this is low risk, but adding one AC for `preflight` would be more thorough and consistent with M3-000.

**Recommendation:** Add AC: `Parsed spec has preflight.enabled: true and preflight.questionsArtifact: questions.md`

### m2: Missing placeholder agent file note (weaker than sibling M3-000)

M3-000 (product-scoping column spec, line 31) includes an explicit note: _"Create `.aeos/agents/pm-agent.yaml` as a minimal placeholder (stub executor) before running AEOS-1."_

M4-000b says only (line 31): _"Same `workerAgentFile` as ARCH_SPIKE — the architect agent handles both columns."_ — without noting that `architect-agent.yaml` must exist at `.aeos/agents/architect-agent.yaml` before `aeos ticket run` will succeed for TECH_SPEC tickets. The `YamlColumnSpecLoader` validates the YAML structure but does not resolve `workerAgentFile` at load time; however, the orchestrator (`ticket-run.use-case.ts`) will attempt to load the agent file via `YamlAgentSpecLoader` at runtime. If the file doesn't exist, the run fails with `AgentSpecNotFoundError`.

Since M4-000a's review (M2) already flagged this for the ARCH_SPIKE sibling and the placeholder only needs to be created once (same agent file for both columns), this is lower severity here. But the task should still mention that the agent file is shared and must already exist.

**Recommendation:** Add note: _"The architect agent placeholder at `.aeos/agents/architect-agent.yaml` must exist before any TECH_SPEC column run. If M4-000a has already been executed, the placeholder will already be in place."_

### m3: `Blocks` section is narrow — does not mention M4-003 (AEOS-7)

The Blocks section says only: _"M4-004 (AEOS-8): Tech spec template — needs this column spec for tech spec column runs."_

M4-003 (AEOS-7, tech spec structure rubric) is also a dogfood ticket that will transit through the TECH_SPEC column and therefore also needs this column spec. The action plan (M4) lists AEOS-7 and AEOS-8 at the same level, and M4-003's Definition of Done includes _"Added to `TECH_SPEC.yaml` column spec `reviewerRubrics`"_ — which directly references the file this task creates.

**Recommendation:** Expand Blocks to include: `M4-003 (AEOS-7): Tech spec rubric — also transits TECH_SPEC and updates this column spec's reviewerRubrics`

---

## Correctness vs System Design

| Field | Task Value | System Design (§5.4 / §2.2) | Code (ColumnSpecSchema) | Verdict |
|-------|-----------|------------------------------|------------------------|---------|
| `column` | `TECH_SPEC` | §5.4 example shows `product-scoping` (different column); §2.1 lists Tech Spec in PREPARE | `z.string().min(1)` | ✅ Task uses correct Column enum value |
| `phase` | `PREPARE` | §2.1: Tech Spec is in PREPARE | `z.enum([...]).optional()` | ✅ Match |
| `workerAgentFile` | `agents/architect-agent.yaml` | §5.2: `architect-agent` drives PREPARE | `z.string().min(1)` | ✅ Correct agent for column |
| `reviewerAgentFile` | `agents/reviewer-agent.yaml` | §5.2: one generic `reviewer-agent` | `z.string().min(1)` | ✅ Match |
| `outputArtifact` | `tech-spec.md` | §2.2: `SAAS-1-tech-spec.md` | `z.string().min(1)` | ✅ Correct (prefix added at runtime) |
| `reviewerRubrics` | `[]` | §5.4: `rubrics: {pass1_structure, pass2_drift}` | `z.array(z.string()).default([])` | ✅ Correct for bootstrapping |
| `maxIterations` | `3` | §5.4: `3` | `z.number().int().positive().default(3)` | ✅ Match |
| `escalation` | `escalate_to_human` | §5.4: `escalate_to_human` | `z.enum([...]).default(...)` | ✅ Match |
| `advanceMode` | `manual` | Action plan: v1 is manual-only | `z.enum([...]).default('manual')` | ✅ Match |
| `preflight` | `enabled: true` | §7.2: pre-flight is a system feature | Schema has defaults | ✅ Consistent |

All YAML field values match both the implemented `ColumnSpecSchema` and the system design intent. The known system design doc staleness (snake_case field names vs camelCase in code) is a documentation gap, not a task error — consistent with findings in M3-000 review (M1, M2).

---

## File Path Alignment with Hexagonal Scaffold

| Referenced Path | Exists in `src/` | Notes |
|----------------|-----------------|-------|
| `ColumnSpecSchema` | `src/infrastructure/spec-loader/schemas.ts` | ✅ |
| `YamlColumnSpecLoader` | `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts` | ✅ |
| `ColumnSpecNotFoundError` | `src/shared/errors.ts` | ✅ |
| `Column.TECH_SPEC` | `src/domain/model/column.ts` line 7 | ✅ `TECH_SPEC: 'TECH_SPEC'` |
| `ColumnSpec` interface | `src/domain/model/column-spec.ts` | ✅ |
| `ColumnSpecLoader` port | `src/domain/ports/driven/column-spec-loader.port.ts` | ✅ |
| Loader filename mapping | `yaml-column-spec-loader.adapter.ts` line 17 | ✅ `[Column.TECH_SPEC]: 'tech-spec'` |
| Runtime target: `.aeos/column-specs/tech-spec.yaml` | N/A (runtime file) | ✅ Correct per loader mapping |

All source references resolve correctly. No phantom paths.

---

## Dependency Validation

| Dependency | Status | Verified |
|-----------|--------|----------|
| M2-007: `ColumnSpecSchema` | ✅ complete | `src/infrastructure/spec-loader/schemas.ts` exists with full schema |
| M2-008: `YamlColumnSpecLoader` | ✅ complete | `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts` exists; `TECH_SPEC` mapping at line 17 |
| M2-013: `reviewer-agent.yaml` | ✅ complete | Task file in archive; review exists |
| M4-001 (AEOS-5): `architect-agent.yaml` | ⬜ not started | Dogfood ticket — depends on M3 + M4-000a/b |

All claimed dependencies verified. One implicit transitive dependency (M4-000a) not listed — see M1 above.

---


## Consistency with Sibling Tasks

| Sibling | Pattern Match | Notes |
|---------|--------------|-------|
| M3-000 (product-scoping) | ✅ Identical structure | M3-000 has more detailed bootstrapping/placeholder notes and an extra AC for `preflight` |
| M4-000a (arch-spike) | ✅ Identical structure | Same agent, same phase, same bootstrapping approach; M4-000a reviewed same day |
| M5a-000 (implementation) | ✅ Identical structure | Different agent (`engineer-agent`), different phase (`BUILD`) |
| M5b-000 (code-review) | ✅ Identical structure | — |
| M6-000 (qa) | ✅ Identical structure | — |

M4-000b follows the established column-spec task pattern. It is slightly stronger than M4-000a in that it includes explicit future rubric paths (see Notes line 32–37), while M4-000a's review flagged the absence of this (m2). M4-000b is slightly weaker than M3-000 in missing the placeholder agent note and `preflight` AC.

---

## Blocking Gaps

No blocking gaps identified. The task can be executed as written. The YAML content will pass `ColumnSpecSchema.parse()` and `YamlColumnSpecLoader.load(Column.TECH_SPEC)` based on the implemented code.

The `TECH_SPEC` → `tech-spec` filename mapping is present in the loader (line 17 of `yaml-column-spec-loader.adapter.ts`). The loader test suite includes tests for similar column mappings (ARCH_SPIKE tested at line 62–68), confirming the loader infrastructure works for this pattern.

The future `reviewerRubrics` update (adding `tech-spec-structure.md` and `intent-drift.md`) is correctly deferred to after AEOS-7 completes. The rubric paths listed (`rubrics/structure/tech-spec-structure.md`, `rubrics/drift/intent-drift.md`) match the system design's rubric library layout (§5.3).

---

## Summary

| Category | Count |
|----------|-------|
| Critical | 0 |
| Major | 0 |
| Medium | 1 |
| Minor | 3 |

**Overall:** Task is well-structured and correctly aligned with both the system design and the implemented codebase. The YAML content matches the `ColumnSpecSchema` exactly — all fields are valid and all defaults are explicitly stated. The single medium finding (M1) is a missing implicit transitive dependency on M4-000a, which is relevant because AEOS-5 (the architect agent dogfood ticket) must transit the ARCH_SPIKE column before reaching TECH_SPEC. The three minor findings are: (1) missing `preflight` acceptance criterion (consistency gap with M3-000), (2) missing placeholder agent file note (consistency gap with M3-000), and (3) narrow Blocks section that omits M4-003 (AEOS-7). None of these prevent execution — the task is implementable as written.