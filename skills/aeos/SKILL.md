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

1. The `tasks.md` artifact at your given output path — the human-readable
   breakdown, in the format your agent spec defines.
2. One child ticket per task, created by calling the CLI.

Create each task as a child of the epic you are decomposing:

```sh
aeos ticket create "Add password hashing" --parent <EPIC_ID>
aeos ticket create "Add session middleware" --parent <EPIC_ID>
```

`<EPIC_ID>` is the ID of the ticket in your context — the `# Ticket: <ID>`
heading in the ticket document (e.g. `AEOS-1`). Use that exact ID.

Rules:

- **One `ticket create` call per task in your breakdown.** The titles must match
  the task titles in `tasks.md` so the two stay in correspondence.
- **Creating a task is idempotent.** If a child with the same title already
  exists under the epic, the command leaves it as is and prints `= ... already
  exists`. This means re-running after a rejected review will not duplicate
  tasks — always create the full set, do not try to detect what already exists.
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
