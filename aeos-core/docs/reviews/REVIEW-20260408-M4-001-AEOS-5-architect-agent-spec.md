# Review: M4-001 — AEOS-5 Architect Agent System Prompt and Context Scope

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Task file:** `docs/tasks/M4-001-AEOS-5-architect-agent-spec.md`
**Cross-referenced against:**
- `docs/03-system-design.md` (System Design v0.3)
- `docs/02-prd.md` (PRD v0.1)
- `docs/05-action-plan-v1.md` (Action Plan)
- Sibling tasks: M3-001 (pm-agent), M4-002–004 (spike template, tech-spec rubric, tech-spec template), M5a-001 (engineer-agent), M6-002 (qa-agent)
- Column spec tasks: M4-000a (arch-spike), M4-000b (tech-spec)
- Source code: `src/infrastructure/spec-loader/schemas.ts`, `src/domain/model/agent-spec.ts`

---

## Verdict: APPROVE WITH REQUIRED CHANGES

Two critical schema-level issues that will block implementation if not resolved, plus multiple medium and minor findings.

---

## Critical Issues

### 🔴 C1: `taskInstruction` is a single string in `AgentSpecSchema` — task requires two

**Task item 4:** _"Define separate `taskInstruction` sections for ARCH_SPIKE (spike document) and TECH_SPEC (full technical specification) use cases."_

The implemented `AgentSpecSchema` (`src/infrastructure/spec-loader/schemas.ts` line 30) defines:
```typescript
taskInstruction: z.string().min(1),
```

This is a **single string field**. The architect agent serves two columns (ARCH_SPIKE and TECH_SPEC), each requiring different task instructions. The schema has no mechanism for per-column task instructions — no map, no array, no conditional.

**Impact:** The implementer cannot fulfill item 4 as written. Either:
- (a) The `taskInstruction` must contain both instructions concatenated (messy, the agent must self-select based on context — unreliable), or
- (b) The `AgentSpecSchema` must be extended to support per-column task instructions (e.g., `taskInstructions: Record<string, string>`), or
- (c) Two separate agent YAML files must be created — one per column (contradicts system design §5.2 which lists one `architect-agent`), or
- (d) The column spec must carry the task instruction (aligning with the system design §5.4 where the column spec is "the single source of truth for what happens in a column").

**Note:** M5a-001 (engineer agent) has the same problem — items 4 and 5 define separate `taskInstruction` for IMPLEMENTATION and CODE_REVIEW.

**Recommendation:** Option (a) is the only option that works with the current schema. The task should explicitly state that both instructions are concatenated into a single `taskInstruction` string with clear section headers (e.g., `### ARCH_SPIKE` / `### TECH_SPEC`). Alternatively, extend the schema — but that is a separate task.

### 🔴 C2: `outputFormat` is also a single string — but AEOS-6 and AEOS-8 expect per-column templates

**Task item 4 + siblings M4-002 (line 4) and M4-004 (line 4):** AEOS-6 says _"Update `architect-agent.yaml` `outputFormat` to reference `spike-template.md` for ARCH_SPIKE column."_ AEOS-8 says _"Update `architect-agent.yaml` `outputFormat` to reference `tech-spec-template.md` for TECH_SPEC column."_

The `AgentSpecSchema` has:
```typescript
outputFormat: z.string().min(1),
```

One string. The architect agent needs **two different output formats** — one for spikes, one for tech specs. The same single-field problem as C1.


Additionally, M3-003's review flagged that `PromptBuilder` treats `outputFormat` as **inline text, not a file path**. Setting `outputFormat` to `"spike-template.md"` will inject the literal string `"spike-template.md"` into the prompt — not the file contents. This affects M4-002 and M4-004's design.

**Impact:** Even if the single-field problem is solved, the downstream sibling tasks (AEOS-6, AEOS-8) cannot update `outputFormat` to reference a template file until a template resolver is built. Same gap as M3-003 flagged for the PM agent.

**Recommendation:** For now, follow the M3-003 pattern — inline template content directly in `outputFormat` as a multi-line YAML string. Acknowledge the multi-column problem: either (a) concatenate both templates with section headers, or (b) extend the schema. Document this constraint in the task.

---

## Major Issues

### ⚠️ H1: Method mismatch — task says "Agentic implementation", action plan says "Dogfood"

**Task header:** `Method: Agentic implementation`
**Action plan §M4:** _"Method: Dogfood."_ and _"Tickets to run through pipeline: **AEOS-5** — Architect agent system prompt and context scope"_

