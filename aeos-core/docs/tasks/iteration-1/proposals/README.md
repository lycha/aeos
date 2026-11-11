# Proposals — human-owned artefacts for Iteration 1

These five files are **drafts for Kris to review**. They are not yet contracts.

By principle III, agents build to contracts and do not invent them. Each file
below is a contract that one or more Iteration 1 tasks depend on. An agent
produced the first draft from the existing code and the decisions of
10 November 2026; a person decides what goes in.

| Draft | Becomes | Blocks |
|---|---|---|
| `run-record.schema.draft.json` | `plugins/artefact-tree-pipeline/schemas/run-record.schema.json` | I1-M1-003 |
| `gates.schema.draft.json` | `plugins/artefact-tree-pipeline/schemas/gates.schema.json` | I1-M3-004 |
| `conformance.schema.draft.json` | `plugins/artefact-tree-pipeline/schemas/conformance.schema.json` | I1-M4-002a |
| `cli-contract.draft.yaml` | `aeos-core/cli-contract.yaml` | I1-M4-004a |
| `pipelines.draft.yaml` | `aeos-core/templates/pipelines.yaml` | I1-M4-005a |

## How to approve one

1. Read it. Each ends with the questions it needs you to answer.
2. Edit it until it says what you want.
3. Move it to the path in the table, dropping `.draft`, and commit it yourself.
4. Tick it off in `../README.md`.

A task whose input is not yet approved must stop and say so. It must not start
from the draft.

## What was checked

- All three schemas are valid JSON Schema (draft 2020-12), and a sample
  instance of each validates.
- Every `existing` command, argument and option in the CLI contract matches
  `aeos <command> --help` on `main` at `0b01fc8`.
- Output shapes and exit codes are proposals. No command has a JSON output
  today, and failure and escalation both exit 1.
