# Review: M6-002 — AEOS-16 QA Agent System Prompt and Context Scope

**Reviewed:** 2026-04-08
**Task file:** `docs/tasks/M6-002-AEOS-16-qa-agent-spec.md`
**Reviewer:** Augment Agent (automated deep review)
**Cross-referenced against:**
- `docs/03-system-design.md` (System Design v0.3)
- `docs/02-prd.md` (PRD v0.1)
- `docs/05-action-plan-v1.md` (Action Plan)
- Sibling agent spec tasks: M3-001 (pm-agent), M4-001 (architect-agent), M5a-001 (engineer-agent)
- Same-milestone tasks: M6-001 (AEOS-15 deploy design), M6-003 (AEOS-17 qa-report-template), M6-004 (AEOS-18 qa-structure-rubric)
- Prerequisite task: M6-000 (qa column spec, archived)
- Source code: `src/infrastructure/spec-loader/schemas.ts`, `src/domain/model/agent-spec.ts`, `src/infrastructure/spec-loader/yaml-agent-spec-loader.adapter.ts`, `src/application/services/prompt-builder.ts`
- Prior reviews: `REVIEW-20260408-M5a-001-AEOS-9-engineer-agent-spec.md`, `REVIEW-20260408-M4-001-AEOS-5-architect-agent-spec.md`, `REVIEW-20260408-M6-000-qa-column-spec.md`, `REVIEW-20260408-M6-001-AEOS-15-deploy-column-design.md`

---

## 1. Verdict: ⚠️ APPROVE WITH REQUIRED CHANGES

One critical issue (missing `outputFormat`), one major method mismatch, and multiple medium/minor findings. All are addressable via task amendments — no code changes required. The QA agent serves a single column (QA), so the dual-column concatenation issues that affected M4-001 and M5a-001 do **not** apply here.

---

## 2. Correctness vs System Design

| Aspect | Task | System Design | Verdict |
|--------|------|---------------|---------|
| Agent name | `qa-agent` (implicit) | §5.2: `qa-agent` | ✅ Match |
| Role | Not specified | §5.2: worker | ⚠️ Missing — see M3 |
| Phase | DEPLOY (implicit via M6-000) | §5.2: DEPLOY | ✅ Match |
| Columns served | QA only | §2.1: QA column in DEPLOY phase | ✅ Single column — no dual-column issue |
| Context scope | ticket.md, PRD, spike, tech-spec, impl notes, code review, CONSTRAINTS.md | §8.1: DEPLOY gets ticket + all artifacts + full codebase index + CONSTRAINTS.md | ⚠️ Missing codebase index — see M4 |
| Output artifact | Implicit (qa-report.md via column spec) | §2.2: `SAAS-1-qa-report.md` | ✅ Consistent |
| Executor type | `claude-cli` | §4.2: `claude-code-cli` | ⚠️ Known deviation (accepted across all tasks; schema enum is `claude-cli`) |
| Executor model | `claude-sonnet-4-20250514` | §4.2 example: `claude-opus-4-6` | ⚠️ Intentional (all agent specs use sonnet) |
| Self-verification | ≥ 3 items | §4.4: `[SELF-VERIFICATION]` section | ✅ Consistent |
| Agent description | "holistic quality assessment" | §5.2: "Writes and runs automated tests" | ⚠️ Known system design doc gap (flagged in M6-000 review I-4) — task's interpretation is correct for v1 |

---

## 3. Findings

### 🔴 CRITICAL (C1): `outputFormat` entirely absent from task

The `AgentSpecSchema` (`src/infrastructure/spec-loader/schemas.ts` line 31):
```typescript
outputFormat: z.string().min(1),
```

This is a **required** field with no default. The task's "What needs to be done" section does not mention `outputFormat` at all. Without it, the produced YAML will fail `AgentSpecSchema` validation.

