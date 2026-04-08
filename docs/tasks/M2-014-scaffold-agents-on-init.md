# Task: Scaffold Default Agent Specs During `project init`

**ID:** M2-014 _(reassigned — originally used by M2-014-claude-cli-smoke-test, now archived)_
**Milestone:** M2 — Agent & Column Spec Loading
**Agent:** — (manual)
**Method:** Manual
**Priority:** High — blocks CI (fixes reviewer-agent.yaml integration test failures)

## Context
`aeos project init` currently creates `.aeos/`, `project.json`, `.aeos/.git`, and `.aeos/column-specs/` (empty). Agent spec files like `reviewer-agent.yaml` only exist on developer machines, created manually. This means:
- Integration tests that load real agent specs fail in CI (`ProjectRootNotFoundError`)
- New users have no agent files to run tickets against
- The pipeline is unusable after init without manual file creation

`project init` should scaffold `.aeos/agents/` with all curated default agent specs so the pipeline is immediately usable.

## What needs to be done

### 1. Add `ensureAgentsDir` + `writeDefaultAgentSpecs` to `ProjectRepository` port

```typescript
// src/domain/ports/driven/project-repository.port.ts
export interface ProjectRepository {
  // ... existing methods ...
  /** Creates .aeos/agents/ directory */
  ensureAgentsDir(projectPath: string): void;
  /** Writes default agent spec YAML files to .aeos/agents/. Skips files that already exist (idempotent). */
  writeDefaultAgentSpecs(projectPath: string): void;
}
```

### 2. Implement in `FsProjectRepository`

- `ensureAgentsDir`: `fs.mkdirSync(path.join(projectPath, '.aeos', 'agents'), { recursive: true })`
- `writeDefaultAgentSpecs`: For each default agent spec, write the file only if it doesn't already exist (preserves user customisations on re-init).

### 3. Store default YAML content

Create `src/infrastructure/filesystem/defaults/agent-specs.ts` containing exported string constants for each agent spec:

| Constant | Filename | Content source |
|---|---|---|
| `REVIEWER_AGENT_YAML` | `reviewer-agent.yaml` | Current `.aeos/agents/reviewer-agent.yaml` (see below) |
| `PM_AGENT_STUB_YAML` | `pm-agent.yaml` | Stub agent (executor type: `stub`) — placeholder until AEOS-1 produces the real one |
| `ARCHITECT_AGENT_STUB_YAML` | `architect-agent.yaml` | Stub agent — placeholder until AEOS-5 |
| `ENGINEER_AGENT_STUB_YAML` | `engineer-agent.yaml` | Stub agent — placeholder until AEOS-9 |
| `QA_AGENT_STUB_YAML` | `qa-agent.yaml` | Stub agent — placeholder until AEOS-16 |

The reviewer agent is fully curated (M2-013). Worker agents start as stubs with meaningful `systemPrompt` and `taskInstruction` values but `executor.type: stub` — they'll be replaced by pipeline-produced specs.

> **Note:** `ensureAgentsDir` could be folded into `writeDefaultAgentSpecs` as an implementation detail (the way M2-015 handles column-specs). It is kept as a separate port method here for symmetry with `ensureColumnSpecsDir`, but implementors may inline it if preferred.

> **Note:** The system design §3.3 per-project layout does not currently list `.aeos/agents/`. The design doc should be updated to include this directory once this task lands.

### 4. Update `ProjectInitUseCase.execute()`

After step 3 (create column-specs dir), add:
```typescript
// 3b. Create agents/ directory and write default agent specs
this.projectRepo.ensureAgentsDir(cwd);
this.projectRepo.writeDefaultAgentSpecs(cwd);
```

Also add to the idempotent branch (when project already exists):
```typescript
this.projectRepo.ensureAgentsDir(cwd);
this.projectRepo.writeDefaultAgentSpecs(cwd); // fills any missing defaults
```

### 5. Update existing tests

- `project-init.use-case.test.ts`: Add `ensureAgentsDir` and `writeDefaultAgentSpecs` to mock, assert they are called. Also verify that any other test files mocking `ProjectRepository` (e.g. `ticket-run.use-case.test.ts`) are updated with the new methods.
- `yaml-agent-spec-loader.adapter.test.ts`: Convert agent-spec integration tests to self-contained `tmpDir` tests that run through the real `FsProjectRepository.writeDefaultAgentSpecs()` — validates that the defaults parse correctly. **Clarification (vs M2-016):** This task (M2-014) makes agent-spec integration tests self-contained via `tmpDir`. M2-016 covers any remaining column-spec integration tests that still need CI bootstrapping via `aeos project init`.

