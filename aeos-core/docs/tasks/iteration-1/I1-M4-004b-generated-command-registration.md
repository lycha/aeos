# Task: Generated Command Registration

**Milestone:** I1-M4 — Prove
**Plan package:** 4.4 (part 2 of 4)
**Agent:** typescript-pro
**Method:** Agentic implementation, test-first
**Size:** L — deliver as three pull requests (see step 6)
**Human-owned inputs:** `aeos-core/cli-contract.yaml` (approved in 004a)

## Context
Principle IV: generators build the scaffold, agents write the logic. For AEOS the scaffold is command registration. Each file in `src/cli/commands/` today mixes four things: Commander wiring (`.command().argument().option()`), resource checks (every command repeats the "No AEOS project found" block), a call to a use case, and output. Only the last two are logic.

After this task the wiring, option types, resource checks and the command reference are generated from the contract, and each command file is reduced to a typed handler.

## What needs to be done
1. **Generator.** `scripts/generate-cli.mjs` (plain Node, no new dependency beyond `js-yaml`, which is already present) reads `cli-contract.yaml` and writes `src/cli/generated/`:
   - `commands.gen.ts` — a `registerGenerated(program, handlers, resources)` function that builds the whole Commander tree
   - `types.gen.ts` — one `…Args` and `…Options` interface per command, typed from the contract's `type` fields
   - `resources.gen.ts` — the resource names as a union type, and each command's `requires` list
   Every generated file starts with `// GENERATED from cli-contract.yaml — do not edit`.
2. **Deterministic.** The same contract always produces byte-identical output: stable ordering, no timestamps.
3. **Resource guards.** `src/cli/resources.ts` (hand-written) implements one check per resource name in the contract: `aeos_home`, `project`, `state_db`, `git_repo`, `executor`, `python`, `gh`. The generated registration runs a command's guards before its handler and, on the first failure, prints the resource's `description` and `fix` from the contract and exits with the `missing_resource` code. Keep exit code 1 for now if 004c has not landed; 004c switches it.
4. **Handlers.** Each command becomes `src/cli/commands/<name>.handler.ts` exporting a function `(args, options, context) => Promise<…>` with the generated types. The handler contains no Commander calls and no resource checks.
5. **Command reference.** The generator also writes the command reference between `<!-- BEGIN GENERATED CLI REFERENCE -->` and `<!-- END … -->` markers in `aeos-core/README.md` and `skills/aeos/SKILL.md`.
6. **Migrate in three pull requests,** each leaving the CLI fully working and the verifier from 004a green:
   1. the generator, `resources.ts`, and `install` + `project init` + `project sync`
   2. the eleven `ticket` commands
   3. `orchestrator` (four) + `costs`, then delete the old `register*Command` functions and their re-exports in `src/cli/index.ts`
7. **Freshness check.** `npm run generate:cli` regenerates; `npm run verify:generated` regenerates into a temp directory and fails if it differs from what is committed. Add it to CI and to the checks list.
8. **Protect.** Add `src/cli/generated/**` to the built-in protected paths.
9. Port the existing command tests (`ticket-list.command.test.ts` and its siblings) to the handlers. Behaviour and text output must not change in this task.

## Acceptance Criteria
- [ ] Given the contract, when the generator runs twice, then the output is byte-identical
- [ ] Given a hand edit to `commands.gen.ts`, when `verify:generated` runs, then it fails
- [ ] Given every migrated command, when run with the arguments its old test used, then stdout, stderr and exit code are unchanged
- [ ] Given a command that requires `project`, when run outside a project, then the guard stops it with the contract's fix text before the handler runs
- [ ] Given the verifier from 004a, when run after each of the three pull requests, then zero mismatches
- [ ] Given `src/cli/commands/`, when searched after the third pull request, then no file calls `.command(`, `.argument(` or `.option(`
- [ ] Given the README and the skill, when generated, then their command reference lists every `existing` command with its options
- [ ] Given an agentic run that edits a generated file, when the attempt ends, then it is a protected-path violation

## Out of Scope
- `--json`, typed results and the exit-code vocabulary (I1-M4-004c). Handlers may keep printing as they do.
- Running the generator from the pipeline, and the contract gate (I1-M4-004d)
- Changing any command's behaviour

## Technical Notes / Hints
- `ticket run` hands control to the Ink terminal interface (`run-ink-app.tsx`). Its handler keeps doing that; only the wiring moves.
- `ticket-dod-approve` is interactive (it asks for confirmation). Keep the prompt in the handler.
- The lazy database singleton matters: `install` and `project init` must run before `state.db` exists. Guards for `state_db` must not run for commands that do not require it — that is exactly what the contract's `requires` lists are for.
- Why a `.mjs` script and not a template engine: it runs before the build, in CI, with no compile step.

## Layer Mapping
```
Generator:  aeos-core/scripts/generate-cli.mjs
Generated:  src/cli/generated/commands.gen.ts, types.gen.ts, resources.gen.ts
Hand-written: src/cli/resources.ts, src/cli/commands/*.handler.ts, src/cli/index.ts
Docs:       aeos-core/README.md, aeos-core/skills/aeos/SKILL.md (generated sections)
Scripts:    package.json ("generate:cli", "verify:generated"), .github/workflows/ci.yml
```

## Dependencies
- I1-M4-004a

## Definition of Done
- [ ] Common Definition of Done in `README.md`, for each of the three pull requests
- [ ] Old registration code deleted in the third