The M5a-001 review flagged the identical issue as C2. The M4-001 amended task includes explicit `outputFormat` guidance. M6-003 (AEOS-17, qa-report-template) expects to later "Update `qa-agent.yaml` `outputFormat` to reference `qa-report-template.md`" — but cannot update a field that doesn't exist.

`PromptBuilder` (`src/application/services/prompt-builder.ts`) treats `outputFormat` as **inline text, not a file path**. The implementer must inline template content as a multi-line YAML string.

**Impact:** The produced YAML will fail schema validation. Downstream M6-003 cannot update a non-existent field.

**Recommendation:** Add item: _"`outputFormat`: multi-line YAML string with inline placeholder describing the expected QA report structure. `PromptBuilder` treats `outputFormat` as inline text, not a file path. M6-003 (AEOS-17) will update this field with the full template content."_

### ⚠️ MAJOR (H1): Method mismatch — "Agentic implementation" vs action plan "Dogfood"

**Task header:** `Method: Agentic implementation`
**Action plan §M6:** _"Method: Dogfood."_ and _"Tickets to run through pipeline: **AEOS-16** — QA agent system prompt"_

The action plan explicitly states M6 tickets are dogfood tickets. The M5a-001 review flagged the identical issue as H1.

Pattern check across sibling agent spec tasks:
- M3-001 (pm-agent): `Dogfood — run through AEOS pipeline` ✅
- M4-001 (architect-agent, amended): `Dogfood — run through AEOS pipeline` ✅
- M5a-001 (engineer-agent): `Agentic implementation` ❌ (same issue, flagged)
- **M6-002 (qa-agent): `Agentic implementation`** ❌

If dogfood, the "What needs to be done" section should include pipeline steps (create ticket, fill description, run, review, approve). The current steps read like a manual task spec.

**Recommendation:** Change to `Method: Dogfood — run through AEOS pipeline`. Update steps to include pipeline execution steps per M4-001 amended pattern.

### ⚠️ MEDIUM (M1): Dependencies incomplete

**Listed:** _"M6-001: AEOS-15 complete (deploy phase design)"_

Missing dependencies:
- **M6-000: `qa.yaml` column spec** — ❌ not listed. Without this file, `aeos ticket run` fails with `ColumnSpecNotFoundError` when a ticket enters the QA column. M6-000 is the bootstrapping prerequisite for all QA column activity.
- **M2-013: `reviewer-agent.yaml`** — ❌ not listed. Required for the reviewer to evaluate the QA agent's output during pipeline execution. All amended sibling tasks list this explicitly.

**Note:** M6-001 (AEOS-15) as a dependency is correct — the deploy phase design informs the QA agent's design. But AEOS-16 runs through PLAN/PREPARE/BUILD columns as a dogfood ticket, not the QA column, so M6-000 is technically only needed if testing the QA column end-to-end during M6-002 validation. However, the task produces `qa-agent.yaml` which is referenced by `qa.yaml`'s `workerAgentFile` — the two should be coordinated.

**Recommendation:**
```markdown
## Dependencies
- M6-001: AEOS-15 complete (deploy phase design)
- M6-000: `qa.yaml` column spec exists (references qa-agent.yaml)
- M2-013: `reviewer-agent.yaml` exists
```

### ⚠️ MEDIUM (M2): `context_scope` not representable in schema

**Task item 2:** _"Context scope: ticket.md, PRD, spike, tech-spec, implementation notes, code review artifact, CONSTRAINTS.md"_

`AgentSpecSchema` has **no `contextScope` field** (confirmed in M2-007 review m2, deferred to v2). The `ContextAssembler` in v1 always includes all available context. If the implementer adds a `contextScope` field to the YAML, it will be silently stripped (schema uses `.object()` not `.strict()`).

This is informational — the same issue exists in M4-001 and M5a-001. The context scope description documents design intent but cannot be stored in the schema.

**Recommendation:** Add note: _"Context scope is informational — `AgentSpecSchema` does not have a `contextScope` field in v1. Document intended scope in `systemPrompt`. `ContextAssembler` handles actual injection."_

