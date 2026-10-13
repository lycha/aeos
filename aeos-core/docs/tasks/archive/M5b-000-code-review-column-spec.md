# Task: Create `code-review.yaml` Column Spec

**Milestone:** M5b — Code Review Column
**Agent:** — (manual bootstrapping)
**Method:** Manual — prerequisite for CODE_REVIEW column tickets

## Context
The CODE_REVIEW column cannot run without a column spec file. `aeos ticket run` loads `.aeos/column-specs/code-review.yaml` via `YamlColumnSpecLoader` and fails with `ColumnSpecNotFoundError` if the file is missing. This column reviews the actual code diff (not a markdown artifact) — a distinct concern from IMPLEMENTATION which reviews the plan.

## What needs to be done
Create `.aeos/column-specs/code-review.yaml` with the following content:

```yaml
column: CODE_REVIEW
phase: BUILD
workerAgentFile: agents/engineer-agent.yaml
reviewerAgentFile: agents/reviewer-agent.yaml
outputArtifact: code-review.md
minWordCount: 50
requiredSections: []
reviewerRubrics: []
maxIterations: 3
escalation: escalate_to_human
advanceMode: manual
preflight:
  enabled: true
  questionsArtifact: questions.md
```

### Notes
- Uses the same `engineer-agent.yaml` as IMPLEMENTATION — the agent's behaviour is shaped by context and column spec, not a separate agent file. Adjust if a dedicated code-review agent is created.
- **Design clarification (§2.1 vs §2.2):** System design §2.1 labels Code Review as "(reviewer)", but §2.2 shows distinct worker and reviewer outputs (`code-review.md` and `code-review-signoff.md`), implying a two-agent model. The intent is that the engineer agent runs the code review pass (producing `code-review.md`) and the reviewer agent then signs off (producing `code-review-signoff.md`). §2.1 should be updated to label Code Review as "(eng agent + reviewer)" to match §2.2's two-output model.
- `reviewerRubrics` starts empty. After AEOS-13 (code structure rubric) is complete, update to:
  ```yaml
  reviewerRubrics:
    - rubrics/structure/code-structure.md
    - rubrics/drift/intent-drift.md
  ```
- Worker output artifact is `code-review.md` per system design Section 2.2.
- This column requires diff injection (AEOS-14) to function fully — the code diff must be available in context.

## Acceptance Criteria
- [ ] File exists at `.aeos/column-specs/code-review.yaml`
- [ ] `YamlColumnSpecLoader.load(Column.CODE_REVIEW)` succeeds without error
- [ ] Parsed spec has `column: CODE_REVIEW`, `phase: BUILD`, `outputArtifact: code-review.md`
- [ ] Parsed spec has `preflight.enabled: true` and `preflight.questionsArtifact: questions.md`

## Dependencies
- M2-007: `ColumnSpecSchema` ✅ complete
- M2-008: `YamlColumnSpecLoader` ✅ complete
- M2-013: `reviewer-agent.yaml` ✅ complete

## Blocks
- M5b-001 (AEOS-13): Code structure rubric
- M5b-002 (AEOS-14): Diff injection
