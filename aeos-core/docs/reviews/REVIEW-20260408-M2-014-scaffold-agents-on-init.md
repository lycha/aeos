# Review: M2-014 — Scaffold Default Agent Specs During `project init`

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Task file:** `docs/tasks/M2-014-scaffold-agents-on-init.md`
**Cross-referenced against:**
- `docs/03-system-design.md` (System Design v0.3)
- `docs/02-prd.md` (PRD v0.1)
- `docs/05-action-plan-v1.md` (Action Plan)
- Sibling tasks: M2-015, M2-016, M3-000 (archived), M2-013 (archived)
- Source code: `src/domain/ports/driven/project-repository.port.ts`, `src/infrastructure/filesystem/fs-project.repository.ts`, `src/application/project-init.use-case.ts`, `src/application/project-init.use-case.test.ts`, `src/infrastructure/spec-loader/schemas.ts`, `src/infrastructure/spec-loader/yaml-agent-spec-loader.adapter.test.ts`, `src/cli/container.ts`

---

## Verdict: APPROVE with findings

No blockers. Two medium issues, five minor issues, and one informational note.

---

## Critical Issues

_None._

---

## Major Issues

_None._

---

## Medium Issues

### ⚠️ M1: Task ID collision with archived M2-014 (Claude CLI smoke test)

The archive contains `docs/tasks/archive/M2-014-claude-cli-smoke-test.md` and a corresponding review at `docs/reviews/REVIEW-20260407-M2-014-claude-cli-smoke-test.md`. This new task reuses the `M2-014` identifier for an entirely different purpose (agent scaffolding vs smoke test). Anyone scanning task IDs will find two M2-014 tasks with different names and content.

**Recommendation:** Renumber this task (e.g., M2-017) or add a note to the archived M2-014 indicating it has been renumbered/retired and this ID was reassigned. The existing review file for the old M2-014 would otherwise create ambiguity.

### ⚠️ M2: Stale "Blocks" reference to M3-000

The Blocks section references `M3-000: product-scoping column spec (references agents/pm-agent.yaml)`. However, M3-000 is archived and has been superseded by M2-015 (which scaffolds all column specs on init). The M2-015 task explicitly states: `Supersedes: M3-000 (product-scoping column spec) — created by init`.

**Recommendation:** Update the Blocks section to reference M2-015 instead of M3-000, since M2-015 is the actual downstream consumer that references `agents/pm-agent.yaml` in its scaffolded column spec YAML.

---

## Minor Issues

### m1: `ensureAgentsDir` is arguably redundant

The task proposes two new port methods: `ensureAgentsDir` and `writeDefaultAgentSpecs`. The implementation of `writeDefaultAgentSpecs` will necessarily need to create `.aeos/agents/` before writing files. Compare with M2-015, which proposes only `writeDefaultColumnSpecs` (no separate `ensureColumnSpecsDir`) because `ensureColumnSpecsDir` already exists from M1-002.

The symmetry is understandable — `ensureColumnSpecsDir` already exists as a separate method. But `ensureAgentsDir` adds port surface area for what could be an internal implementation detail of `writeDefaultAgentSpecs`. Low risk either way.

### m2: System design §3.3 does not show `.aeos/agents/` directory

The per-project layout in system design §3.3 shows `.aeos/column-specs/` but does not include `.aeos/agents/`. The system design §5.1 describes agent specs conceptually but does not specify their filesystem location. This task introduces `.aeos/agents/` as a new convention. Not a blocker (the design doc is known-stale on several points), but the design doc should be updated.

### m3: Supersedes phantom reference `M2-013a`

The Supersedes section references `M2-013a (reviewer-agent integration test fixture)`. No task file with this ID exists anywhere in `docs/tasks/` or `docs/tasks/archive/`. The intent is clear — the integration tests currently dependent on the repo root having `reviewer-agent.yaml` will use scaffolded defaults instead — but the reference is to a nonexistent task.

**Recommendation:** Remove the "M2-013a" reference or rewrite as: _"Supersedes the need for manual `.aeos/agents/reviewer-agent.yaml` setup in CI — init scaffolds the real file."_