### ⚠️ MEDIUM (M3): Missing `role: worker`

The task does not mention setting `role: worker`. `AgentSpecSchema` has `role: z.enum(['worker', 'reviewer']).optional()`. The reviewer agent (M2-013) sets `role: reviewer`. The M4-001 amended task explicitly includes `role: worker`.

**Recommendation:** Add to item 1: _"Set `role: worker`."_ Add AC: _"`role` is set to `worker`."_

### ⚠️ MEDIUM (M4): Context scope omits full codebase index

System design §8.1 specifies DEPLOY agents receive:
- `ticket.md` ✓ (listed)
- All prior artifacts ✓ (PRD, spike, tech-spec, impl notes, code review listed)
- `CONSTRAINTS.md` ✓ (listed)
- **Full codebase index** ❌ not listed
- **Reviewer findings** ❌ not listed (§8.1 includes "Reviewer findings (current column)")

The QA agent is in DEPLOY phase and should have full codebase access per the system design. The context scope description is incomplete.

**Recommendation:** Update item 2 to: _"Context scope: ticket.md, PRD, spike, tech-spec, implementation notes, code review artifact, CONSTRAINTS.md, full codebase index"_


### ⚠️ MEDIUM (M5): Missing `name` field guidance

`AgentSpecSchema` requires `name: z.string().min(1)`. The task does not specify the `name` value. Convention from sibling agents: `pm-agent`, `architect-agent`, `engineer-agent`, `reviewer-agent`.

**Recommendation:** Add to item 1: _"Set `name: qa-agent`."_

---

## 4. Minor Issues

### m1: No "Technical Notes / Hints" section

The amended M4-001 and M5a-001 (recommended) include a Technical Notes section covering schema limitations, `PromptBuilder` behaviour, and column spec prerequisites. M6-002 has none. Given C1 and M2 above, hints would prevent implementation confusion.

**Recommendation:** Add:
```markdown
## Technical Notes / Hints
- `AgentSpecSchema` has no `contextScope` field in v1. Document intended scope in `systemPrompt`. `ContextAssembler` handles actual injection.
- `PromptBuilder` treats `outputFormat` as inline text, not a file path. Template content must be inlined as a multi-line YAML string. M6-003 (AEOS-17) will update this field later.
- The QA column spec (`qa.yaml`) must exist before AEOS-16 output can be tested in the QA column.
- Unlike `architect-agent` and `engineer-agent`, the QA agent serves a single column (QA). No dual-column concatenation is needed for `taskInstruction` or `outputFormat`.
```

### m2: Definition of Done is minimal

Current DoD: _"`qa-agent.yaml` committed and schema-valid"_

Amended M4-001 DoD includes pipeline traversal and reviewer sign-off. If AEOS-16 is a dogfood ticket, the DoD should reflect this.

**Recommendation:** Expand to:
```markdown
## Definition of Done
- [ ] `qa-agent.yaml` committed and schema-valid
- [ ] AEOS-16 ticket reaches DONE (transits through pipeline columns successfully)
- [ ] Reviewer agent signs off on the produced artifact
```

### m3: Acceptance criteria incomplete

M6-002 ACs check: file exists, schema-valid, systemPrompt describes quality reasoning, selfVerification ≥ 3. Missing checks consistent with amended M4-001:
- `role` is set to `worker`
- `outputFormat` contains inline template content
- `taskInstruction` covers holistic artifact analysis and QA report production

**Recommendation:** Expand ACs:
```markdown
## Acceptance Criteria
- [ ] `qa-agent.yaml` exists at `.aeos/agents/qa-agent.yaml`
- [ ] Parsed with `AgentSpecSchema` — no ZodError
- [ ] `role` is set to `worker`
- [ ] `systemPrompt` describes holistic quality assessment reasoning
- [ ] `taskInstruction` covers cross-artifact analysis and QA report production
- [ ] `outputFormat` contains inline placeholder template content
- [ ] `selfVerificationChecklist` contains ≥ 3 items
```

