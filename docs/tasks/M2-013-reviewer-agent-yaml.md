# Task: Hand-Author `reviewer-agent.yaml`

**Milestone:** M2 — Dogfood Harness
**Agent:** —
**Method:** Manual (this spec cannot dogfood itself)

## Context
The reviewer agent is the quality gate for every column. Its YAML spec must be hand-authored in M2 because the pipeline does not yet exist to produce it. This is the one bootstrapping exception to the dogfood rule. The spec defines the reviewer's role and behaviour; rubric paths are injected at runtime from the column spec.

## What needs to be done
Create `.aeos/agents/reviewer-agent.yaml` (UTF-8, LF line endings):

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

> **Note:** The conclusion vocabulary (APPROVED / APPROVED_WITH_WARNINGS / REJECTED) is free text in v1. For M3+, consider validating it programmatically via enum or string matching.

Validate the YAML loads correctly against `AgentSpecSchema` (M2-007).

## Acceptance Criteria
- [ ] Given `reviewer-agent.yaml`, when parsing with `AgentSpecSchema.parse()`, then no ZodError is thrown
- [ ] Given the `systemPrompt`, when reading it, then it defines "evaluate, don't fix" behaviour explicitly
- [ ] Given the `outputFormat`, when reading it, then it includes findings grouped by severity (BLOCKER/WARNING/INFO) and an APPROVED/REJECTED conclusion
- [ ] Given the `selfVerificationChecklist`, when reading it, then it contains at least 3 items
- [ ] Given `executor.type`, when reading it, then it is `"claude-cli"` (not stub)

## Out of Scope
- The rubric files referenced at runtime (produced by AEOS-2, AEOS-4 etc. in M3+)
- Iterating the reviewer quality (that happens during M3 as rubrics are built)

## Dependencies
- M2-007: `AgentSpecSchema` to validate the YAML against
- M2-008: `loadAgentSpec()` to confirm it loads correctly

## Definition of Done
- [ ] `reviewer-agent.yaml` exists and is valid YAML
- [ ] `AgentSpecSchema.parse(loadedYaml)` passes without error
- [ ] Confirmed in code review by at least one other person
- [ ] Committed to source control