### m4: Test migration instruction partially overlaps with M2-016

Section 5 says: _"Replace `repoRoot`-based integration tests with `tmpDir` that runs through the real `FsProjectRepository.writeDefaultAgentSpecs()`"_. Meanwhile, M2-016 adds `aeos project init` to CI specifically so that `repoRoot`-based integration tests pass. If M2-014 replaces all `repoRoot` tests with `tmpDir` tests, M2-016's acceptance criterion ("All 14 tests in `yaml-agent-spec-loader.adapter.test.ts` pass in CI") becomes partially moot for agent spec tests. The two tasks should align — either tests are self-contained (tmpDir) or CI-bootstrapped (repoRoot), not both.

**Recommendation:** Clarify that M2-014 converts agent-spec integration tests to tmpDir (self-contained), and M2-016 covers any remaining column-spec integration tests that still need CI bootstrapping.

### m5: Stub agent YAML content not specified

The task defines the full reviewer-agent YAML (Section 6) but does not provide YAML content for the four stub agents (`pm-agent.yaml`, `architect-agent.yaml`, `engineer-agent.yaml`, `qa-agent.yaml`). It says they should have "meaningful `systemPrompt` and `taskInstruction` values" and `executor.type: stub`, but leaves the actual content unspecified. Given that all fields are validated by `AgentSpecSchema` (which requires non-empty `systemPrompt`, `taskInstruction`, `outputFormat`), the implementor needs to invent content.

**Recommendation:** Either provide stub YAML templates in the task or add a note that the implementor should create minimal but schema-valid stubs with descriptive placeholder text.

---

## Informational

### i1: `executor.type` naming — `claude-cli` vs system design's `claude-code-cli`

The reviewer-agent YAML uses `executor.type: claude-cli`. System design §4.2 uses `claude-code-cli`. This was already resolved as a deliberate simplification in M2-007's design notes, and the implemented `AgentSpecSchema` only accepts `claude-cli | stub`. The task is consistent with the codebase. Noting for completeness.

---

## Correctness vs System Design


| Aspect | Task | System Design | Code (AgentSpecSchema) | Verdict |
|--------|------|---------------|------------------------|---------|
| Agent spec location | `.aeos/agents/` | Not specified (§5.1 describes conceptually) | Loader resolves relative to `.aeos/` | ✅ Consistent with loader |
| Agent spec fields | `systemPrompt`, `taskInstruction`, `outputFormat`, `selfVerificationChecklist`, `executor` | `system_prompt`, `context_scope`, `input_spec`, `output_spec`, `model`, `self_verification` (§5.1) | camelCase fields per `AgentSpecSchema` | ✅ Task aligns with code; design doc is stale |
| Executor type | `claude-cli` | `claude-code-cli` (§4.2) | `z.enum(['claude-cli', 'stub'])` | ✅ Task aligns with code; design doc is stale |
| Executor model | `claude-sonnet-4-20250514` | `claude-opus-4-6` (§4.2) | `z.string().optional()` | ✅ Valid — model choice is per-agent |
| Agent roster | pm, architect, engineer, qa, reviewer | Same roster (§5.2) | N/A | ✅ Match |
| Reviewer agent — generic | Single reviewer, rubrics injected at runtime | One generic reviewer (§5.2) | N/A | ✅ Match |
| Idempotent init | Skip existing files | Idempotent init (§3.6) | `exists()` check in use case | ✅ Match |

---

## File Path Alignment with Hexagonal Scaffold

| Referenced Path | Exists in `src/` | Status |
|----------------|-----------------|--------|
| `src/domain/ports/driven/project-repository.port.ts` | ✅ | Methods to be added |
| `src/infrastructure/filesystem/fs-project.repository.ts` | ✅ | Implementation to be added |
| `src/infrastructure/filesystem/defaults/agent-specs.ts` | ❌ (new file) | New — correct layer (infrastructure/filesystem) |
| `src/application/project-init.use-case.ts` | ✅ | Use case to be modified |
| `src/application/project-init.use-case.test.ts` | ✅ | Tests to be updated |
| `src/infrastructure/spec-loader/yaml-agent-spec-loader.adapter.test.ts` | ✅ | Integration tests to be updated |
| `src/infrastructure/spec-loader/schemas.ts` (`AgentSpecSchema`) | ✅ | Used for validation |

