# Task: Parse Token Usage and Cost from the Claude Executor

**Milestone:** I1-M1 — Measure
**Plan package:** 1.1
**Agent:** typescript-pro
**Method:** Agentic implementation, test-first
**Size:** S
**Human-owned inputs:** none

## Context
`src/infrastructure/executor/claude-cli-executor.adapter.ts` writes stdout to the artefact and returns no `usage` (line ~117: `TODO(M2-007): Parse usage from Claude CLI JSON output mode when available`). `recordCost` in `ticket-run.use-case.ts` then stores `costUsd: usage?.costUsd ?? 0`. Every cost record is therefore `$0.00`, and the orchestrator's budget ceiling (`BUDGET_EXCEEDED` in `orchestrator-policy.ts`) can never trigger.

The Claude Code CLI reports cost in its structured output. From the documentation ([Run Claude Code programmatically](https://code.claude.com/docs/en/headless), [Track cost and usage](https://code.claude.com/docs/en/agent-sdk/cost-tracking)):

- `--output-format json` returns one JSON object with the text in `result`, plus `session_id`, `usage` and `total_cost_usd`.
- `--output-format stream-json --verbose` emits newline-delimited events; the last line is a `result` message carrying the same fields.
- `usage` has `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`. It **excludes** subagent activity; `total_cost_usd` and `modelUsage` include it.
- `total_cost_usd` is a **client-side estimate**, not billing data.
- A failure inside the run is printed as the result on stdout with a non-zero exit.

## What needs to be done
1. Confirm the field names above against the installed `claude --version` before writing code. Record the version in the pull request.
2. Switch both modes (artifact: `--print -` with the prompt on stdin; agentic: `-p <prompt> --permission-mode acceptEdits --allowedTools ...`) to `--output-format stream-json --verbose`. Streaming keeps the live terminal display working; plain `json` would deliver nothing until the end.
3. Parse stdout line by line. Forward assistant text to `invocation.onChunk` as today. Tolerate non-JSON lines by passing them through.
4. From the final `result` line take: `result` → artefact content; `usage.input_tokens`, `usage.output_tokens` → `TokenUsage`; `total_cost_usd` → `costUsd`.
5. Keep the full raw stream. Add an optional `transcript?: string` to `ExecutorSuccess` in `src/domain/model/executor-result.ts` and return it. I1-M1-003 saves it as the reasoning log.
6. When the `result` line is missing or unparseable on a zero exit, return the text as before with `usage` **undefined**. Do not invent zeros.
7. Update the adapter's unit tests with fixture streams: success, success without a result line, error result with non-zero exit, interrupted.
8. Extend `claude-cli-executor.smoke-test.ts` to print tokens and cost.

## Acceptance Criteria
- [ ] Given a stream ending in a `result` message, when the run completes, then `usage` holds its token counts and `costUsd` equals `total_cost_usd`
- [ ] Given a stream with no `result` message and exit 0, when the run completes, then the artefact is written and `usage` is undefined
- [ ] Given an error result and non-zero exit, when the run completes, then the result is `ok: false` and the reason carries the error text
- [ ] Given assistant text events, when they arrive, then `onChunk` receives the text in order
- [ ] Given the smoke test with a real `claude`, when run, then it prints a cost greater than zero

## Out of Scope
- Auggie, OpenCode and Ollama usage parsing. Their TODOs stay; I1-M1-002 makes their cost honestly unknown.
- Computing cost from tokens and a price table. Add only if step 1 shows the CLI does not report cost; raise it first.
- `--bare` mode. It changes authentication (API key only) and is a separate decision.

## Technical Notes / Hints
- `buildArgs` passes `--max-tokens`. Check it is still a valid flag while you are there; remove it if not.
- Record cache token counts in the transcript only. `TokenUsage` keeps its three fields; I1-M1-003's run record has room for the cache fields.

## Layer Mapping
```
Domain model: src/domain/model/executor-result.ts            — transcript on ExecutorSuccess
Adapter:      src/infrastructure/executor/claude-cli-executor.adapter.ts
Tests:        src/infrastructure/executor/claude-cli-executor.adapter.test.ts
Smoke test:   src/infrastructure/executor/claude-cli-executor.smoke-test.ts
```

## Dependencies
- I1-M0-001: the end-to-end test must still pass (the stub is unaffected, but the port type changes)

## Definition of Done
- [ ] Common Definition of Done in `README.md`
- [ ] Smoke test output with a non-zero cost pasted into the pull request
