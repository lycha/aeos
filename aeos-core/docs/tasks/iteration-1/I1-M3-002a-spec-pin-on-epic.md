# Task: Spec-Backed Epics — the Pin

**Milestone:** I1-M3 — Specify
**Plan package:** 3.2 (part 1 of 2)
**Agent:** typescript-pro
**Method:** Agentic implementation, test-first
**Size:** M
**Human-owned inputs:** none

## Context
Principle III: humans write the specification; "a missing decision stops the work". Today an epic is created from a title and a free-text body, and the PM agent expands it into a PRD. This task lets an epic be created *from* a human-written spec in `.aeos/features/<feature>/` and pins the exact revision, so every later prompt, review and report can say which spec it was judged against.

## What needs to be done
1. **Option.** `aeos ticket create "<title>" --spec <feature>`. Valid for epics only; reject with `--parent`.
2. **Preconditions**, checked in this order, each with its own error:
   1. `.aeos/features/<feature>/` exists and contains `spec.md` and `decisions.yaml`.
   2. `decisions.yaml` validates against `.aeos/schemas/decisions.schema.json`.
   3. `lint_decisions.py` exits 0 (run it as the schemas README documents; it needs `python3`).
   4. No decision has outcome `ESCALATED`, and no `requires_human` conflict is unresolved. (The linter covers part of this; add what it does not.)
   5. The feature directory has no uncommitted changes in the `.aeos` repository.
3. **Pin.** A reference triple as the schemas define it: `{ repo, commit, path }` — `repo` is the `.aeos` repository's identity (use `<project key>-aeos`), `commit` its current `HEAD`, `path` `features/<feature>`.
4. **Persist.** Append a migration adding nullable `spec_feature` and `spec_commit` to `tickets`. Add `specPin` to the `Ticket` model, repository, and the mirrored ticket document.
5. **Inheritance.** A task's pin is its parent epic's. Do not copy it; resolve through `parentId`.
6. **Surface.** `ticket show` prints the pin and warns when the feature directory's `HEAD` differs from the pinned commit ("spec has moved since this epic was pinned").
7. **Trailer.** Task commits for a spec-backed epic gain `Spec: <repo>@<commit>` (through the trailer function from I1-M2-003).
8. **Run records.** Fill `spec_pin` for every run on a spec-backed ticket.
9. **Pull request body.** Fill the spec-pin placeholder left by I1-M2-003.

## Acceptance Criteria
- [ ] Given a clean, lint-passing feature, when `ticket create --spec` runs, then the epic is created and its pin holds the `.aeos` `HEAD` commit
- [ ] Given a feature with an `ESCALATED` decision, when create runs, then it is refused and the decision is named
- [ ] Given a `decisions.yaml` that fails the schema, when create runs, then it is refused with the validator's message
- [ ] Given uncommitted changes in the feature directory, when create runs, then it is refused
- [ ] Given `--spec` together with `--parent`, when create runs, then it is refused
- [ ] Given `python3` is not on PATH, when create runs, then the error names the missing resource
- [ ] Given a child task of a spec-backed epic, when shown, then it displays the epic's pin
- [ ] Given a spec commit made after pinning, when the epic is shown, then the drift warning appears

## Out of Scope
- Feeding the spec into prompts (I1-M3-002b)
- Requiring `--spec` for every epic (I1-M3-003)
- Moving the pin (I1-M3-005)

## Technical Notes / Hints
- Add `showFile(dir, commit, path)` and `headCommit(dir)` to `GitGateway` now; I1-M3-002b needs both.
- Schema validation in TypeScript needs a JSON Schema validator. `ajv` is the obvious choice and would be a new runtime dependency: raise it in the pull request before adding it. The alternative is to let `lint_decisions.py` do the schema pass, which it already does when `jsonschema` is installed.

## Layer Mapping
```
CLI:         src/cli/commands/ticket-create.command.ts, ticket-show.command.ts
Port:        src/domain/ports/driving/ticket-create.port.ts, driven/git-gateway.port.ts
Model:       src/domain/model/ticket.ts
Application: src/application/ticket-create.use-case.ts, ticket-show.use-case.ts, ticket-approve.use-case.ts, services/ticket-document.ts
Adapters:    src/infrastructure/persistence/database.ts, sqlite-ticket.repository.ts
             src/infrastructure/spec/ (new) decisions-lint.adapter.ts
```

## Dependencies
- I1-M3-001: the tree and schemas under `.aeos/`

## Definition of Done
- [ ] Common Definition of Done in `README.md`
- [ ] End-to-end harness gains a fixture feature (`src/e2e/fixtures/feature-sample/`) with a valid `spec.md`, `decisions.yaml` and one `.feature`
