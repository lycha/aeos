# Task: Create `implementation.yaml` Column Spec

**Milestone:** M5a — Engineer Agent (Implementation Column)
**Agent:** — (manual bootstrapping)
**Method:** Manual — prerequisite for IMPLEMENTATION column tickets

## Context
The IMPLEMENTATION column cannot run without a column spec file. `aeos ticket run` loads `.aeos/column-specs/implementation.yaml` via `YamlColumnSpecLoader` and fails with `ColumnSpecNotFoundError` if the file is missing. The engineer agent (produced by AEOS-9) drives this column.

## What needs to be done
Create `.aeos/column-specs/implementation.yaml` with the following content:

```yaml
column: IMPLEMENTATION
phase: BUILD
workerAgentFile: agents/engineer-agent.yaml
reviewerAgentFile: agents/reviewer-agent.yaml
outputArtifact: implementation-notes.md
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
- `workerAgentFile` references `engineer-agent.yaml` — the output of AEOS-9.
- Create `.aeos/agents/engineer-agent.yaml` as a minimal placeholder (stub executor) before AEOS-9 runs the IMPLEMENTATION column.
- `reviewerRubrics` starts empty. After AEOS-11 (implementation structure rubric) is complete, update to:
  ```yaml
  reviewerRubrics:
    - rubrics/structure/implementation-structure.md
    - rubrics/drift/intent-drift.md
  ```
- Worker output artifact is `implementation-notes.md` per system design Section 2.2.
- The engineer agent produces a coding plan, not code itself (code is a side effect of the executor).

## Acceptance Criteria
- [ ] File exists at `.aeos/column-specs/implementation.yaml`
- [ ] `YamlColumnSpecLoader.load(Column.IMPLEMENTATION)` succeeds without error
- [ ] Parsed spec has `column: IMPLEMENTATION`, `phase: BUILD`, `outputArtifact: implementation-notes.md`
- [ ] Parsed spec has `preflight.enabled: true` and `preflight.questionsArtifact: questions.md`
- [ ] `aeos ticket run` no longer fails with `ColumnSpecNotFoundError` for IMPLEMENTATION

## Dependencies
- M2-007: `ColumnSpecSchema` ✅ complete
- M2-008: `YamlColumnSpecLoader` ✅ complete
- M2-013: `reviewer-agent.yaml` ✅ complete

## Blocks
- M5a-001 (AEOS-9): Engineer agent spec
