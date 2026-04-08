# Task: Create `tech-spec.yaml` Column Spec

**Milestone:** M4 — Architect Agent (Architecture Spike + Tech Spec Columns)
**Agent:** — (manual bootstrapping)
**Method:** Manual — prerequisite for TECH_SPEC column tickets

## Context
The TECH_SPEC column cannot run without a column spec file. `aeos ticket run` loads `.aeos/column-specs/tech-spec.yaml` via `YamlColumnSpecLoader` and fails with `ColumnSpecNotFoundError` if the file is missing. The architect agent (same as ARCH_SPIKE) drives this column but produces a different artifact.

## What needs to be done
Create `.aeos/column-specs/tech-spec.yaml` with the following content:

```yaml
column: TECH_SPEC
phase: PREPARE
workerAgentFile: agents/architect-agent.yaml
reviewerAgentFile: agents/reviewer-agent.yaml
outputArtifact: tech-spec.md
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
- Same `workerAgentFile` as ARCH_SPIKE — the architect agent handles both columns. The architect agent placeholder at `.aeos/agents/architect-agent.yaml` must exist before any TECH_SPEC column run. If M4-000a has already been executed, the placeholder will already be in place.
- `reviewerRubrics` starts empty. After AEOS-7 (tech spec rubric) is complete, update to:
  ```yaml
  reviewerRubrics:
    - rubrics/structure/tech-spec-structure.md
    - rubrics/drift/intent-drift.md
  ```
- Worker output artifact is `tech-spec.md` per system design Section 2.2 (`SAAS-1-tech-spec.md`).

## Acceptance Criteria
- [ ] File exists at `.aeos/column-specs/tech-spec.yaml`
- [ ] `YamlColumnSpecLoader.load(Column.TECH_SPEC)` succeeds without error
- [ ] Parsed spec has `column: TECH_SPEC`, `phase: PREPARE`, `outputArtifact: tech-spec.md`
- [ ] Parsed spec has `preflight.enabled: true` and `preflight.questionsArtifact: questions.md`

## Dependencies
- M2-007: `ColumnSpecSchema` ✅ complete
- M2-008: `YamlColumnSpecLoader` ✅ complete
- M2-013: `reviewer-agent.yaml` ✅ complete
- M4-000a: architecture-spike column spec (implicit — AEOS-5 transits ARCH_SPIKE before reaching TECH_SPEC)
- M4-001 (AEOS-5): Architect agent spec (produces `architect-agent.yaml`)

## Blocks
- M4-003 (AEOS-7): Tech spec rubric — also transits TECH_SPEC and updates this column spec's reviewerRubrics
- M4-004 (AEOS-8): Tech spec template — needs this column spec for tech spec column runs
