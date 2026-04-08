# Review: M5a-001 — AEOS-9 Engineer Agent System Prompt and Context Scope

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Task file:** `docs/tasks/M5a-001-AEOS-9-engineer-agent-spec.md`
**Cross-referenced against:**
- `docs/03-system-design.md` (System Design v0.3)
- `docs/02-prd.md` (PRD v0.1)
- `docs/05-action-plan-v1.md` (Action Plan)
- Sibling tasks: M3-001 (pm-agent), M4-001 (architect-agent), M6-002 (qa-agent)
- Same-milestone tasks: M5a-002 (impl-notes-template), M5a-003 (impl-structure-rubric), M5a-004 (constraints-injection)
- Column spec tasks: M5a-000 (implementation), M5b-000 (code-review)
- Source code: `src/infrastructure/spec-loader/schemas.ts`, `src/domain/model/agent-spec.ts`, `src/infrastructure/spec-loader/yaml-agent-spec-loader.adapter.ts`
- Prior review: `REVIEW-20260408-M4-001-AEOS-5-architect-agent-spec.md` (flagged same issues; amendments applied to M4-001 but NOT propagated to M5a-001)

---

## Verdict: APPROVE WITH REQUIRED CHANGES

Two critical issues (both previously flagged in the M4-001 review and unresolved here), one major method mismatch, and multiple medium/minor findings. All are addressable via task amendments — no code changes required.

---

## Critical Issues

### 🔴 C1: `taskInstruction` is a single string — task items 4 and 5 require two

**Task items 4–5:** Item 4 defines a `taskInstruction` for IMPLEMENTATION; item 5 defines a separate `taskInstruction` for CODE_REVIEW.

The implemented `AgentSpecSchema` (`src/infrastructure/spec-loader/schemas.ts` line 30):
```typescript
taskInstruction: z.string().min(1),
```

Single string field. The engineer agent serves two columns (IMPLEMENTATION and CODE_REVIEW), each with different task instructions. The M4-001 review flagged this exact issue as C1, noted "M5a-001 (engineer agent) has the same problem", and proposed a fix: concatenate both instructions into a single multi-line YAML string with section headers. **The M4-001 task was amended accordingly but this fix was NOT propagated to M5a-001.**

**Impact:** Without guidance, the implementer will attempt to create two `taskInstruction` entries (ZodError) or two separate YAML files (contradicts system design §5.2 which lists one `engineer-agent`).

**Recommendation:** Rewrite items 4–5 as a single item: _"`taskInstruction`: single multi-line YAML string containing guidance for BOTH columns, separated by clear headers (`### When running in IMPLEMENTATION` / `### When running in CODE_REVIEW`). The `AgentSpecSchema` has one `taskInstruction` field — both are concatenated."_ — matching the M4-001 amended pattern.

### 🔴 C2: `outputFormat` is a single string — engineer agent needs two output formats

The engineer agent produces `implementation-notes.md` in the IMPLEMENTATION column and `code-review.md` in the CODE_REVIEW column. These are fundamentally different artifacts requiring different output templates. The `AgentSpecSchema` has:
```typescript
outputFormat: z.string().min(1),
```

One string. The task does not mention `outputFormat` at all — it is entirely absent from the "What needs to be done" and acceptance criteria. Sibling tasks M5a-002 (AEOS-10) and M5b-002 (AEOS-14) expect to update `engineer-agent.yaml`'s `outputFormat` later, but the initial spec must establish a baseline.

Additionally, `PromptBuilder` treats `outputFormat` as **inline text, not a file path** (confirmed in M3-003 and M4-001 reviews). The implementer must inline template content.

**Impact:** Without `outputFormat`, the YAML will fail `AgentSpecSchema` validation (`z.string().min(1)` is required, no default). The task is incomplete — it will not produce a schema-valid YAML as written.

**Recommendation:** Add item: _"`outputFormat`: single multi-line YAML string with inline template content for both columns, separated by section headers (`### IMPLEMENTATION output` / `### CODE_REVIEW output`). `PromptBuilder` treats `outputFormat` as inline text, not a file path. M5a-002 and M5b-002 will update this field later."_