---

## 5. File Path Alignment with Hexagonal Scaffold

| Referenced Path / Component | Exists in `src/` | Notes |
|----------------------------|-----------------|-------|
| `AgentSpecSchema` | `src/infrastructure/spec-loader/schemas.ts` (line 26) | ✅ |
| `AgentSpec` interface | `src/domain/model/agent-spec.ts` | ✅ |
| `YamlAgentSpecLoader` | `src/infrastructure/spec-loader/yaml-agent-spec-loader.adapter.ts` | ✅ |
| `AgentSpecLoader` port | `src/domain/ports/driven/agent-spec-loader.port.ts` | ✅ |
| `AgentSpecNotFoundError` | `src/shared/errors.ts` | ✅ |
| `PromptBuilder` | `src/application/services/prompt-builder.ts` | ✅ `outputFormat` injected as inline text |
| Runtime target: `.aeos/agents/qa-agent.yaml` | N/A (runtime file) | ✅ Consistent with M2-013, M3-001, M4-001, M5a-001 pattern |
| Column spec: `.aeos/column-specs/qa.yaml` | N/A (runtime file) | ✅ M6-000 creates this |

All source references resolve correctly. No phantom paths.

---

## 6. Dependency Validation

| Dependency | Status | Verified |
|-----------|--------|----------|
| M6-001: AEOS-15 (deploy phase design) | ⬜ Not started | Task in `docs/tasks/` (not archived) |
| M6-000: `qa.yaml` column spec (missing from task) | ✅ Complete | Archived; review at `REVIEW-20260408-M6-000` |
| M2-013: `reviewer-agent.yaml` (missing from task) | ✅ Complete | Archived; review at `REVIEW-20260407-M2-013` |

**Note:** The listed dependency M6-001 (AEOS-15) is not yet complete. AEOS-16 should not execute until the deploy phase design is finalized, as it informs the QA agent's design parameters.

---

## 7. Consistency with Reviewed Sibling Tasks

| Aspect | M3-001 (pm) | M4-001 (arch, amended) | M5a-001 (eng) | **M6-002 (qa)** |
|--------|-------------|----------------------|---------------|-----------------|
| Method | Dogfood | Dogfood (amended) | ❌ Agentic impl | ❌ Agentic impl |
| `role` specified | N/A (pre-amendment) | ✅ `worker` | ❌ Missing | ❌ Missing |
| `outputFormat` mentioned | ✅ | ✅ (amended) | ❌ Missing | ❌ **Missing** |
| `name` specified | N/A | ✅ `architect-agent` | ❌ Missing | ❌ Missing |
| Technical Notes | ✅ | ✅ (amended) | ❌ Missing | ❌ Missing |
| Dependencies detail | Explicit | Expanded (amended) | ❌ Minimal | ❌ Minimal |
| DoD scope | Pipeline + reviewer | Pipeline + reviewer | ❌ Minimal | ❌ Minimal |
| AC format | Given/When/Then | Checklist | Checklist | Checklist |
| Dual-column issue | N/A (1 column) | ✅ Addressed | ❌ Not addressed | N/A (1 column) ✅ |

M6-002 has NOT absorbed the amendments applied to M4-001 after its review. The same gaps flagged in the M5a-001 review (C2, H1, M1–M3, m1–m3) apply here — except the dual-column issue (C1 in M5a-001), which does not apply since the QA agent serves only one column.

---

## 8. Cross-Task Coordination Issues

### X1: M6-003 (AEOS-17) depends on `outputFormat` existing in `qa-agent.yaml`

M6-003 item 4: _"Update `qa-agent.yaml` `outputFormat` to reference `qa-report-template.md`"_

If M6-002 produces `qa-agent.yaml` without an `outputFormat` (currently not mentioned in the task), M6-003 cannot "update" a field that doesn't exist. Either M6-002 must establish a baseline `outputFormat`, or M6-003 must create it.

