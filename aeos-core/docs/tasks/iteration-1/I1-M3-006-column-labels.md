# Task: Configurable Column Names

**Milestone:** I1-M3 — Specify
**Plan package:** 3.6
**Agent:** typescript-pro
**Method:** Agentic implementation, test-first
**Size:** S
**Human-owned inputs:** none (decision D3)

## Context
Decision D3: column names are configurable. The identifier (`SPEC_REVIEW`) is what the database, the transition log and the code use and it stays fixed. The name a person sees is a label that a project sets in the column spec. Column *order* is a separate, larger change (I1-M4-005a–c).

## What needs to be done
1. Add optional `label: string` to `ColumnSpec` and `ColumnSpecSchema`. Default: the identifier in sentence case (`SPEC_REVIEW` → `Spec review`). `BACKLOG` and `DONE` have no spec; their labels come from an optional `labels` map in `.aeos/project.json` with the same default.
2. Provide one function, `labelFor(column, specs, projectConfig)`, and use it everywhere a column is shown to a person: `ticket list`, `ticket show`, `ticket move` and `approve` messages, orchestrator halt messages, `orchestrator status`, the terminal run display (`ticket-run-display.ts`), `aeos costs`.
3. Show the identifier once, in `ticket show`, so a person can always find it.
4. `ticket move <id> <status>` and `ticket list --column <c>` accept an identifier or a label, case-insensitively. An identifier wins on a clash.
5. Validate at load: labels are unique within a project (case-insensitively), non-empty, at most 40 characters, and do not equal another column's identifier.
6. Add a `label` to every template column spec.
7. Persisted data never contains a label.

## Acceptance Criteria
- [ ] Given `label: "Shaping"` on the tech spec column, when `ticket list` runs, then tickets there show `Shaping`
- [ ] Given that label, when `ticket move AEOS-1 shaping --reason "…"` runs, then the ticket moves to `TECH_SPEC`
- [ ] Given two column specs with the same label, when loaded, then loading fails naming both files
- [ ] Given a column spec with no label, when shown, then the default sentence-case label appears
- [ ] Given a label change, when the database is inspected, then no stored value changed
- [ ] Given the transition log and gate records, when read, then they contain identifiers only

## Out of Scope
- Column order and adding or removing columns (I1-M4-005a–c)
- Localisation

## Technical Notes / Hints
- `ticket-move.command.ts` validates with `isValidColumn(rawStatus.toUpperCase())` and lists `Object.values(Column)` in its error. Both need the specs to resolve labels; pass a resolver into the command rather than importing the loader into `cli/commands/`.
- Until I1-M3-004 lands, `ticket move` has no `--reason`. Write the test for whichever is on main when you start.

## Layer Mapping
```
Model:       src/domain/model/column-spec.ts
Domain svc:  src/domain/services/column-labels.ts (new, pure)
Spec loader: src/infrastructure/spec-loader/schemas.ts, yaml-column-spec-loader.adapter.ts
CLI:         src/cli/commands/ticket-list / ticket-show / ticket-move / orchestrator commands, src/cli/ui/ticket-run-display.ts
Templates:   templates/column-specs/*.yaml
```

## Dependencies
- None. Can run at any time in M3.

## Definition of Done
- [ ] Common Definition of Done in `README.md`
