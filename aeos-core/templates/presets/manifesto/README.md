# Manifesto pipeline preset

An opt-in alternative to the standard aeos pipeline, mapping the manifesto's
[feature pipeline](https://github.com/lycha/aeos/wiki/AI-Driven-Development-A-Manifesto#the-feature-pipeline)
onto aeos columns. See [`../../manifesto-pipeline-mapping.md`](../../manifesto-pipeline-mapping.md)
for the full stage-by-stage mapping and the design rationale.

Versus standard, this preset adds three EPIC columns between `TECH_SPEC` and
`TASK_BREAKDOWN`:

| Column | Manifesto stage | What it does |
|--------|-----------------|--------------|
| `API_CONTRACT` | 7 | reviews the human-owned OpenAPI contract; cleared by the contract gate |
| `SCHEMA` | 8 | reviews the human-owned ERD/SQL schema; cleared by the contract gate |
| `SCAFFOLD` | 9 | reviews the deterministically generated scaffold (DTOs, interfaces, repositories, e2e suite) |

Manifesto stages 1–5 (raw material → spec) are authored **before** the epic by
the `plugins/artefact-tree-pipeline/` skills and pinned by `ticket create --spec`;
they are not board columns. The TASK pipeline is identical to standard.

## Bundle layout

This directory mirrors `.aeos/`:

```
pipelines.yaml                       # the manifesto column order
column-specs/{api-contract,schema,scaffold}.yaml
agents/{api-contract,schema,scaffold}-agent.yaml   # workers (reviewer reuses the standard reviewer-agent)
rubrics/structure/{api-contract,schema,scaffold}-structure.md
```

## Scaffolding it at init

```bash
aeos project init --pipeline manifesto
```

This overlays the preset on the standard scaffold: its `pipelines.yaml` replaces
the standard column order, and its three column specs, worker agents and rubrics
are added. `--pipeline standard` (the default) scaffolds the standard pipeline.

## Switching an existing project

The engine is pipeline-as-data, so you can also switch an already-initialised
project by hand (standard scaffold present, so `agents/reviewer-agent.yaml` and
`rubrics/drift/intent-drift.md` exist). Copy this bundle into `.aeos/`:

```bash
PRESET="$(npm root -g)/@lycha/aeos/templates/presets/manifesto"  # or this directory

cp "$PRESET"/column-specs/*.yaml     .aeos/column-specs/
cp "$PRESET"/agents/*.yaml           .aeos/agents/
cp "$PRESET"/rubrics/structure/*.md  .aeos/rubrics/structure/
cp "$PRESET"/pipelines.yaml          .aeos/pipelines.yaml   # swaps the column order
```

The `PipelineGuard` accepts the new order only when **every epic and task is in
`BACKLOG` or `DONE`** (it records the change as a gate and refuses mid-flight
tickets, naming them). So switch on a quiet board, typically right after init.

> Re-running `aeos project init` for repair on a manifesto project: pass
> `--pipeline manifesto` again, or only the standard files are restored.

## Operating the new columns

The API contract and schema are **human-owned** artefacts: provide them under the
feature directory and wire their paths into `project.json` `contracts` globs so
the contract gate (`ticket approve --contract`) guards them. The scaffold is
produced by `project.json` `generators`; the `SCAFFOLD` column reviews that
output, it does not generate it.