**Resolution:** Fix via C1 — M6-002 must include a baseline `outputFormat`.

### X2: M6-000 `qa.yaml` already references `agents/qa-agent.yaml`

The `qa.yaml` column spec (M6-000, archived) sets `workerAgentFile: agents/qa-agent.yaml`. This confirms the target path. If `qa-agent.yaml` is produced by a dogfood ticket (as it should be per the action plan), the pipeline will write it as an artifact — the operator must then copy/commit it to `.aeos/agents/`. This operator step is implicit in all agent spec tasks but never documented.

### X3: System design QA agent description diverges from task

System design §5.2: `qa-agent` — "Writes and runs automated tests"
Task: "holistic quality assessment", "cross-check implementation against PRD requirements", "produce a QA report with risk-rated findings"

The task's interpretation is correct for v1. The system design description is aspirational. This gap was flagged in REVIEW-20260408-M6-000 (I-4). No action required for M6-002, but the system design should eventually be updated.

---

## 9. Gaps That Would Block Implementation

### 9.1 Blocking gaps

1. **C1 (`outputFormat` missing):** The produced YAML will fail `AgentSpecSchema` validation. The downstream task M6-003 cannot update a non-existent field. This **must** be fixed before implementation.

### 9.2 Non-blocking but important

2. **H1 (method mismatch):** Does not prevent execution, but the task steps don't include pipeline execution steps (create ticket, run, review, approve), which may confuse the implementer.
3. **M1 (dependencies incomplete):** M6-000 and M2-013 are already complete and available. Missing them from the list doesn't block execution but reduces traceability.
4. **M3 (missing `role: worker`):** Optional field — schema validation won't fail without it, but inconsistent with amended siblings.

---

## 10. Recommendations Summary

| # | Severity | Finding | Action |
|---|----------|---------|--------|
| C1 | Critical | `outputFormat` entirely missing from task | Add item: inline placeholder template content for QA report |
| H1 | Major | Method "Agentic implementation" ≠ action plan "Dogfood" | Change to Dogfood; update steps per M4-001 amended pattern |
| M1 | Medium | Dependencies incomplete — missing M6-000, M2-013 | Expand dependency list |
| M2 | Medium | `context_scope` has no schema field | Note scope is informational; embed in systemPrompt |
| M3 | Medium | Missing `role: worker` | Add to item 1 and ACs |
| M4 | Medium | Context scope omits full codebase index | Add to context scope list |
| M5 | Medium | Missing `name` field guidance | Add `name: qa-agent` |
| m1 | Minor | No Technical Notes section | Add hints about schema limitations |
| m2 | Minor | DoD minimal — no pipeline/reviewer | Expand per M4-001 amended pattern |
| m3 | Minor | ACs incomplete — missing role, outputFormat, taskInstruction checks | Expand per M4-001 amended ACs |
| X1 | Cross-task | M6-003 expects `outputFormat` to exist | Resolve via C1 |
| X2 | Cross-task | Operator copy step for dogfood agent YAML | Informational — no action |
| X3 | Cross-task | System design QA description diverges | Informational — update system design eventually |

---

## 11. Proposed Amendments

### 1. Fix Method and update header (H1)

```markdown
**Method:** Dogfood — run through AEOS pipeline
```

### 2. Rewrite "What needs to be done" (C1, M2, M3, M4, M5)