The action plan explicitly states M4 tickets are dogfood tickets run through the AEOS pipeline. The task file says "Agentic implementation" — which implies a direct agent invocation, not a pipeline run. By contrast:
- M3-001 (PM agent spec): `Method: Dogfood — run through AEOS pipeline` ✅ matches action plan
- M3-002 (PRD rubric): `Method: Dogfood — run through AEOS pipeline` ✅ matches action plan
- M3-003 (PRD template): `Method: Dogfood — run through AEOS pipeline` ✅ matches action plan

M4-001 is the **only** agent spec task that breaks this pattern.

**Impact:** If this IS a dogfood ticket, the dependency list is incomplete (see M1 below). If this is NOT a dogfood ticket, it contradicts the action plan's core principle: _"We use the pipeline to build the pipeline."_

**Recommendation:** Change to `Method: Dogfood — run through AEOS pipeline` to match the action plan and sibling tasks. Update the "What needs to be done" section to follow M3-001's pattern (create ticket, fill description, run, review, approve).

---

## Medium Issues

### ⚠️ M1: Dependencies are incomplete for a dogfood ticket

**Task Dependencies section:** _"M3 complete (all M3 tickets done, PM agent working)"_

If this is a dogfood ticket (per action plan), AEOS-5 must transit from BACKLOG through PRODUCT_SCOPING → ARCH_SPIKE (minimum). This requires:
- M3 complete (PRODUCT_SCOPING column works) — ✅ listed
- M4-000a: `architecture-spike.yaml` column spec — ❌ **not listed**
- M2-013: `reviewer-agent.yaml` — ❌ **not listed** (implicit via M3, but M3-001 listed it explicitly)

M3-001 (PM agent) lists explicit dependencies including M2-013 and the bootstrap column spec. M4-001 is less specific.

**Recommendation:** Expand Dependencies to:
```
- M3 complete (all M3 tickets done, PM agent working)
- M4-000a: `architecture-spike.yaml` column spec (AEOS-5 transits ARCH_SPIKE)
- M2-013: `reviewer-agent.yaml` exists (used by reviewer in all columns)
```

### ⚠️ M2: `context_scope` described but not representable in `AgentSpecSchema`

**Task item 2:** _"The architect agent's context scope: ticket.md, PRD artifact from PRODUCT_SCOPING, CONSTRAINTS.md"_

The `AgentSpecSchema` has **no `contextScope` field**. The M2-007 review (m2) noted: _"AgentSpecSchema missing `context_scope`... Deferred to v2; no action."_ The `ContextAssembler` in v1 always includes all available context regardless of what the agent spec says.

The task describes context scope as a design intent but has no schema field to store it. The implementer may try to add it to the YAML and get a ZodError (though the current schema uses `.object()` not `.strict()`, so unknown fields are silently stripped rather than rejected).

**Recommendation:** Add a note: _"Context scope is informational — `AgentSpecSchema` does not have a `contextScope` field in v1. Document the intended scope in the `systemPrompt` (e.g., 'You have access to: ticket.md, the PRD from PRODUCT_SCOPING, and CONSTRAINTS.md'). The ContextAssembler handles actual injection."_

### ⚠️ M3: Missing `role: worker` in task requirements

Task item 1 says the YAML must conform to `AgentSpecSchema` but does not mention setting `role: worker`. The `AgentSpecSchema` has an optional `role: z.enum(['worker', 'reviewer'])` field. Sibling `reviewer-agent.yaml` (M2-013) sets `role: reviewer`. The M2-013 review explicitly recommended adding `role: reviewer` for consistency.

All sibling agent spec tasks (M5a-001, M6-002) also omit `role`. This should be specified for consistency and for future code that might filter agents by role.

**Recommendation:** Add to item 1: _"Set `role: worker`."_

---

## Minor Issues

### m1: Acceptance criteria format inconsistent with M3-001 sibling

M3-001 (PM agent spec) uses Given/When/Then format. M4-001 uses a simpler checklist. M5a-001 and M6-002 match M4-001's simpler format, so this has become the new convention. Not blocking.

### m2: No "Technical Notes / Hints" section

M3-001 includes a "Technical Notes / Hints" section with bootstrapping guidance. M4-001 has none. Given C1/C2 above (schema limitations), hints would be especially valuable here.

**Recommendation:** Add a Technical Notes section covering: (1) the single `taskInstruction`/`outputFormat` constraint, (2) that `PromptBuilder` treats `outputFormat` as inline text.

### m3: Definition of Done is minimal compared to M3-001

M3-001's DoD includes pipeline stages: _"AEOS-1 ticket reaches DONE (BACKLOG → PRODUCT_SCOPING → SIGNED_OFF → approved)"_ and reviewer conclusion. M4-001's DoD is just: _"`architect-agent.yaml` committed and schema-valid."_ If this is a dogfood ticket, the DoD should include pipeline completion and reviewer sign-off.

