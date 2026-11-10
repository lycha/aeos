# Task: The CLI Contract File and Its Verifier

**Milestone:** I1-M4 — Prove
**Plan package:** 4.4 (part 1 of 4)
**Agent:** typescript-pro
**Method:** Agentic implementation, test-first
**Size:** M
**Human-owned inputs:** ⛔ `aeos-core/cli-contract.yaml` (draft in `proposals/`)

## Context
The API contract of AEOS is its command surface: commands, parameters, required resources, output formats and exit codes. It already has consumers that break silently when it changes — scripts, and `skills/aeos/SKILL.md`, which teaches agents to drive the CLI. Today the surface is defined by seventeen hand-written `register*Command` functions in `src/cli/commands/`, and nothing describes it as a whole.

Package 4.4 makes the contract a human-owned file and generates the scaffold from it. This first part adds the file and a check that the built CLI matches it. It changes no behaviour, and it starts catching drift at once.

## What needs to be done
1. **Adopt the file.** `aeos-core/cli-contract.yaml`, as approved by Kris. Do not edit it. Add it to the package `files` and to the built-in protected paths (I1-M2-002).
2. **Schema for the contract.** A Zod schema in `src/cli/contract/contract-schema.ts` for the file's own structure: `resources`, `exit_codes`, `output`, `commands[]` with `name`, `status`, `summary`, `arguments[]`, `options[]`, `requires[]`, `exits[]`, `data`. Loading an invalid contract fails with the path of the bad field.
3. **Verifier.** `src/cli/contract/verify-contract.ts` walks the Commander tree from `buildProgram()` and compares, for every leaf command:
   - presence both ways (in the contract and not the CLI; in the CLI and not the contract)
   - argument names, order and required-ness
   - option flags, including value placeholders
   - the summary text
   Commands and options whose `status` is `proposed` are expected to be absent until their task lands; report them as `pending`, not as errors. Once present, they must match.
4. **Entrypoints.** `npm run verify:contract` prints a readable diff and exits non-zero on any mismatch. A Vitest test asserts zero mismatches.
5. **Add it as a check** in this repository's own `.aeos/project.json` checks list (a human-made change; note it in the pull request).
6. **Do not** check `requires`, `exits` or `data` yet. Those are not expressible in the current code; I1-M4-004b and 004c make them real.

## Acceptance Criteria
- [ ] Given the approved contract and the CLI on main, when verified, then there are zero mismatches and the proposed items are listed as pending
- [ ] Given an option added to a command but not to the contract, when verified, then it fails naming the command and flag
- [ ] Given a command in the contract with status `existing` that the CLI lacks, when verified, then it fails naming it
- [ ] Given an argument changed from required to optional in code, when verified, then it fails
- [ ] Given a malformed contract file, when loaded, then the error names the offending field path
- [ ] Given an agentic run that edits `cli-contract.yaml`, when the attempt ends, then it is a protected-path violation

## Out of Scope
- Generating anything from the contract (I1-M4-004b)
- JSON output and exit codes (I1-M4-004c)
- The contract gate (I1-M4-004d)

## Technical Notes / Hints
- A throwaway version of this walk was used to check the draft against main at `0b01fc8`: all 18 existing commands matched. The approach works; `registeredArguments` and `options[].flags` on each Commander command carry what you need.
- `costs` is registered by I1-M1-004 and `ticket repin` by I1-M3-005. If those have landed, the contract should mark them `existing`; if the approved file still says `proposed`, raise it rather than editing.

## Layer Mapping
```
Contract:  aeos-core/cli-contract.yaml (human-owned)
CLI:       src/cli/contract/contract-schema.ts, load-contract.ts, verify-contract.ts
Scripts:   package.json ("verify:contract")
```

## Dependencies
- I1-M2-001 (to register as a check), I1-M2-002 (protected paths)
- ⛔ approved `cli-contract.yaml`

## Definition of Done
- [ ] Common Definition of Done in `README.md`
