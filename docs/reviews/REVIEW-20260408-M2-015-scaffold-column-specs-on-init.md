# Review: M2-015 — Scaffold Default Column Specs During `project init`

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Task file:** `docs/tasks/M2-015-scaffold-column-specs-on-init.md`
**Cross-referenced against:**
- `docs/03-system-design.md` (System Design v0.3)
- `docs/02-prd.md` (PRD v0.1)
- `docs/05-action-plan-v1.md` (Action Plan)
- Sibling tasks: M2-014, M2-016, M3-000 through M6-000 (archived column specs)
- Source code: `src/domain/ports/driven/project-repository.port.ts`, `src/infrastructure/filesystem/fs-project.repository.ts`, `src/application/project-init.use-case.ts`, `src/application/project-init.use-case.test.ts`, `src/infrastructure/spec-loader/schemas.ts`, `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts`, `src/domain/model/column.ts`, `src/domain/model/column-spec.ts`

---

## Verdict: APPROVE with findings

No blockers. Two medium issues, five minor issues, and two informational notes.

---

## Critical Issues

_None._

---

## Major Issues

_None._

---

## Medium Issues

### ⚠️ M1: DOD_GATE output artifact mismatch with system design

The task specifies `outputArtifact: dod-gate.md` for the DOD_GATE column spec. System design §2.2 specifies `SAAS-1-dod-verification.md` as the DoD Gate worker output. The artifact name should be `dod-verification.md` (the ticket ID prefix is added at runtime by `TicketRunUseCase`).

**Evidence:**
- System design §2.2: `| DoD Gate | All artifacts + ticket DoD | SAAS-1-dod-verification.md | Human approval |`
- Task §3 table: `| DOD_GATE_YAML | dod-gate.yaml | DOD_GATE | DEPLOY | agents/qa-agent.yaml | dod-gate.md |`

**Recommendation:** Change `outputArtifact` from `dod-gate.md` to `dod-verification.md` to match the system design. Alternatively, update the system design if `dod-gate.md` is the intended canonical name — but either way the two must agree.

### ⚠️ M2: DOD_GATE worker/reviewer design divergence from system design

The task assigns `workerAgentFile: agents/qa-agent.yaml` and `reviewerAgentFile: agents/reviewer-agent.yaml` to the DOD_GATE column. However, system design §2.1 labels DoD Gate as "(human)" and §2.2 shows the reviewer as "Human approval". The DoD Gate is designed as a human-controlled gate, not an agent-driven column.

The action plan M6 further confirms this: AEOS-20 is explicitly "DoD Gate human approval CLI flow". Having a `qa-agent` as the worker and `reviewer-agent` as the reviewer for a human-only gate may cause confusion or runtime issues when the DOD_GATE is implemented.

**Recommendation:** Either:
1. Add a comment in the DOD_GATE column spec YAML noting that `workerAgentFile` and `reviewerAgentFile` are placeholders and the DOD_GATE column will use a distinct human-approval flow (AEOS-20), or
2. Create a dedicated `dod-gate-agent.yaml` stub that documents the human-gate behaviour, or
3. Document this as an intentional design simplification — the column spec schema requires `workerAgentFile` and `reviewerAgentFile`, so a placeholder agent is needed even for human-only gates. The `TicketRunUseCase` will need special-case logic for DOD_GATE (AEOS-20).

---

## Minor Issues

### m1: System design §3.3 missing `dod-gate.yaml` from per-project layout

System design §3.3 lists only 6 column spec files under `.aeos/column-specs/`:
```
product-scoping.yaml
architecture-spike.yaml
tech-spec.yaml
implementation.yaml
code-review.yaml
qa.yaml
```

The task correctly scaffolds 7 column specs (adding `dod-gate.yaml`), which is consistent with the Column enum (9 values, minus BACKLOG and DONE = 7 agent-driven columns) and the `COLUMN_SPEC_FILENAMES` mapping in `yaml-column-spec-loader.adapter.ts`. The system design is stale.

**Recommendation:** Update system design §3.3 to include `dod-gate.yaml` in the per-project layout.

### m2: Missing DOD_GATE from Supersedes list

The Supersedes section lists 6 archived tasks (M3-000 through M6-000) but omits DOD_GATE. No archived task exists for a DOD_GATE column spec. This means the DOD_GATE column spec is net-new work introduced by M2-015 without an explicit call-out.

**Recommendation:** Add a note: _"DOD_GATE column spec is new — no prior task existed for this column. Design is preliminary; see M6 for DOD_GATE design (AEOS-15, AEOS-20)."_

### m3: Downstream mock update not fully enumerated

The task says to update `project-init.use-case.test.ts` but doesn't check other test files mocking `ProjectRepository`. Verified: `ticket-run.use-case.test.ts` does not mock `ProjectRepository` directly (it receives a `projectPath` string). However, any future test file added between M2-014 and M2-015 that mocks `ProjectRepository` would also need updating. This is low risk since M2-014 already adds methods to the same interface.

