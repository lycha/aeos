# Task: Create `qa.yaml` Column Spec

**Milestone:** M6 — QA Agent + DoD Gate
**Agent:** — (manual bootstrapping)
**Method:** Manual — prerequisite for QA column tickets

## Context
The QA column cannot run without a column spec file. `aeos ticket run` loads `.aeos/column-specs/qa.yaml` via `YamlColumnSpecLoader` and fails with `ColumnSpecNotFoundError` if the file is missing. The QA agent (produced by AEOS-16) drives this column. It reads implementation notes and code review artifacts and produces a QA report.

## What needs to be done
Create `.aeos/column-specs/qa.yaml` with the following content:

```yaml
column: QA
phase: DEPLOY
workerAgentFile: agents/qa-agent.yaml
reviewerAgentFile: agents/reviewer-agent.yaml
outputArtifact: qa-report.md
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
- `workerAgentFile` references `qa-agent.yaml` — the output of AEOS-16.
- `reviewerRubrics` starts empty. After AEOS-18 (QA structure rubric) is complete, update to:
  ```yaml
  reviewerRubrics:
    - rubrics/structure/qa-report-structure.md
    - rubrics/drift/intent-drift.md
  ```
- Worker output artifact is `qa-report.md` per system design Section 2.2.
- Phase is `DEPLOY` per system design agent roster (Section 5.2).
- Create `.aeos/agents/qa-agent.yaml` as a minimal placeholder (stub executor) before the first ticket enters the QA column.

## Acceptance Criteria
- [ ] File exists at `.aeos/column-specs/qa.yaml`
- [ ] `YamlColumnSpecLoader.load(Column.QA)` succeeds without error
- [ ] Parsed spec has `column: QA`, `phase: DEPLOY`, `outputArtifact: qa-report.md`
- [ ] Parsed spec has `preflight.enabled: true` and `preflight.questionsArtifact: questions.md`

## Dependencies
- M2-007: `ColumnSpecSchema` ✅ complete
- M2-008: `YamlColumnSpecLoader` ✅ complete
- M2-013: `reviewer-agent.yaml` ✅ complete

## Blocks
- M6-002 (AEOS-16): QA agent spec
