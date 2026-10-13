# TypeScript / Node.js Review Checklist

## Type Safety
- No explicit `any` types (ESLint rule: `@typescript-eslint/no-explicit-any: error`)
- No unsafe type assertions (`as unknown as X`) without a justifying comment
- Strict null checks honoured — no `!` non-null assertions without justification
- Discriminated unions used for result types (`{ ok: true } | { ok: false; reason: string }`)
- Generic types constrained appropriately (no unbounded `<T>`)
- Zod schemas used for runtime validation of external data (YAML, JSON, CLI input)

## Architecture — Hexagonal / DDD
- **Dependency direction:** `cli/ → application/ → domain/ ← infrastructure/`
- Domain layer (`src/domain/`) has zero imports from `infrastructure/`, `application/`, `cli/`, or `node:*` modules
- Port interfaces defined in `src/domain/ports/driven/` — adapters implement them in `src/infrastructure/`
- Use case files in `src/application/` depend only on domain ports, never on concrete adapters
- CLI commands in `src/cli/commands/` only call use cases from the container — no direct domain service calls
- New modules have barrel exports (`index.ts`) and are re-exported from the layer barrel
- Composition root (`src/cli/container.ts`) is the only place adapters are wired to ports

## ESM Compliance
- All relative imports use `.js` extension (required for `"module": "NodeNext"`)
- No CommonJS patterns: no `require()`, no `module.exports`, no `__dirname`/`__filename`
- Use `import.meta.url` + `node:url` if `__dirname` equivalent is needed
- `package.json` has `"type": "module"`

## Correctness
- Error handling uses typed result objects (`{ ok: true } | { ok: false; reason }`) — not thrown exceptions for expected failures
- Edge cases covered: empty arrays, missing entities, duplicate operations, filesystem not found
- Idempotent operations confirmed idempotent (install, project init, ticket create on retry)
- Input validated at the boundary (CLI layer) before reaching use cases

## Async Patterns
- Every `async` function call is `await`ed — no fire-and-forget promises
- No unhandled promise rejections (`process.on('unhandledRejection')` not relied upon)
- `Promise.all` used for independent concurrent operations where appropriate
- No mixing of sync and async APIs for the same resource (e.g., `fs.readFileSync` in an async flow)

## Security
- Child processes use `execFile()` not `exec()` — prevents shell injection
- File paths validated to stay within expected boundaries (`.aeos/`, `~/.aeos/`)
- No secrets, API keys, or tokens written to artifact files or committed to `.aeos/.git`
- User input from CLI args sanitized before use in file paths or shell commands

## Data Integrity
- SQLite multi-step writes wrapped in `db.transaction()` blocks
- `better-sqlite3` singleton connection pattern used (no connection leaks)
- ISO 8601 strings used consistently for all date columns
- Foreign key references valid (ticket IDs in transitions and cost_records)

## Performance
- No synchronous file I/O (`readFileSync`, `writeFileSync`) in hot paths or async orchestration flows
- SQLite queries use prepared statements for repeated operations
- No N+1 patterns when listing tickets with related data
- Temp files cleaned up after use (especially in executor)

## Error Messages
- Every `FAILED` sub-state has a specific, actionable error message
- Error messages include: what failed, the ticket ID, the column, and what the user should do next
- Errors written to `process.stderr`, not `console.log`

## Tests
- Co-located test files (`*.test.ts`) next to source files
- Domain services tested with in-memory SQLite (`:memory:`) — no disk I/O
- Port implementations tested via the port interface, not the concrete class
- Edge cases tested: missing entities, invalid state transitions, empty inputs
- Test fixtures use `os.tmpdir()` / `fs.mkdtempSync()` — no hardcoded paths
- All new code has corresponding test coverage
