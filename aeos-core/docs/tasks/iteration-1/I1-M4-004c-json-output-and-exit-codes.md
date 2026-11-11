# Task: JSON Output and Exit Codes

**Milestone:** I1-M4 — Prove
**Plan package:** 4.4 (part 3 of 4)
**Agent:** typescript-pro
**Method:** Agentic implementation, test-first
**Size:** L — deliver as two pull requests (see step 7)
**Human-owned inputs:** `aeos-core/cli-contract.yaml` (approved in 004a)

## Context
Two facts about the CLI today:

- No command has a machine-readable output. There is no `--json` or format flag anywhere.
- `process.exitCode = 1` appears 45 times; the only other code is 130 on interrupt. A failed run and an escalated run both exit 1, although the engine's own rule is that "escalation is not failure" and the transition log keeps them apart for exactly that reason. A script cannot tell "something broke" from "a person is needed".

The contract declares both: an output envelope with a shape per command, and an exit-code vocabulary.

## What needs to be done
1. **Result type.** `src/cli/result.ts`: `CommandResult<T> = { exit: ExitCode, data: T | null, error: { code, message, resource? } | null, text: () => string }`. `ExitCode` is generated from the contract's `exit_codes` into `src/cli/generated/exit-codes.gen.ts`.
2. **Handlers return, they do not print.** Every handler from 004b returns a `CommandResult`. The generated registration is the only place that writes to stdout and sets `process.exitCode`.
3. **Renderer.** With `--json`: write exactly one JSON object to stdout — the envelope from the contract (`ok`, `command`, `exit`, `data`, `error`) — and nothing else; progress and diagnostics go to stderr. Without it: call `text()`. Text output stays as it is today.
4. **`--json` is global.** Add it to the generator as an option on every command.
5. **Exit-code mapping**, in one function, used by every handler:
   | Situation | Code |
   |---|---|
   | did what was asked | `success` |
   | executor crash, validation failure, unexpected error, sub-state `FAILED` | `failure` |
   | invalid arguments or options | `usage` |
   | sub-state `ESCALATED` or `BLOCKED`; orchestrator halts `NEEDS_HUMAN`, `AWAITING_APPROVAL`, `HUMAN_GATE`, `AWAITING_DECOMPOSITION`, `BUDGET_EXCEEDED`, `COST_UNKNOWN`; a refused gate | `needs_human` |
   | a resource guard failed | `missing_resource` |
   | interrupted | `interrupted` |
   Map Commander's own argument errors to `usage` (`program.exitOverride`).
6. **Typed data.** Each handler's `data` conforms to the shape the contract declares for its command. Generate TypeScript types for the shapes into `types.gen.ts` so a handler that returns the wrong shape does not compile. If the approved contract expresses shapes as JSON Schema, also generate a runtime validator used only in tests.
7. **Two pull requests:**
   1. result type, renderer, exit-code mapping, and the read-only commands (`ticket list`, `ticket show`, `orchestrator status`, `costs`)
   2. the state-changing commands and `ticket run` / `orchestrator run`
8. **Terminal interface.** Under `--json`, `ticket run` and `orchestrator run` do not start Ink. Run events go to stderr as one JSON object per line, so a wrapper can follow progress; stdout stays a single envelope at the end.
9. **Verifier.** Extend 004a's verifier: for every command, a contract test runs it under the stub with `--json` and checks the envelope, the `data` shape, and that the exit code is one the contract lists in that command's `exits`.
10. **Error codes.** Give each distinct error a stable `error.code` (`TICKET_NOT_FOUND`, `NOT_SIGNED_OFF`, `BUDGET_EXCEEDED`, …) in one enum. `docs/tasks/M7-005-error-messages-failed-state.md` planned something similar for `FAILED` states; reuse its list and archive that task with a pointer here.

## Acceptance Criteria
- [ ] Given any command with `--json`, when it succeeds, then stdout parses as one JSON object with `ok: true` and `data` matching the contract
- [ ] Given any command with `--json`, when it fails, then stdout is one JSON object with `ok: false`, a stable `error.code`, and no stack trace
- [ ] Given `ticket run` on a ticket that escalates, when it ends, then the exit code is `needs_human`, not `failure`
- [ ] Given `ticket run` where the executor crashes, when it ends, then the exit code is `failure`
- [ ] Given `orchestrator run` that halts awaiting approval, when it ends, then the exit code is `needs_human`
- [ ] Given a missing required argument, when run, then the exit code is `usage`
- [ ] Given `ticket list` outside a project, when run, then the exit code is `missing_resource` and `error.resource` is `project`
- [ ] Given any command without `--json`, when run, then its text output is unchanged from before this task
- [ ] Given the codebase, when searched, then `process.exitCode` is assigned in exactly one place
- [ ] Given the contract test, when a handler returns an exit code its command does not list, then the test fails

## Out of Scope
- Changing what any command does
- A streaming protocol on stdout. One envelope; events on stderr.
- Versioning the envelope beyond the contract's own `contract_version`

## Technical Notes / Hints
- This is a breaking change for anyone scripting on "non-zero means failed and 1 means anything". Add a "Breaking changes" section to `aeos-core/README.md`.
- `skills/aeos/SKILL.md` tells agents how to read command results. Its generated reference updates itself; its prose about interpreting failures must be updated by hand in this task.
- The orchestrator already has one special case, `haltReason === 'INTERRUPTED' ? 130 : 1`. It becomes the mapping function's first test.

## Layer Mapping
```
CLI:        src/cli/result.ts, exit-code-mapping.ts, error-codes.ts, render.ts
Generated:  src/cli/generated/exit-codes.gen.ts, types.gen.ts, commands.gen.ts
Handlers:   src/cli/commands/*.handler.ts
UI:         src/cli/ui/run-ink-app.tsx (skip under --json), ticket-run-display.ts
Contract:   src/cli/contract/verify-contract.ts
Docs:       aeos-core/README.md, aeos-core/skills/aeos/SKILL.md
```

## Dependencies
- I1-M4-004b

## Definition of Done
- [ ] Common Definition of Done in `README.md`, for each of the two pull requests
- [ ] `docs/tasks/M7-005-error-messages-failed-state.md` archived with a pointer to this task