---

## Major Issues

### ⚠️ H1: Method mismatch — "Agentic implementation" vs action plan "Dogfood"

**Task header:** `Method: Agentic implementation`
**Action plan §M5a:** _"Method: Dogfood."_ and _"Tickets to run through pipeline: **AEOS-9** — Engineer agent system prompt and context scope"_

The action plan explicitly states M5a tickets are dogfood tickets. The M4-001 review flagged the identical issue as H1. The amended M4-001 task uses `Method: Dogfood — run through AEOS pipeline`. M5a-001 was not updated.

Pattern check across sibling agent spec tasks:
- M3-001 (pm-agent): `Dogfood — run through AEOS pipeline` ✅
- M4-001 (architect-agent, amended): `Dogfood — run through AEOS pipeline` ✅
- **M5a-001 (engineer-agent): `Agentic implementation`** ❌
- M6-002 (qa-agent): `Agentic implementation` ❌ (same issue)

**Impact:** If dogfood, the "What needs to be done" section should include pipeline steps (create ticket, fill description, run, review, approve) and dependencies must include column specs. If NOT dogfood, it contradicts the action plan's core principle.

**Recommendation:** Change to `Method: Dogfood — run through AEOS pipeline`. Update steps to follow M4-001 amended pattern.

---

## Medium Issues

### ⚠️ M1: Dependencies are incomplete

**Listed:** _"M4 complete (architect agent and templates working)"_

Missing dependencies for a dogfood ticket that transits the IMPLEMENTATION column:
- **M5a-000: `implementation.yaml` column spec** — ❌ not listed. Without this file, `aeos ticket run` fails with `ColumnSpecNotFoundError`. This is the most critical missing dependency.
- **M5b-000: `code-review.yaml` column spec** — ❌ not listed. The engineer agent serves CODE_REVIEW too; if AEOS-9 needs to transit that column, this spec is required.
- **M2-013: `reviewer-agent.yaml`** — ❌ not listed (implicit via M4, but M4-001 amended version lists it explicitly).

**Recommendation:**
```markdown
## Dependencies
- M4 complete (architect agent and templates working)
- M5a-000: `implementation.yaml` column spec (AEOS-9 transits IMPLEMENTATION)
- M5b-000: `code-review.yaml` column spec (engineer agent serves CODE_REVIEW)
- M2-013: `reviewer-agent.yaml` exists
```

### ⚠️ M2: `context_scope` not representable in schema

**Task item 2:** _"Context scope: ticket.md, PRD, spike, tech-spec, CONSTRAINTS.md"_

`AgentSpecSchema` has no `contextScope` field (confirmed in M2-007 review m2, deferred to v2). The `ContextAssembler` in v1 always includes all available context. The implementer may try to add a `contextScope` field to the YAML — it won't cause a ZodError (schema uses `.object()` not `.strict()`, stripping unknown fields) but it won't be used either.

**Recommendation:** Add note: _"Context scope is informational — `AgentSpecSchema` does not have a `contextScope` field in v1. Document intended scope in `systemPrompt`. `ContextAssembler` handles actual injection."_

### ⚠️ M3: Missing `role: worker`

The task does not mention setting `role: worker`. `AgentSpecSchema` has `role: z.enum(['worker', 'reviewer']).optional()`. The reviewer agent (M2-013) explicitly sets `role: reviewer`. The M4-001 amended task explicitly includes `role: worker`.

**Recommendation:** Add to item 1: _"Set `role: worker`."_ Add AC: _"`role` is set to `worker`."_

### ⚠️ M4: Context scope omits codebase index

System design §8.1 specifies BUILD agents receive:
- `ticket.md` ✓ (listed)
- Prior phase artifacts (PLAN + PREPARE) ✓ (PRD, spike, tech-spec listed)
- `CONSTRAINTS.md` ✓ (listed)
- **Codebase index (full)** ❌ not listed

The engineer agent is in BUILD phase and should have full codebase access per the system design. The context scope description is incomplete.