```markdown
## What needs to be done
1. Create ticket: `aeos ticket create "QA Agent system prompt and context scope"` → AEOS-16
2. Fill in `.aeos/tickets/AEOS-16/AEOS-16-ticket.md`:
   - Goal: define the QA agent's system prompt, context scope, task instruction, output format, and self-verification checklist
   - Output: `qa-agent.yaml` conforming to `AgentSpecSchema`
3. Create `.aeos/agents/qa-agent.yaml` conforming to `AgentSpecSchema`
4. Set `name: qa-agent`, `role: worker`
5. `systemPrompt`: describe reasoning about requirement coverage, edge case identification, risk assessment, readiness for production. Embed context scope description (ticket.md, PRD, spike, tech-spec, implementation notes, code review artifact, CONSTRAINTS.md, full codebase index). Context scope is informational — `AgentSpecSchema` does not have a `contextScope` field in v1. Document the intended scope in the `systemPrompt`. The `ContextAssembler` handles actual injection.
6. `taskInstruction`: analyse all artifacts holistically, cross-check implementation against PRD requirements, identify gaps, produce a QA report with risk-rated findings and a READY/NOT READY recommendation
7. `outputFormat`: multi-line YAML string with inline placeholder template describing expected QA report sections (Executive Summary, Requirements Coverage, Edge Cases & Risks, Findings, Recommendation). `PromptBuilder` treats `outputFormat` as inline text, not a file path. M6-003 (AEOS-17) will update this field with the full template content.
8. `selfVerificationChecklist`: ≥ 3 items covering cross-artifact consistency and recommendation justification
9. Set `executor.type: claude-cli`, `executor.model: claude-sonnet-4-20250514`
```

### 3. Expand Acceptance Criteria (m3)

```markdown
## Acceptance Criteria
- [ ] `qa-agent.yaml` exists at `.aeos/agents/qa-agent.yaml`
- [ ] Parsed with `AgentSpecSchema` — no ZodError
- [ ] `role` is set to `worker`
- [ ] `systemPrompt` describes holistic quality assessment reasoning
- [ ] `taskInstruction` covers cross-artifact analysis and QA report production
- [ ] `outputFormat` contains inline placeholder template content
- [ ] `selfVerificationChecklist` contains ≥ 3 items
```

### 4. Expand Dependencies (M1)

```markdown
## Dependencies
- M6-001: AEOS-15 complete (deploy phase design)
- M6-000: `qa.yaml` column spec exists (references qa-agent.yaml)
- M2-013: `reviewer-agent.yaml` exists
```

### 5. Add Technical Notes (m1)

```markdown
## Technical Notes / Hints
- `AgentSpecSchema` has no `contextScope` field in v1. Document intended scope in `systemPrompt`. `ContextAssembler` handles actual injection.
- `PromptBuilder` treats `outputFormat` as inline text, not a file path. Template content must be inlined as a multi-line YAML string. M6-003 (AEOS-17) will update this field later.
- The QA column spec (`qa.yaml`) must exist before AEOS-16 output can be tested in the QA column.
- Unlike `architect-agent` and `engineer-agent`, the QA agent serves a single column (QA). No dual-column concatenation is needed for `taskInstruction` or `outputFormat`.
```

### 6. Expand Definition of Done (m2)

```markdown
## Definition of Done
- [ ] `qa-agent.yaml` committed and schema-valid
- [ ] AEOS-16 ticket reaches DONE (transits through pipeline columns successfully)
- [ ] Reviewer agent signs off on the produced artifact
```

---

## 12. Summary

| Category | Count |
|----------|-------|
| Critical | 1 |
| Major | 1 |
| Medium | 5 |
| Minor | 3 |
| Cross-task | 3 (1 issue, 2 informational) |

**Overall:** The task correctly identifies the QA agent's purpose, context scope, and relationship to the DEPLOY phase. It aligns with the system design's agent roster (§5.2, noting the known description gap) and correctly scopes out AEOS-17 and AEOS-18. However, it has NOT absorbed the amendments applied to the M4-001 task after review — the same gaps flagged in the M4-001 and M5a-001 reviews persist here. Most critically, `outputFormat` is entirely absent, meaning the produced YAML will fail schema validation. The QA agent benefits from being a single-column agent (no dual-column concatenation needed), making the fix simpler than M4-001 or M5a-001. The recommended amendments bring M6-002 to parity with the amended M4-001 template.