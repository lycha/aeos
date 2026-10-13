# Task: Create `architecture-spike.yaml` Column Spec

**Milestone:** M4 — Architect Agent (Architecture Spike + Tech Spec Columns)
**Agent:** — (manual bootstrapping)
**Method:** Manual — prerequisite for ARCH_SPIKE column tickets

## Context
The ARCH_SPIKE column cannot run without a column spec file. `aeos ticket run` loads `.aeos/column-specs/architecture-spike.yaml` via `YamlColumnSpecLoader` and fails with `ColumnSpecNotFoundError` if the file is missing. The architect agent (produced by AEOS-5) drives this column.

## What needs to be done
Create `.aeos/column-specs/architecture-spike.yaml` with the following content:

```yaml
column: ARCH_SPIKE
phase: PREPARE
workerAgentFile: agents/architect-agent.yaml
reviewerAgentFile: agents/reviewer-agent.yaml
outputArtifact: spike.md
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
- `workerAgentFile` references `architect-agent.yaml` — the output of AEOS-5. Create `.aeos/agents/architect-agent.yaml` as a minimal placeholder (stub executor) before running M4-001 (AEOS-5).
- `reviewerRubrics` starts empty. No task in the current plan produces a spike-specific structure rubric (AEOS-7 / M4-003 produces `tech-spec-structure.md`; AEOS-6 / M4-002 produces `spike-template.md`, which is an output template, not a reviewer rubric). For v1, this column will rely on `intent-drift.md` from AEOS-4 once available. If a spike-specific structure rubric is needed, a new task should be created.
- Worker output artifact is `spike.md` per system design Section 2.2 (`SAAS-1-spike.md`). The `SAAS-1-` prefix is the ticket ID prefix added at runtime; the column spec only defines the suffix (`spike.md`).

## Acceptance Criteria
- [ ] File exists at `.aeos/column-specs/architecture-spike.yaml`
- [ ] `YamlColumnSpecLoader.load(Column.ARCH_SPIKE)` succeeds without error
- [ ] Parsed spec has `column: ARCH_SPIKE`, `phase: PREPARE`, `outputArtifact: spike.md`
- [ ] Parsed spec has `preflight.enabled: true` and `preflight.questionsArtifact: questions.md`

## Dependencies
- M2-007: `ColumnSpecSchema` ✅ complete
- M2-008: `YamlColumnSpecLoader` ✅ complete
- M2-013: `reviewer-agent.yaml` ✅ complete

## Blocks
- M4-001 (AEOS-5): Architect agent spec — needs this column spec when the ticket reaches the ARCH_SPIKE column