**Recommendation:** Update item 2 to include codebase index: _"Context scope: ticket.md, PRD, spike, tech-spec, CONSTRAINTS.md, full codebase index"_

---

## Minor Issues

### m1: No "Technical Notes / Hints" section

The amended M4-001 includes a Technical Notes section covering schema limitations, `PromptBuilder` behaviour, and column spec prerequisites. M5a-001 has none. Given C1, C2, and M2 above, hints would prevent implementation confusion.

**Recommendation:** Add:
```markdown
## Technical Notes / Hints
- `AgentSpecSchema` has single `taskInstruction` and `outputFormat` fields. The engineer agent serves two columns (IMPLEMENTATION, CODE_REVIEW). Concatenate both column-specific instructions into one field with section headers.
- `PromptBuilder` treats `outputFormat` as inline text, not a file path. Template content must be inlined as a multi-line YAML string. M5a-002 and M5b-002 will update this field later.
- `context_scope` is not a schema field in v1. Document intended scope in `systemPrompt`. `ContextAssembler` handles actual injection.
- The IMPLEMENTATION (`implementation.yaml`) and CODE_REVIEW (`code-review.yaml`) column specs must exist before AEOS-9 reaches those columns.
```

### m2: Definition of Done is minimal

Current DoD: _"`engineer-agent.yaml` committed and schema-valid"_

Amended M4-001 DoD includes pipeline traversal and reviewer sign-off:
```
- [ ] `architect-agent.yaml` committed and schema-valid
- [ ] AEOS-5 ticket reaches DONE (transits through pipeline columns successfully)
- [ ] Reviewer agent signs off on the produced artifact
```

**Recommendation:** Expand to include pipeline completion and reviewer sign-off.

### m3: Missing `name` field guidance

`AgentSpecSchema` requires `name: z.string().min(1)`. The task does not specify what the `name` value should be. Convention from sibling agents: `pm-agent`, `architect-agent`, `reviewer-agent`.

**Recommendation:** Add to item 1: _"Set `name: engineer-agent`."_

### m4: Acceptance criteria incomplete vs amended M4-001

M4-001 amended ACs include checks for `role`, `taskInstruction` dual-column content, and `outputFormat`. M5a-001 ACs check only: file exists, schema-valid, systemPrompt reasoning, selfVerification count. Missing:
- `role` is set to `worker`
- `taskInstruction` covers both IMPLEMENTATION and CODE_REVIEW
- `outputFormat` contains inline template content for both columns

### m5: `executor.model` value differs from system design example

Task: `claude-sonnet-4-20250514`. System design §4.2: `claude-opus-4-6`. Consistent with all other agent spec tasks and the reviewed `reviewer-agent.yaml`. The system design example is outdated. Not blocking.

---

## Correctness vs System Design

| Aspect | Task | System Design | Verdict |
|--------|------|---------------|---------|
| Agent name | `engineer-agent` | §5.2: `engineer-agent` | ✅ Match |
| Role | Worker (implicit) | §5.2: worker | ⚠️ Not explicit — see M3 |
| Phase | BUILD | §5.2: BUILD | ✅ Match |
| Columns served | IMPLEMENTATION + CODE_REVIEW | §2.1: "Implement (eng agent)" + "Code Review (reviewer)" | ⚠️ §2.1 labels Code Review as "(reviewer)" but M5b-000 clarifies eng agent is the worker |
| Context scope | ticket, PRD, spike, tech-spec, CONSTRAINTS | §8.1: BUILD gets all prior + CONSTRAINTS + full codebase index | ⚠️ Missing codebase index |
| Executor type | `claude-cli` | §4.2: `claude-code-cli` | ⚠️ Known deviation (accepted across all tasks) |
| Model | `claude-sonnet-4-20250514` | §4.2 example: `claude-opus-4-6` | ⚠️ Intentional (all agents use sonnet) |
| Self-verification | ≥ 3 items | §4.4: `[SELF-VERIFICATION]` section | ✅ Consistent |
| Implementation output | Not specified | §2.2: `implementation-notes.md` | ⚠️ See C2 |
| Code review output | Not specified | §2.2: `code-review.md` | ⚠️ See C2 |

