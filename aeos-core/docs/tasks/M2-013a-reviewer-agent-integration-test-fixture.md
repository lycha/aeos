# Task: Fix reviewer-agent.yaml Integration Tests for CI

**Milestone:** M2 — Agent & Column Spec Loading
**Agent:** — (manual fix)
**Method:** Manual
**Priority:** High — blocks CI green

## Context
The `reviewer-agent.yaml integration` test suite in `yaml-agent-spec-loader.adapter.test.ts` loads the actual `.aeos/agents/reviewer-agent.yaml` from the repo root. This file exists only on developer machines (`.aeos/` is not tracked in git). All 8 tests in this describe block fail in CI with `ProjectRootNotFoundError: No .aeos/ directory found in any parent directory`.

## What needs to be done
Replace the `repoRoot`-based file lookup with an inline fixture written to a temp directory, matching the project's existing test pattern (`fs.mkdtempSync` + cleanup in `afterEach`).

### Changes to `src/infrastructure/spec-loader/yaml-agent-spec-loader.adapter.test.ts`

1. Add a `REVIEWER_AGENT_YAML` constant containing the full `reviewer-agent.yaml` content as a string literal (copied from `.aeos/agents/reviewer-agent.yaml`).

2. Replace the `reviewer-agent.yaml integration` describe block:
   - Remove `const repoRoot = path.resolve(...)` (line 123)
   - Add `let tmpDir: string` 
   - Add `beforeEach` that creates `tmpDir` via `fs.mkdtempSync`, creates `.aeos/agents/` inside it, and writes `REVIEWER_AGENT_YAML` to `.aeos/agents/reviewer-agent.yaml`
   - Add `afterEach` that cleans up `tmpDir` via `fs.rmSync`
   - Update all `loader.load('agents/reviewer-agent.yaml', repoRoot)` calls to use `tmpDir` instead of `repoRoot`

3. Remove the `fileURLToPath` import from `node:url` (no longer needed — was only used by the integration block to resolve `repoRoot`).

### Fixture content
Use the current `reviewer-agent.yaml` content verbatim:

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

## Acceptance Criteria
- [ ] All 8 `reviewer-agent.yaml integration` tests pass in CI (no `.aeos/` directory required)
- [ ] Tests still validate the same assertions (name, role, systemPrompt, outputFormat, selfVerificationChecklist, executor fields)
- [ ] No `fileURLToPath` import remains (unless used elsewhere in the file)
- [ ] Test follows existing project pattern: `mkdtempSync` + `afterEach` cleanup

## Dependencies
- M2-013: `reviewer-agent.yaml` spec ✅ complete

## Blocks
- CI green status
