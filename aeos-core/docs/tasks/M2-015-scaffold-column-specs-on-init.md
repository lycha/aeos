# Task: Scaffold Default Column Specs During `project init`

**Milestone:** M2 — Agent & Column Spec Loading
**Agent:** — (manual)
**Method:** Manual

## Context
`aeos project init` creates `.aeos/column-specs/` but leaves it empty. Every `aeos ticket run` fails with `ColumnSpecNotFoundError` until the user manually creates each YAML file. There are 7 columns that need specs (`PRODUCT_SCOPING`, `ARCH_SPIKE`, `TECH_SPEC`, `IMPLEMENTATION`, `CODE_REVIEW`, `QA`, `DOD_GATE`).

`project init` should scaffold all column spec YAML files with curated defaults. Users can customise them afterwards.

## What needs to be done

### 1. Add `writeDefaultColumnSpecs` to `ProjectRepository` port

```typescript
// src/domain/ports/driven/project-repository.port.ts
export interface ProjectRepository {
  // ... existing methods ...
  /** Writes default column spec YAML files to .aeos/column-specs/. Skips files that already exist (idempotent). */
  writeDefaultColumnSpecs(projectPath: string): void;
}
```

### 2. Implement in `FsProjectRepository`

For each default column spec, write the file only if it doesn't already exist (preserves user customisations on re-init).

### 3. Store default YAML content

Create `src/infrastructure/filesystem/defaults/column-specs.ts` containing exported string constants:

| Constant | Filename | column | phase | workerAgentFile | outputArtifact |
|---|---|---|---|---|---|
| `PRODUCT_SCOPING_YAML` | `product-scoping.yaml` | PRODUCT_SCOPING | PLAN | agents/pm-agent.yaml | prd.md |
| `ARCH_SPIKE_YAML` | `architecture-spike.yaml` | ARCH_SPIKE | PREPARE | agents/architect-agent.yaml | spike.md |
| `TECH_SPEC_YAML` | `tech-spec.yaml` | TECH_SPEC | PREPARE | agents/architect-agent.yaml | tech-spec.md |
| `IMPLEMENTATION_YAML` | `implementation.yaml` | IMPLEMENTATION | BUILD | agents/engineer-agent.yaml | implementation-notes.md |
| `CODE_REVIEW_YAML` | `code-review.yaml` | CODE_REVIEW | BUILD | agents/engineer-agent.yaml | code-review.md |
| `QA_YAML` | `qa.yaml` | QA | DEPLOY | agents/qa-agent.yaml | qa-report.md |
| `DOD_GATE_YAML` | `dod-gate.yaml` | DOD_GATE | DEPLOY | agents/qa-agent.yaml | dod-verification.md |

All specs share these defaults:
```yaml
reviewerAgentFile: agents/reviewer-agent.yaml
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

> **Note:** `DOD_GATE` is a human-controlled gate per system design §2.1–§2.2 (reviewer = "Human approval"). The `workerAgentFile` (`agents/qa-agent.yaml`) and `reviewerAgentFile` (`agents/reviewer-agent.yaml`) are **placeholders** — the column spec schema requires these fields, but `DOD_GATE` will use a distinct human-approval flow (see M6, AEOS-15/AEOS-20). Add a `# TODO: DOD_GATE uses human-approval flow (AEOS-20), not agent execution` comment in the scaffolded YAML.

### 4. Update `ProjectInitUseCase.execute()`

After `writeDefaultAgentSpecs` (M2-014), add:
```typescript
// 3c. Write default column specs
this.projectRepo.writeDefaultColumnSpecs(cwd);
```

Also add to the idempotent branch.

### 5. Update existing tests

- `project-init.use-case.test.ts`: Add `writeDefaultColumnSpecs` to mock, assert called
- `yaml-column-spec-loader.adapter.test.ts`: Add integration tests that load the defaults via `FsProjectRepository.writeDefaultColumnSpecs()` and validate they parse correctly. Specifically:
  - All 7 column specs (`PRODUCT_SCOPING`, `ARCH_SPIKE`, `TECH_SPEC`, `IMPLEMENTATION`, `CODE_REVIEW`, `QA`, `DOD_GATE`) parse via `ColumnSpecSchema.parse()` without error
  - The `column`, `phase`, `workerAgentFile`, `reviewerAgentFile`, and `outputArtifact` values match the expected table above
  - `YamlColumnSpecLoader.load(Column.X)` resolves each file for all 7 columns
- Verify all files mocking `ProjectRepository` include `writeDefaultColumnSpecs` (search: `createMockProjectRepo` or `ProjectRepository`)

## Acceptance Criteria
- [ ] `aeos project init` writes all 7 column spec YAML files to `.aeos/column-specs/`
- [ ] All written column specs pass `ColumnSpecSchema.parse()` without error
- [ ] Each column spec references the correct `workerAgentFile` and `reviewerAgentFile`
- [ ] Re-running `aeos project init` does NOT overwrite existing (user-customised) column spec files
- [ ] `aeos ticket run` no longer fails with `ColumnSpecNotFoundError` after a fresh init

## Dependencies
- M1-002: `aeos project init` ✅ complete
- M2-007: `ColumnSpecSchema` ✅ complete
- M2-014: Scaffold agent specs on init (agent files must exist before column specs reference them)

## Blocks
- All pipeline ticket runs (AEOS-1 through AEOS-18)

## Supersedes
- M3-000 (product-scoping column spec) — created by init
- M4-000a (architecture-spike column spec) — created by init
- M4-000b (tech-spec column spec) — created by init
- M5a-000 (implementation column spec) — created by init
- M5b-000 (code-review column spec) — created by init
- M6-000 (qa column spec) — created by init

> **Note:** DOD_GATE column spec is new — no prior task existed for this column. Design is preliminary; see M6 for DOD_GATE design (AEOS-15, AEOS-20).
