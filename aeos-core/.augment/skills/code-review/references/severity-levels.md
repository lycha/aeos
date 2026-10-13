# Severity Levels

Use consistent severity labels so the reviewer and author can prioritize fixes quickly.

## Critical (C)
**Definition:** Security vulnerabilities, data corruption, or correctness issues that can cause major user impact, legal exposure, or irreversible damage. Must be fixed before merge.

**Examples:**
- Shell injection via `exec()` instead of `execFile()` with user-supplied input
- Path traversal allowing reads/writes outside `.aeos/` boundary
- SQLite transaction missing on multi-step writes — data left in inconsistent state
- Unvalidated `any` cast bypassing type safety on security-sensitive data
- Secrets or API keys written to artifact files or logs

## Major (M)
**Definition:** Significant correctness, reliability, or maintainability issues that can cause outages, hard-to-debug errors, or future regressions. Should be addressed before merge or immediately after with a tracked task.

**Examples:**
- Hexagonal layer violation: domain importing from infrastructure or CLI
- Explicit `any` type (`@typescript-eslint/no-explicit-any` is set to `error`)
- Unhandled promise rejection or missing `await` on async operation
- Broad `catch (e)` swallowing errors without typed result handling
- Missing `.js` extension in ESM imports (causes runtime `ERR_MODULE_NOT_FOUND`)
- Domain entity with side effects (I/O, filesystem, database calls in `src/domain/`)
- Missing unit tests for domain services or state machine logic
- Non-idempotent operations that should be idempotent (install, project init)

## Minor (m)
**Definition:** Style, clarity, or low-risk refactors that improve readability or consistency without blocking merge.

**Examples:**
- Inconsistent naming or duplicate helpers across modules
- Missing barrel export in an `index.ts` for a new module
- `console.log` instead of structured error output to `process.stderr`
- Unused imports or dead code in the diff
- Missing JSDoc on a public port interface method
- Test using hardcoded paths instead of `os.tmpdir()` / temp directory fixtures