**Recommendation:** Add a note: _"Verify all files mocking `ProjectRepository` include `writeDefaultColumnSpecs` (search: `createMockProjectRepo` or `ProjectRepository`)."_


### m4: Column spec `column` values are enum names — verify consistency with archived tasks

The task table uses `PRODUCT_SCOPING`, `ARCH_SPIKE`, etc. as `column` field values. This is consistent with the Column enum values in `src/domain/model/column.ts` and with all 6 archived column spec tasks (M3-000, M4-000a, M4-000b, M5a-000, M5b-000, M6-000). Verified: all archived tasks use the same enum-name convention. However, the system design §5.4 example shows `column: product-scoping` (kebab-case). The `ColumnSpecSchema` accepts any non-empty string (`z.string().min(1)`), so both pass validation. No runtime issue — the column value in the YAML is informational, not used for lookup (the loader uses filename mapping).

**Recommendation:** No action required. Enum-name convention is already established by the archived tasks and codebase.

### m5: Integration test strategy could be more specific

The task says: _"Add integration tests that load the defaults via `FsProjectRepository.writeDefaultColumnSpecs()` and validate they parse correctly."_ This is correct but should specify: (a) all 7 column specs parse via `ColumnSpecSchema.parse()` without error, (b) the `column`, `phase`, `workerAgentFile`, `reviewerAgentFile`, and `outputArtifact` values match the expected table, and (c) `YamlColumnSpecLoader.load(Column.X)` resolves each file. The M2-014 review flagged a similar gap for agent specs.

**Recommendation:** Enumerate the 7 columns in the test strategy section to ensure complete coverage.

---

## Informational

### i1: System design §3.3 also missing `.aeos/agents/` directory

Same finding as M2-014 review (m2). The per-project layout in system design §3.3 does not include `.aeos/agents/`. Both M2-014 and M2-015 reference files under `.aeos/agents/` (agent spec YAMLs). The design doc should be updated once M2-014 lands.

### i2: `executor.type` naming — `claude-cli` vs system design's `claude-code-cli`

