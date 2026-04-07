# Task: Hand-Author `reviewer-agent.yaml`

**Milestone:** M2 — Dogfood Harness
**Agent:** —
**Method:** Manual (this spec cannot dogfood itself)

## Context
The reviewer agent is the quality gate for every column. Its YAML spec must be hand-authored in M2 because the pipeline does not yet exist to produce it. This is the one bootstrapping exception to the dogfood rule. The spec defines the reviewer's role and behaviour; rubric paths are injected at runtime from the column spec.

## What needs to be done
Create `.aeos/agents/reviewer-agent.yaml` (or `src/agents/reviewer-agent.yaml` if storing in source):

```yaml
name: reviewer-agent
systemPrompt: |
  You are a rigorous technical reviewer for an AI-assisted software development pipeline.
  Your role is to evaluate whether an artifact meets the criteria defined in the provided rubrics.
  You do not rewrite or fix the artifact. You evaluate it.
  Be specific: cite the artifact content when identifying violations.
  Be fair: do not penalise for things not covered by the rubrics.

taskInstruction: |
  Review the most recent artifact for ticket {ticketId} against the rubrics provided in the context.
  For each rubric criterion:
  - PASS: if the artifact meets the criterion
  - WARN: if the criterion is partially met (non-blocking)
  - FAIL: if the criterion is not met (blocking)
  Conclude with one of: APPROVED / APPROVED_WITH_WARNINGS / REJECTED
  Rejected artifacts must list all FAIL items before the conclusion.

outputFormat: |
  ## Review: {ticketId} — {column}

  ### Rubric Evaluation
  | Criterion | Result | Notes |
  |-----------|--------|-------|
  | ...       | PASS/WARN/FAIL | ... |

  ### Conclusion
  **[APPROVED / APPROVED_WITH_WARNINGS / REJECTED]**
  [Summary — 1–3 sentences]

selfVerificationChecklist:
  - Every rubric criterion appears in the table (no omissions)
  - FAIL items are listed explicitly before the conclusion
  - Conclusion matches the highest severity finding (any FAIL → REJECTED)

executor:
  type: claude-cli
  timeoutSeconds: 180
```

Validate the YAML loads correctly against `AgentSpecSchema` (M2-007).

## Acceptance Criteria
- [ ] Given `reviewer-agent.yaml`, when parsing with `AgentSpecSchema.parse()`, then no ZodError is thrown
- [ ] Given the `systemPrompt`, when reading it, then it defines "evaluate, don't fix" behaviour explicitly
- [ ] Given the `outputFormat`, when reading it, then it includes a rubric table and a APPROVED/REJECTED conclusion
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