---

## File Path Alignment with Hexagonal Scaffold

| Referenced Path / Component | Exists in `src/` | Notes |
|----------------------------|-----------------|-------|
| `AgentSpecSchema` | `src/infrastructure/spec-loader/schemas.ts` (line 26) | ✅ |
| `AgentSpec` interface | `src/domain/model/agent-spec.ts` | ✅ |
| `YamlAgentSpecLoader` | `src/infrastructure/spec-loader/yaml-agent-spec-loader.adapter.ts` | ✅ |
| `AgentSpecLoader` port | `src/domain/ports/driven/agent-spec-loader.port.ts` | ✅ |
| `AgentSpecNotFoundError` | `src/shared/errors.ts` | ✅ |
| Runtime target: `.aeos/agents/engineer-agent.yaml` | N/A (runtime file) | ✅ Consistent with M2-013, M3-001, M4-001 pattern |
| Column spec: `.aeos/column-specs/implementation.yaml` | N/A (runtime file) | ✅ M5a-000 creates this |
| Column spec: `.aeos/column-specs/code-review.yaml` | N/A (runtime file) | ✅ M5b-000 creates this |

All source references resolve correctly. No phantom paths.

---

## Dependency Validation

| Dependency | Status | Verified |
|-----------|--------|----------|
| M4 complete | ⬜ In progress | M4-001 through M4-004 still in `docs/tasks/` (not archived) |
| M5a-000 (implicit, missing) | ✅ Complete | Archived; review at `REVIEW-20260408-M5a-000` |
| M5b-000 (implicit, missing) | ✅ Complete | Archived; review at `REVIEW-20260408-M5b-000` |
| M2-013 (implicit, missing) | ✅ Complete | Archived; review at `REVIEW-20260407-M2-013` |

**Note:** The task's only listed dependency (M4 complete) appears not yet met — M4 tasks are not archived. AEOS-9 cannot run through the pipeline until M4 is complete. Column specs (M5a-000, M5b-000) are complete and ready.

---

## Consistency with Sibling Tasks

| Aspect | M3-001 (pm) | M4-001 (arch, amended) | **M5a-001 (eng)** | M6-002 (qa) |
|--------|-------------|----------------------|-------------------|-------------|
| Method | Dogfood | Dogfood (amended) | ❌ Agentic impl | ❌ Agentic impl |
| `role` specified | N/A (pre-amendment) | ✅ `worker` | ❌ Missing | ❌ Missing |
| `outputFormat` mentioned | ✅ | ✅ (amended) | ❌ Missing | ❌ Missing |
| Dual-column guidance | N/A (1 column) | ✅ Concatenate w/ headers | ❌ Implies two fields | N/A (1 column) |
| Technical Notes | ✅ | ✅ (amended) | ❌ Missing | ❌ Missing |
| Dependencies detail | Explicit | Expanded (amended) | ❌ Minimal | ❌ Minimal |
| DoD scope | Pipeline + reviewer | Pipeline + reviewer | ❌ Minimal | ❌ Minimal |
| AC format | Given/When/Then | Checklist | Checklist | Checklist |

M5a-001 has NOT received the amendments that were applied to M4-001 after its review. All issues flagged in M4-001's review (C1, C2, H1, M1–M3, m2–m3) apply identically here.

---

## Cross-Task Coordination Issues

### X1: M5a-002 (AEOS-10) depends on `outputFormat` existing in `engineer-agent.yaml`

M5a-002 item 4: _"Update `engineer-agent.yaml` `outputFormat` to reference `impl-notes-template.md` for IMPLEMENTATION column."_

If M5a-001 produces `engineer-agent.yaml` without an `outputFormat` (currently not mentioned in the task), M5a-002 cannot "update" a field that doesn't exist. Either M5a-001 must establish a baseline `outputFormat`, or M5a-002 must create it.

### X2: Rubric filename inconsistency (propagated from M5a-000 review F-1)