The new file `src/infrastructure/filesystem/defaults/agent-specs.ts` is correctly placed in the infrastructure layer (filesystem adapter concern). M2-015 proposes a parallel `defaults/column-specs.ts` in the same location — consistent pattern.

---

## Dependency Validation

| Dependency | Status | Verified |
|-----------|--------|----------|
| M1-002: `aeos project init` | ✅ complete | `src/application/project-init.use-case.ts` exists; task in archive |
| M2-007: `AgentSpecSchema` | ✅ complete | `src/infrastructure/spec-loader/schemas.ts` lines 26-38 |
| M2-013: `reviewer-agent.yaml` | ✅ complete | Task in archive; YAML content matches task §6 |

No missing dependencies. All three are verified in the codebase.

---

## Consistency with Sibling Tasks

| Sibling | Consistent | Notes |
|---------|-----------|-------|
| M2-015 (scaffold column specs) | ✅ | Same pattern: port method → adapter impl → defaults file → use case update → test update. M2-015 depends on M2-014 and inserts its call after M2-014's call. |
| M2-016 (CI project init) | ⚠️ Partial | M2-016 runs `aeos project init` in CI to bootstrap spec files. M2-014 replaces repoRoot-based tests with tmpDir tests. The two approaches are complementary but the interaction should be clarified (see m4). |
| M2-013 (reviewer-agent.yaml, archived) | ✅ | M2-014's reviewer YAML content (§6) exactly matches the archived M2-013 content. |
| M3-000 (product-scoping column spec, archived) | ⚠️ Stale | M3-000 is superseded by M2-015 but still referenced in M2-014's Blocks section (see M2). |

---

## Port Interface Impact Analysis

The task adds two methods to `ProjectRepository`:

```typescript
ensureAgentsDir(projectPath: string): void;
writeDefaultAgentSpecs(projectPath: string): void;
```

**Downstream impact on existing mocks:**

| File | Mock needs update | Notes |
|------|------------------|-------|
| `src/application/project-init.use-case.test.ts` line 8-17 | ✅ Yes | `createMockProjectRepo()` must add both new methods |
| `src/application/ticket-run.use-case.test.ts` | ✅ Check | If it mocks `ProjectRepository`, needs new methods |
| `src/application/ticket-create.use-case.test.ts` | ❌ No | Does not use `ProjectRepository` |
| `src/cli/container.ts` line 52 | ❌ No | `FsProjectRepository` implements the interface — auto-inherits |

The task correctly identifies `project-init.use-case.test.ts` as needing updates. It should also verify that any other test files mocking `ProjectRepository` don't break.

---

## Blocking Gaps

No blocking gaps identified. The task can be executed as written. Key observations:

1. The `ProjectRepository` port extension is additive — no existing methods change.
2. The use case modification is straightforward — two new calls in both the fresh-init and idempotent branches.
3. The `defaults/agent-specs.ts` file is a new leaf module with no upstream dependencies.
4. The reviewer YAML content is already validated by the existing `AgentSpecSchema`.

The only coordination risk is with M2-015 (column specs), which must be implemented after M2-014 and adds its own call to the same use case method. The ordering is explicit in M2-015's dependency list.

---

## Summary

| Category | Count |
|----------|-------|
| Critical | 0 |
| Major | 0 |
| Medium | 2 |
| Minor | 5 |
| Informational | 1 |

**Overall:** The task is well-structured, correctly aligned with the implemented codebase, and follows hexagonal architecture conventions. The primary findings are: (1) a task ID collision with the archived M2-014 Claude CLI smoke test, which creates confusion in the task registry, and (2) a stale Blocks reference to superseded M3-000. The stub agent YAML content gap (m5) is the most likely source of implementation friction — the implementor will need to invent schema-valid content for four stub agents without a template. All other aspects — port design, file paths, dependency chain, use case integration, and test strategy — are sound.