### 6. Reviewer agent YAML content (curated — M2-013)

```yaml
name: reviewer-agent
role: reviewer
systemPrompt: |
  You are a rigorous technical reviewer for an AI-assisted software development pipeline.
  Your role is to evaluate whether an artifact meets the criteria defined in the provided rubrics.
  You do not rewrite or fix the artifact. You evaluate it.
  Be specific: cite the artifact content when identifying violations.
  Be fair: do not penalise for things not covered by the rubrics.
taskInstruction: |
  Review the most recent artifact against the rubrics provided in the context.
  For each rubric criterion, evaluate whether the artifact meets it.
  If multiple rubrics are provided, evaluate each one as a separate section in your output.
  Output findings for any criterion that is NOT fully met:
  - INFO: observation, no action required
  - WARNING: should fix; non-blocking but tracked
  - BLOCKER: must fix; blocks advancement
  If all criteria are met with no findings, state APPROVED.
  If only INFO/WARNING findings exist, state APPROVED_WITH_WARNINGS.
  If any BLOCKER exists, state REJECTED and list all BLOCKERs.
outputFormat: |
  ## Review
  ### Findings
  #### BLOCKER
  - [BLOCKER] {description — cite artifact content}
  #### WARNING
  - [WARNING] {description}
  #### INFO
  - [INFO] {description}
  ### Conclusion
  **[APPROVED / APPROVED_WITH_WARNINGS / REJECTED]**
  [Summary — 1–3 sentences]
selfVerificationChecklist:
  - Every rubric criterion appears in the findings or is confirmed passing (no omissions)
  - BLOCKER items are listed explicitly before the conclusion
  - Verify that the conclusion matches the highest severity — if any BLOCKER exists, conclusion must be REJECTED
executor:
  type: claude-cli
  model: claude-sonnet-4-20250514
  timeoutSeconds: 180
```

### 7. Stub agent YAML template

All four stub agents (`pm-agent.yaml`, `architect-agent.yaml`, `engineer-agent.yaml`, `qa-agent.yaml`) must be schema-valid per `AgentSpecSchema`. Use the following template, replacing `{name}`, `{role}`, and `{description}` per agent:

```yaml
name: {name}
role: {role}
systemPrompt: |
  You are the {role} agent in the AEOS pipeline.
  {description}
  This is a stub agent — it will be replaced by a pipeline-produced spec.
taskInstruction: |
  This agent is not yet implemented. Return a placeholder acknowledgement
  that includes the input context summary.
outputFormat: |
  ## {role} Output
  **Status:** STUB — not yet implemented
  [Placeholder output]
selfVerificationChecklist:
  - Output includes a placeholder acknowledgement
executor:
  type: stub
```

| Agent | `{name}` | `{role}` | `{description}` |
|---|---|---|---|
| PM | `pm-agent` | `pm` | You gather requirements, write user stories, and define acceptance criteria. |
| Architect | `architect-agent` | `architect` | You design system architecture, define interfaces, and make technology decisions. |
| Engineer | `engineer-agent` | `engineer` | You implement features, write code, and follow architectural guidelines. |
| QA | `qa-agent` | `qa` | You write test plans, define test cases, and verify acceptance criteria. |

## Acceptance Criteria
- [ ] `aeos project init` creates `.aeos/agents/` directory
- [ ] `aeos project init` writes `reviewer-agent.yaml` with curated content
- [ ] `aeos project init` writes stub YAMLs for `pm-agent`, `architect-agent`, `engineer-agent`, `qa-agent`
- [ ] All written agent specs pass `AgentSpecSchema.parse()` without error
- [ ] Re-running `aeos project init` does NOT overwrite existing (user-customised) agent files
- [ ] `reviewer-agent.yaml integration` tests pass in CI

## Dependencies
- M1-002: `aeos project init` ✅ complete
- M2-007: `AgentSpecSchema` ✅ complete
- M2-013: `reviewer-agent.yaml` spec ✅ complete

## Blocks
- CI green status
- M2-015: scaffold default column specs on init (references `agents/pm-agent.yaml` in its scaffolded column spec YAML)

## Supersedes
- Supersedes the need for manual `.aeos/agents/reviewer-agent.yaml` setup in CI — init scaffolds the real file