M5a-000 Notes section references `rubrics/structure/impl-structure.md`. M5a-003 (AEOS-11) produces `rubrics/structure/impl-structure.md` per its item 1. The M5a-000 review F-1 recommended changing to `implementation-structure.md`, but M5a-003's actual output path is `impl-structure.md`. The names now align between M5a-000 and M5a-003 (both use `impl-structure.md`), contradicting the review recommendation. This should be verified — if F-1 was "resolved in commit", the actual filenames need checking.

### X3: M5a-004 (AEOS-12) is independent of M5a-001

M5a-004's dependency is _"M2: Context assembler and prompt builder exist"_ — NOT M5a-001. This is correct: CONSTRAINTS.md injection is a `ContextAssembler` change, independent of the engineer agent spec. M5a-004 can execute in parallel with M5a-001.

---

## Blocking Gaps

Three issues would block a clean implementation:

1. **C1 + C2:** The `AgentSpecSchema` has single `taskInstruction` and `outputFormat` fields, but the engineer agent needs per-column variants for IMPLEMENTATION and CODE_REVIEW. Without explicit guidance to concatenate with section headers, the implementer will produce invalid YAML or misuse the schema. `outputFormat` is entirely absent from the task — the produced YAML will fail schema validation.

2. **H1 + M1:** If this is a dogfood ticket (per action plan), the task needs pipeline steps, and dependencies must include the IMPLEMENTATION column spec (M5a-000). Without M5a-000, `aeos ticket run` fails immediately.

3. **X1:** M5a-002 expects to update `outputFormat` in `engineer-agent.yaml`, but M5a-001 doesn't create one. The downstream task cannot execute as designed.

---

## Recommendations Summary

| # | Severity | Finding | Action |
|---|----------|---------|--------|
| C1 | Critical | `taskInstruction` single string; task implies two | Rewrite items 4–5: concatenate with section headers per M4-001 pattern |
| C2 | Critical | `outputFormat` entirely missing from task | Add item: inline template content for both columns |
| H1 | Major | Method "Agentic implementation" ≠ action plan "Dogfood" | Change to Dogfood; update steps per M4-001 amended pattern |
| M1 | Medium | Dependencies incomplete — missing M5a-000, M5b-000, M2-013 | Expand dependency list |
| M2 | Medium | `context_scope` has no schema field | Note scope is informational; embed in systemPrompt |
| M3 | Medium | Missing `role: worker` | Add to item 1 and ACs |
| M4 | Medium | Context scope omits full codebase index | Add to context scope list |
| m1 | Minor | No Technical Notes section | Add hints about schema limitations |
| m2 | Minor | DoD minimal — no pipeline/reviewer | Expand per M4-001 amended pattern |
| m3 | Minor | Missing `name` field guidance | Add `name: engineer-agent` |
| m4 | Minor | ACs incomplete vs amended M4-001 | Add role, taskInstruction, outputFormat checks |
| m5 | Minor | Model differs from system design example | No action (intentional) |
| X1 | Cross-task | M5a-002 expects `outputFormat` to exist | Resolve via C2 |
| X2 | Cross-task | Rubric filename alignment M5a-000 vs M5a-003 | Verify actual committed filename |
| X3 | Cross-task | M5a-004 independent of M5a-001 | ✅ Correct — no issue |

---

## Proposed Amendments

### 1. Fix Method and update header (H1)

```markdown
**Method:** Dogfood — run through AEOS pipeline
```

### 2. Rewrite "What needs to be done" (C1, C2, M2, M3, m3)

