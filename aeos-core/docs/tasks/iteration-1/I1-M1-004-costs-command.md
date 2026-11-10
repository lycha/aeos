# Task: A Real `aeos costs`

**Milestone:** I1-M1 — Measure
**Plan package:** 1.4
**Agent:** typescript-pro
**Method:** Agentic implementation, test-first
**Size:** S
**Human-owned inputs:** none

## Context
`src/application/costs.use-case.ts` and `src/cli/commands/costs.command.ts` are one-line stubs, and the command is not registered in `src/cli/index.ts`: `aeos costs` prints the root help. `docs/tasks/M7-004-aeos-costs.md` specified it in April; this task supersedes it now that cost is real (I1-M1-001) and nullable (I1-M1-002).

## What needs to be done
1. **Port.** Extend `CostRepository` with `findByFilters({ projectId?, ticketId?, epicId?, since? })`. `epicId` returns the epic's records and those of every child task (join on `tickets.parent_id`).
2. **Use case.** `costs.use-case.ts` aggregates to: total; per project; per ticket; within a ticket per column and per role (worker, reviewer, preflight — from the agent's role or the run record). Sum known costs. Count unknown records separately and never fold them into a total as zero.
3. **Command.** Register `aeos costs` with `--project <key>`, `--epic <id>`, `--ticket <id>`, `--since <YYYY-MM-DD>`. It reads the global database, so it works outside a project directory.
4. **Rendering.** Follow the layout sketched in `M7-004`. Show `unknown` for a ticket whose records are all unknown, and a footer `N record(s) with unknown cost are not included` when any exist.
5. Move `docs/tasks/M7-004-aeos-costs.md` to `docs/tasks/archive/` with a one-line note pointing here.

## Acceptance Criteria
- [ ] Given records for two projects, when running `aeos costs`, then both appear with their totals
- [ ] Given `--epic AEOS-1` where AEOS-1 has two child tasks, when run, then the epic's and both children's records are included and nothing else
- [ ] Given `--since 2026-11-01`, when run, then earlier records are excluded
- [ ] Given a ticket with one known cost of 0.40 and one unknown, when shown, then its total is 0.40 and the footer reports one unknown record
- [ ] Given no records, when run, then `No cost data recorded yet.` is shown
- [ ] Given `aeos costs --help`, when run, then the command's own help is shown, not the root help

## Out of Scope
- `--json` output. I1-M4-004c adds it to every command at once.
- CSV export, budget alerts, currency conversion

## Technical Notes / Hints
- Costs from Claude Code are client-side estimates. Say so in one line of the report header.
- The proposed CLI contract already lists this command and its options. Match it; if you need a different option, raise it rather than diverging.

## Layer Mapping
```
CLI command:  src/cli/commands/costs.command.ts, src/cli/index.ts (register)
Driving port: src/domain/ports/driving/costs.port.ts
Use case:     src/application/costs.use-case.ts
Domain port:  src/domain/ports/driven/cost-repository.port.ts
Adapter:      src/infrastructure/persistence/sqlite-cost.repository.ts
Wiring:       src/cli/container.ts
```

## Dependencies
- I1-M1-002: nullable cost

## Definition of Done
- [ ] Common Definition of Done in `README.md`
- [ ] Output of `aeos costs` after one real run pasted into the pull request