### m4: `executor.model` value diverges from system design example

Task: `executor.model: claude-sonnet-4-20250514`. System design §5.1 example: `model: claude-opus-4-6`. This is consistent with all other agent spec tasks (M5a-001, M6-002) and the reviewed `reviewer-agent.yaml`, all of which use `claude-sonnet-4-20250514`. The system design example appears outdated. Not blocking.

### m5: Context scope omits codebase index

System design §8.1 specifies PREPARE agents receive "Codebase index (high-level)". Task item 2 lists only ticket.md, PRD, and CONSTRAINTS.md — omitting the codebase index. May be intentional since `ContextAssembler` handles injection regardless, but should be noted for completeness.

---

## Correctness vs System Design

| Aspect | Task | System Design | Verdict |
|--------|------|---------------|---------|
| Agent name | `architect-agent` | §5.2: `architect-agent` | ✅ Match |
| Role | Worker (implicit) | §5.2: worker | ⚠️ Not explicit — see M3 |
| Phase | PREPARE | §5.2: PREPARE | ✅ Match |
| Columns served | ARCH_SPIKE + TECH_SPEC | §5.2: "Spikes technical options; produces tech spec" | ✅ Match |
| Context scope | ticket.md, PRD, CONSTRAINTS.md | §8.1: PREPARE gets ticket + PLAN artifacts + CONSTRAINTS.md + codebase index | ⚠️ Omits codebase index |
| Executor type | `claude-cli` | §4.2: `claude-code-cli` | ⚠️ Known deviation (M2-007 review) |
| Model | `claude-sonnet-4-20250514` | §4.2 example: `claude-opus-4-6` | ⚠️ Intentional (all agents use sonnet) |
| Self-verification | ≥ 3 items | §4.4: `[SELF-VERIFICATION]` section in prompt | ✅ Consistent |

---

## File Path Alignment with Hexagonal Scaffold

| Referenced Path / Component | Exists in `src/` | Notes |
|----------------------------|-----------------|-------|
| `AgentSpecSchema` | `src/infrastructure/spec-loader/schemas.ts` (line 26) | ✅ |
| `AgentSpec` interface | `src/domain/model/agent-spec.ts` | ✅ |
| `YamlAgentSpecLoader` | `src/infrastructure/spec-loader/yaml-agent-spec-loader.adapter.ts` | ✅ |
| `AgentSpecLoader` port | `src/domain/ports/driven/agent-spec-loader.port.ts` | ✅ |
| `AgentSpecNotFoundError` | `src/shared/errors.ts` | ✅ |
| Runtime target: `.aeos/agents/architect-agent.yaml` | N/A (runtime file) | ✅ Consistent with M2-013, M3-001 pattern |

All source references resolve correctly. No phantom paths.

---

## Dependency Validation

| Dependency | Status | Verified |
|-----------|--------|----------|
| M3 complete | ⬜ In progress | M3-002, M3-003, M3-004 still in `docs/tasks/` (not archived) |
| M4-000a (implicit) | ✅ Complete | Archived; review exists at `REVIEW-20260408-M4-000a` |
| M4-000b (implicit) | ✅ Complete | Archived; review exists at `REVIEW-20260408-M4-000b` |
| M2-013 (implicit) | ✅ Complete | Archived; review exists at `REVIEW-20260407-M2-013` |

**Note:** The task's only listed dependency (M3 complete) appears not yet met — M3-002 through M3-004 are still in `docs/tasks/` (not archived). This doesn't affect the task spec quality, only execution timing.

---

## Consistency with Sibling Tasks

| Sibling | Pattern Match | Notes |
|---------|--------------|-------|
| M3-001 (pm-agent) | ⚠️ Partial | M3-001 has Given/When/Then ACs, Technical Notes, explicit deps, dogfood method |
| M5a-001 (engineer-agent) | ✅ Identical format | Same structure, same C1 problem (dual `taskInstruction`) |
| M6-002 (qa-agent) | ✅ Identical format | Same structure; QA agent serves one column so C1 doesn't apply |
| M2-013 (reviewer-agent) | ✅ Consistent | Hand-authored (M2 bootstrap); full YAML inline — different context |

M4-001 is template-consistent with M5a-001 and M6-002 (the post-M3 agent spec tasks). It is less detailed than M3-001 (the first agent spec, with more bootstrapping guidance).

---

## Blocking Gaps

Two issues would block a clean implementation:

1. **C1 + C2:** The `AgentSpecSchema` has single `taskInstruction` and `outputFormat` fields, but the architect agent needs per-column variants. Without guidance on how to handle this, the implementer will either produce invalid YAML, create two separate agent files (not intended), or concatenate instructions into one string (works but needs explicit direction).

2. **H1:** If this is a dogfood ticket (per action plan), the task needs pipeline-aware steps (create ticket, run, approve) and the dependencies must include column specs. If it's NOT a dogfood ticket, it contradicts the action plan.

---

## Recommendations Summary

| # | Severity | Finding | Action |
|---|----------|---------|--------|
| C1 | Critical | `taskInstruction` is single string; task requires two | Add guidance: concatenate both with section headers |
| C2 | Critical | `outputFormat` is single string; siblings expect per-column templates | Add guidance: inline content; acknowledge limitation |
| H1 | Major | Method "Agentic implementation" ≠ action plan "Dogfood" | Change to Dogfood; update steps per M3-001 |
| M1 | Medium | Dependencies incomplete for dogfood ticket | Add M4-000a and M2-013 |
| M2 | Medium | `context_scope` has no schema field | Note scope is informational; embed in systemPrompt |
| M3 | Medium | Missing `role: worker` | Add to item 1 |
| m1 | Minor | AC format differs from M3-001 | No action (new convention) |
| m2 | Minor | No Technical Notes section | Add hints about schema limitations |
| m3 | Minor | DoD minimal vs M3-001 | Expand if dogfood method adopted |
| m4 | Minor | Model differs from system design example | No action (intentional) |
| m5 | Minor | Context scope omits codebase index | Note for completeness |

---

## Proposed Amendments

### 1. Fix Method and update steps (H1)

```markdown
**Method:** Dogfood — run through AEOS pipeline

## What needs to be done
1. Create ticket: `aeos ticket create "Architect agent system prompt and context scope"` → AEOS-5
2. Fill in `.aeos/tickets/AEOS-5/AEOS-5-ticket.md`:
   - Goal: define the architect agent's system prompt, context scope, task instruction, output format, and self-verification checklist
   - Output: `architect-agent.yaml` conforming to `AgentSpecSchema`
3. Create `.aeos/agents/architect-agent.yaml` conforming to `AgentSpecSchema`
4. Set `role: worker`
5. `taskInstruction`: single multi-line YAML string containing guidance for BOTH columns, separated by clear headers (`### When running in ARCH_SPIKE` / `### When running in TECH_SPEC`). The AgentSpecSchema has one `taskInstruction` field — both are concatenated.
6. `systemPrompt`: describe reasoning about technology choices, system boundaries, scalability tradeoffs, testability. Embed context scope description (ticket.md, PRD, CONSTRAINTS.md, codebase index).
7. `selfVerificationChecklist`: ≥ 3 items covering technical correctness and constraint adherence
8. Set `executor.type: claude-cli`, `executor.model: claude-sonnet-4-20250514`
```

### 2. Add Technical Notes section

```markdown
## Technical Notes / Hints
- `AgentSpecSchema` has single `taskInstruction` and `outputFormat` fields. The architect agent serves two columns (ARCH_SPIKE, TECH_SPEC). Concatenate both column-specific instructions into one field with section headers.
- `PromptBuilder` treats `outputFormat` as inline text, not a file path. Template content must be inlined as a multi-line YAML string. AEOS-6 and AEOS-8 will update this field later.
- `context_scope` is not a schema field in v1. Document intended scope in `systemPrompt`. `ContextAssembler` handles actual injection.
- The ARCH_SPIKE (`architecture-spike.yaml`) and TECH_SPEC (`tech-spec.yaml`) column specs must exist before AEOS-5 reaches those columns.
```

### 3. Expand Dependencies

```markdown
## Dependencies
- M3 complete (all M3 tickets done, PM agent working)
- M4-000a: `architecture-spike.yaml` column spec (AEOS-5 transits ARCH_SPIKE)
- M4-000b: `tech-spec.yaml` column spec (AEOS-5 transits TECH_SPEC)
- M2-013: `reviewer-agent.yaml` exists
```

---

## Summary

| Category | Count |
|----------|-------|
| Critical | 2 |
| Major | 1 |
| Medium | 3 |
| Minor | 5 |

**Overall:** The task correctly identifies the architect agent's purpose and aligns with the system design's agent roster. However, two critical schema-level issues (`taskInstruction` and `outputFormat` are single strings but the agent serves two columns) will block implementation without guidance. The method mismatch with the action plan (agentic vs dogfood) is a major finding that affects the dependency chain and execution approach. These issues are addressable with task amendments — no code changes required. The same `taskInstruction` single-field problem also affects M5a-001 (engineer agent) and should be propagated as a finding there.