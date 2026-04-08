# Task: Create `product-scoping.yaml` Column Spec

**Milestone:** M3 — PM Agent (Product Scoping Column)
**Agent:** — (manual bootstrapping)
**Method:** Manual — prerequisite for M3-001 (AEOS-1)

## Context
The PRODUCT_SCOPING column cannot run without a column spec file. `aeos ticket run` loads `.aeos/column-specs/product-scoping.yaml` via `YamlColumnSpecLoader` and fails with `ColumnSpecNotFoundError` if the file is missing. This is a bootstrapping prerequisite — it must be created before the first pipeline ticket (AEOS-1) can run.

## What needs to be done
Create `.aeos/column-specs/product-scoping.yaml` with the following content:

```yaml
column: PRODUCT_SCOPING
phase: PLAN
workerAgentFile: agents/pm-agent.yaml
reviewerAgentFile: agents/reviewer-agent.yaml
outputArtifact: prd.md
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
- `workerAgentFile` references `pm-agent.yaml` which is the **output** of AEOS-1. Create `.aeos/agents/pm-agent.yaml` as a minimal placeholder (stub executor) before running AEOS-1.
- `reviewerAgentFile` references `agents/reviewer-agent.yaml`, which resolves to `.aeos/agents/reviewer-agent.yaml` at runtime (provided by M2-013).
- `reviewerRubrics` starts empty. After AEOS-2 (PRD structure rubric) and AEOS-4 (intent drift rubric) are complete, update to:
  ```yaml
  reviewerRubrics:
    - rubrics/structure/prd-structure.md
    - rubrics/drift/intent-drift.md
  ```
- All fields are validated at runtime by `ColumnSpecSchema` (Zod). Missing required fields (`column`, `workerAgentFile`, `reviewerAgentFile`, `outputArtifact`) will throw `ZodError`.
- **Bootstrapping override (M3-001 / AEOS-1):** The spec as written is the canonical long-lived configuration for the PRODUCT_SCOPING column (output = PRD). For the AEOS-1 bootstrapping run, M3-001 requires temporary overrides of `outputArtifact` (→ `pm-agent.yaml`), `minWordCount` (→ `200`), and `requiredSections` (→ `[systemPrompt, taskInstruction, outputFormat]`). Apply those overrides in a separate bootstrap column spec or patch this file temporarily for that run, then revert to the canonical values above.

## Acceptance Criteria
- [ ] File exists at `.aeos/column-specs/product-scoping.yaml`
- [ ] `YamlColumnSpecLoader.load(Column.PRODUCT_SCOPING)` succeeds without error
- [ ] Parsed spec has `column: PRODUCT_SCOPING`, `phase: PLAN`, `outputArtifact: prd.md`
- [ ] Parsed spec has `preflight.enabled: true` and `preflight.questionsArtifact: questions.md`
- [ ] `aeos ticket run` no longer fails with `ColumnSpecNotFoundError` for PRODUCT_SCOPING (note: this verifies the file loads successfully; pre-flight and main execution are validated by downstream tasks)

## Dependencies
- M2-007: `ColumnSpecSchema` (Zod schema) ✅ complete
- M2-008: `YamlColumnSpecLoader` (YAML loader adapter) ✅ complete
- M2-013: `reviewer-agent.yaml` ✅ complete

## Blocks
- M3-001 (AEOS-1): PM agent spec — cannot run without this column spec
