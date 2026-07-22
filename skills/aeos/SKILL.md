---
name: aeos
description: >
  Drive the AEOS ticket pipeline from the command line. Use this when working
  inside an AEOS project (a directory containing .aeos/project.json) to create
  tickets, decompose an epic into child tasks, run a pipeline column, or inspect
  ticket state. Triggers whenever a task involves aeos tickets, epics, tasks, or
  breaking work down into tasks.
---

# Driving AEOS from the CLI

AEOS runs tickets through an agent pipeline. A ticket is an **epic** or a
**task**. You are usually invoked *by* AEOS as the worker for a column, with the
current ticket in your context and the project root as your working directory.

The `aeos` binary is on PATH and operates on the project in the current working
directory. Every command below is safe to run from within a column execution.

## Decomposing an epic (TASK_BREAKDOWN)

When you run the `TASK_BREAKDOWN` column you produce two things:

1. The `tasks.md` breakdown as your response text, in the format your agent
   spec defines. Your printed output is captured as the artifact — print the
   breakdown; do not write it to a file (a file you write is ignored).
2. One child ticket per task, created by calling the CLI.

Create each task as a child of the epic you are decomposing, passing its
`T-NNN` key from `tasks.md` with `--key`:

```sh
aeos ticket create "Add password hashing" --parent <EPIC_ID> --key T-001
aeos ticket create "Add session middleware" --parent <EPIC_ID> --key T-002
```

`<EPIC_ID>` is the ID of the ticket in your context — the `# Ticket: <ID>`
heading in the ticket document (e.g. `AEOS-1`). Use that exact ID.

Rules:

- **One `ticket create` call per task in your breakdown**, each with its own
  **distinct** `--key T-NNN` matching the task's label in `tasks.md`. Reusing a
  key across two tasks silently drops the second — they are treated as one task.
- **Creating a task is idempotent, keyed on `--key`.** If a child with the same
  key already exists under the epic, the command leaves it **unchanged** and
  prints `= ... already exists` — a reworded title is not applied, so keep each
  task's title stable across attempts too. Keying on the label rather than the
  title means a retry still matches, so re-running after a rejected review never
  duplicates tasks. Always create the full set with stable keys; do not try to
  detect what already exists.
- **Do not create tasks under a task.** Nesting is one level deep; `--parent`
  must always be an epic.
- Keep titles short and imperative — they become ticket titles.

After writing `tasks.md` and creating the child tickets, your column output is
complete. The reviewer evaluates `tasks.md`; the orchestrator picks up the
children you created and drives each through its own build pipeline.

## Other useful commands

```sh
aeos ticket list                 # tickets in this project; tasks nest under their epic
aeos ticket show <ID>            # kind, parent/children, column, state, artifacts
aeos ticket create "<title>"     # a new epic (no --parent)
```

Do **not** run `aeos ticket run`, `aeos ticket approve`, or `aeos orchestrator`
from inside a column — those drive the pipeline and would re-enter it. Your job
is to produce this column's output; advancing is the operator's or
orchestrator's concern.