Same finding as M2-014 review (i1). Not relevant to M2-015 directly (column specs don't contain executor config), but the scaffolded agent files referenced by column specs use `claude-cli`. Consistent with codebase. No action needed.

---

## Correctness vs System Design

| Aspect | Task | System Design | Codebase | Verdict |
|--------|------|---------------|----------|---------|
| Column count (7) | 7 specs scaffolded | 6 shown in §3.3 (no DOD_GATE) | 7 in `COLUMN_SPEC_FILENAMES` | ⚠️ Task correct, design stale |
| PRODUCT_SCOPING | phase: PLAN, worker: pm-agent, output: prd.md | §2.1 PLAN, §2.2 prd.md | — | ✅ Match |
| ARCH_SPIKE | phase: PREPARE, worker: architect-agent, output: spike.md | §2.1 PREPARE, §2.2 spike.md | — | ✅ Match |
| TECH_SPEC | phase: PREPARE, worker: architect-agent, output: tech-spec.md | §2.1 PREPARE, §2.2 tech-spec.md | — | ✅ Match |
| IMPLEMENTATION | phase: BUILD, worker: engineer-agent, output: implementation-notes.md | §2.1 BUILD, §2.2 implementation-notes.md | — | ✅ Match |
| CODE_REVIEW | phase: BUILD, worker: engineer-agent, output: code-review.md | §2.2 code-review.md | — | ✅ Match (see M5b-000 notes) |
| QA | phase: DEPLOY, worker: qa-agent, output: qa-report.md | §2.1 DEPLOY, §2.2 qa-report.md | — | ✅ Match |
| DOD_GATE | phase: DEPLOY, worker: qa-agent, output: dod-gate.md | §2.2 dod-verification.md, reviewer: Human | — | ⚠️ See M1, M2 |
| Shared defaults | reviewerAgent: reviewer-agent, maxIter: 3, escalation: escalate_to_human | §5.4 max_iterations: 3, escalation: escalate_to_human | `ColumnSpecSchema` defaults match | ✅ Match |
| Idempotent init | Skip existing files | §3.6 idempotent init | `exists()` check in use case | ✅ Match |

---

## File Path Alignment with Hexagonal Scaffold

| Referenced Path | Exists in `src/` | Status |
|----------------|-----------------|--------|
| `src/domain/ports/driven/project-repository.port.ts` | ✅ | Method to be added |
| `src/infrastructure/filesystem/fs-project.repository.ts` | ✅ | Implementation to be added |
| `src/infrastructure/filesystem/defaults/column-specs.ts` | ❌ (new file) | New — correct layer (infrastructure/filesystem) |
| `src/application/project-init.use-case.ts` | ✅ | Use case to be modified |
| `src/application/project-init.use-case.test.ts` | ✅ | Tests to be updated |
| `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.test.ts` | ✅ | Integration tests to be updated |
| `src/infrastructure/spec-loader/schemas.ts` (`ColumnSpecSchema`) | ✅ | Used for validation |

The new file `src/infrastructure/filesystem/defaults/column-specs.ts` is correctly placed in the infrastructure layer (filesystem adapter concern), parallel to M2-014's `defaults/agent-specs.ts`. Consistent pattern.

---

## Dependency Validation

| Dependency | Status | Verified |
|-----------|--------|----------|
| M1-002: `aeos project init` | ✅ complete | `src/application/project-init.use-case.ts` exists; task in archive |
| M2-007: `ColumnSpecSchema` | ✅ complete | `src/infrastructure/spec-loader/schemas.ts` lines 6-24 |
| M2-014: Scaffold agent specs on init | ⏳ pending | Task exists at `docs/tasks/M2-014-scaffold-agents-on-init.md`; reviewed and approved |

**M2-014 ordering is critical.** M2-015 inserts its call _after_ `writeDefaultAgentSpecs` in `ProjectInitUseCase.execute()`. Agent files must exist before column specs reference them. The dependency is correctly declared and the ordering comment (`// 3c.`) is consistent with M2-014's (`// 3b.`).

---

## Consistency with Sibling Tasks

| Sibling | Consistent | Notes |
|---------|-----------|-------|
| M2-014 (scaffold agent specs) | ✅ | Same pattern: port method → adapter impl → defaults file → use case update → test update. M2-015 depends on M2-014 and inserts its call after. |
| M2-016 (CI project init) | ✅ | M2-016 bootstraps `aeos project init` in CI. After M2-014 + M2-015, init scaffolds both agent and column specs, making all integration tests self-sufficient. |
| M3-000 (product-scoping, archived) | ✅ | Superseded. YAML content matches exactly. |
| M4-000a (architecture-spike, archived) | ✅ | Superseded. YAML content matches. |
| M4-000b (tech-spec, archived) | ✅ | Superseded. YAML content matches. |
| M5a-000 (implementation, archived) | ✅ | Superseded. YAML content matches. |
| M5b-000 (code-review, archived) | ✅ | Superseded. YAML content matches. |
| M6-000 (qa, archived) | ✅ | Superseded. YAML content matches. |

All 6 archived column spec tasks were verified — their YAML content (column, phase, workerAgentFile, reviewerAgentFile, outputArtifact, shared defaults) matches M2-015's table exactly.

---

## Port Interface Impact Analysis

The task adds one method to `ProjectRepository`:

```typescript
writeDefaultColumnSpecs(projectPath: string): void;
```

**Downstream impact on existing mocks:**

| File | Mock needs update | Notes |
|------|------------------|-------|
| `src/application/project-init.use-case.test.ts` line 8-17 | ✅ Yes | `createMockProjectRepo()` must add `writeDefaultColumnSpecs` |
| `src/application/ticket-run.use-case.test.ts` | ❌ No | Does not mock `ProjectRepository` |
| `src/infrastructure/filesystem/fs-project.repository.test.ts` | ❌ No | Tests real `FsProjectRepository` — auto-inherits |
| `src/cli/container.ts` | ❌ No | Uses `FsProjectRepository` — auto-inherits |

**Note:** M2-014 also adds `ensureAgentsDir` and `writeDefaultAgentSpecs` to the same port. If M2-014 is implemented first (as intended), M2-015's implementation will see both sets of methods already present in the mock. If implemented in reverse order, the mock would be incomplete. The dependency ordering must be respected.

---

## Blocking Gaps

**No blocking gaps for implementation of M2-015 itself.** However, two design issues should be resolved before or during implementation:

1. **DOD_GATE output artifact name** (M1) — Decide between `dod-gate.md` and `dod-verification.md`. Low-cost fix: change the task table or update the system design.
2. **DOD_GATE worker/reviewer semantics** (M2) — The DOD_GATE column is human-controlled per the system design. The scaffolded column spec assigns qa-agent as worker and reviewer-agent as reviewer, which will cause agent execution when `aeos ticket run` is invoked on a DOD_GATE ticket. This is likely incorrect but can be addressed in M6 (AEOS-15, AEOS-20) when the DOD_GATE flow is designed. Add a TODO comment in the scaffolded YAML.

---

## Summary

| Category | Count |
|----------|-------|
| Critical | 0 |
| Major | 0 |
| Medium | 2 |
| Minor | 5 |
| Informational | 2 |

**Overall:** The task is well-structured, follows the same hexagonal pattern as M2-014 (its direct predecessor), and correctly consolidates 6 archived column spec tasks into a single init-time scaffolding step. All 6 archived column specs were verified to match the task's YAML content exactly. The primary findings are: (1) the DOD_GATE output artifact name diverges from the system design (`dod-gate.md` vs `dod-verification.md`), and (2) the DOD_GATE column spec assigns qa-agent and reviewer-agent to what the system design describes as a human-only gate. Both are resolvable before implementation with a one-line fix and a TODO comment respectively. File paths, dependency chain, port design, and test strategy are all sound.