```markdown
## What needs to be done
1. Create ticket: `aeos ticket create "Engineer agent system prompt and context scope"` → AEOS-9
2. Fill in `.aeos/tickets/AEOS-9/AEOS-9-ticket.md`:
   - Goal: define the engineer agent's system prompt, context scope, task instruction, output format, and self-verification checklist
   - Output: `engineer-agent.yaml` conforming to `AgentSpecSchema`
3. Create `.aeos/agents/engineer-agent.yaml` conforming to `AgentSpecSchema`
4. Set `name: engineer-agent`, `role: worker`
5. `systemPrompt`: describe reasoning about code structure, dependency management, test coverage, incremental delivery. Embed context scope description (ticket.md, PRD, spike, tech-spec, CONSTRAINTS.md, full codebase index). Context scope is informational — `AgentSpecSchema` does not have a `contextScope` field in v1. Document the intended scope in the `systemPrompt`. The `ContextAssembler` handles actual injection.
6. `taskInstruction`: single multi-line YAML string containing guidance for BOTH columns, separated by clear headers (`### When running in IMPLEMENTATION` / `### When running in CODE_REVIEW`). The `AgentSpecSchema` has one `taskInstruction` field — both are concatenated.
   - IMPLEMENTATION: produce an implementation plan with ordered steps, file changes, and test plan
   - CODE_REVIEW: review code diffs for correctness, style, and alignment with tech spec
7. `outputFormat`: single multi-line YAML string with inline template content for both columns, separated by section headers (`### IMPLEMENTATION output` / `### CODE_REVIEW output`). `PromptBuilder` treats `outputFormat` as inline text, not a file path. M5a-002 and M5b-002 will update this field later.
8. `selfVerificationChecklist`: ≥ 3 items covering plan completeness and spec alignment
9. Set `executor.type: claude-cli`, `executor.model: claude-sonnet-4-20250514`
```

### 3. Expand Acceptance Criteria (m4)

```markdown
## Acceptance Criteria
- [ ] `engineer-agent.yaml` exists at `.aeos/agents/engineer-agent.yaml`
- [ ] Parsed with `AgentSpecSchema` — no ZodError
- [ ] `role` is set to `worker`
- [ ] `systemPrompt` describes reasoning about implementation tradeoffs
- [ ] `taskInstruction` contains guidance for both IMPLEMENTATION and CODE_REVIEW columns with clear section headers
- [ ] `outputFormat` contains inline template content for both columns
- [ ] `selfVerificationChecklist` contains ≥ 3 items
```

### 4. Expand Dependencies (M1)

```markdown
## Dependencies
- M4 complete (architect agent and templates working)
- M5a-000: `implementation.yaml` column spec (AEOS-9 transits IMPLEMENTATION)
- M5b-000: `code-review.yaml` column spec (engineer agent serves CODE_REVIEW)
- M2-013: `reviewer-agent.yaml` exists
```

### 5. Add Technical Notes (m1)

```markdown
## Technical Notes / Hints
- `AgentSpecSchema` has single `taskInstruction` and `outputFormat` fields. The engineer agent serves two columns (IMPLEMENTATION, CODE_REVIEW). Concatenate both column-specific instructions into one field with section headers.
- `PromptBuilder` treats `outputFormat` as inline text, not a file path. Template content must be inlined as a multi-line YAML string. M5a-002 and M5b-002 will update this field later.
- `context_scope` is not a schema field in v1. Document intended scope in `systemPrompt`. `ContextAssembler` handles actual injection.
- The IMPLEMENTATION (`implementation.yaml`) and CODE_REVIEW (`code-review.yaml`) column specs must exist before AEOS-9 reaches those columns.
```

### 6. Expand Definition of Done (m2)

```markdown
## Definition of Done
- [ ] `engineer-agent.yaml` committed and schema-valid
- [ ] AEOS-9 ticket reaches DONE (transits through pipeline columns successfully)
- [ ] Reviewer agent signs off on the produced artifact
```

---

## Summary

| Category | Count |
|----------|-------|
| Critical | 2 |
| Major | 1 |
| Medium | 4 |
| Minor | 5 |
| Cross-task | 3 (1 issue, 1 to verify, 1 confirmed OK) |

**Overall:** The task correctly identifies the engineer agent's purpose, columns, and context scope, and aligns with the system design's agent roster (§5.2). However, it has NOT absorbed the amendments applied to the identical M4-001 task after its review — the same critical issues (single `taskInstruction`/`outputFormat` fields for a dual-column agent) and major method mismatch exist here. Most critically, `outputFormat` is entirely absent from the task, meaning the produced YAML will fail schema validation. The recommended amendments bring M5a-001 to parity with the amended M4-001 template. No source code changes are required — all fixes are task-file amendments.
