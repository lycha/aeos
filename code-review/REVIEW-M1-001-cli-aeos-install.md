# Code Review — M1-001: `aeos install` CLI Command

**Reviewer:** Augment Agent (Staff SWE)
**Date:** 2026-04-07
**Scope:** All uncommitted changes — 11 modified files, 2 new test files

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1     |
| Major    | 1     |
| Minor    | 3     |
| Nit      | 2     |

**Verdict:** ⚠️ **Changes Requested** — 1 critical security finding must be resolved before merge.

---

## Findings

### CR-001 · Critical · Shell Injection via `execSync` String Interpolation

**File:** `src/infrastructure/filesystem/fs-config.adapter.ts` (lines 63–66)
**Problem:** `execSync` is called with a template-literal string, which spawns a shell and is vulnerable to injection if `excludesFile` contains shell metacharacters.

```typescript
execSync(`git config --global core.excludesfile ${excludesFile}`, {
  encoding: 'utf-8',
});
```

Although `excludesFile` currently originates from `os.homedir()` + a hardcoded suffix, a home directory path containing spaces or special characters (e.g. `C:\Users\O'Brien`) will break or inject unintended commands. The project rules require `execFile`/`execFileSync` over `exec`/`execSync`.

**Impact:** Potential shell command injection; broken behavior on paths with spaces.

**Fix:**
```typescript
import { execFileSync } from 'node:child_process';

// Reading:
excludesFile = execFileSync('git', ['config', '--global', 'core.excludesfile'], {
  encoding: 'utf-8',
}).trim();

// Writing:
execFileSync('git', ['config', '--global', 'core.excludesfile', excludesFile], {
  encoding: 'utf-8',
});
```

Also update the import at line 5: replace `execSync` with `execFileSync`.

---

### CR-002 · Major · Fragile Entrypoint Detection in `cli/index.ts`

**File:** `src/cli/index.ts` (lines 22–26)
**Problem:** The `isEntrypoint` check relies on `process.argv[1]` ending with a hardcoded suffix:

```typescript
const isEntrypoint =
  process.argv[1] &&
  (process.argv[1].endsWith('/cli/index.js') || process.argv[1].endsWith('/cli/index.ts'));
```

This will fail in common real-world scenarios:
- **`npm link` / global install:** Creates a symlink; `argv[1]` points to the symlink target, not the original path.
- **Windows:** Uses `\` path separators, not `/`.
- **npx / package manager wrappers:** May rewrite `argv[1]`.

**Impact:** CLI may silently not parse commands when installed globally or on Windows.

**Fix:** Use `import.meta.url` to compare against the resolved script path:
```typescript
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

const thisFile = fileURLToPath(import.meta.url);
const isEntrypoint =
  process.argv[1] != null &&
  realpathSync(process.argv[1]) === realpathSync(thisFile);
```

Or, more simply, always parse when the module is the Node entrypoint:
```typescript
// In ESM, the entrypoint script has no reliable argv-based detection.
// Prefer a thin bin/aeos.js wrapper that just imports and calls buildProgram().parse()
```

---

### CR-003 · Minor · Container Exposes Concrete Type Instead of Port Interface

**File:** `src/cli/container.ts` (line 7)
**Problem:** The `Container` interface types `install` as the concrete `InstallUseCase` class instead of the `InstallPort` driving port interface.

```typescript
export interface Container {
  install: InstallUseCase;  // ← leaks concrete type
}
```

**Impact:** Reduces substitutability; tests or alternative implementations must depend on the concrete class.

**Fix:**
```typescript
import type { InstallPort } from '../domain/ports/driving/install.port.js';

export interface Container {
  install: InstallPort;
}
```

---

### CR-004 · Minor · `writeRegistry` Silently Skips Write — Contract Mismatch

**File:** `src/infrastructure/filesystem/fs-config.adapter.ts` (lines 50–54)
**Problem:** `writeRegistry()` returns early without writing when the file already exists:

```typescript
writeRegistry(entries: ProjectRegistryEntry[]): void {
  if (fs.existsSync(this.registryPath)) return;
  // ...
}
```

The port interface (`ConfigStore.writeRegistry`) has no indication this is a "write-if-not-exists" operation. The method name implies an unconditional write. If a future caller expects to update the registry, this will silently do nothing.

**Impact:** Potential data integrity bug in future use cases that need to update the registry.

**Recommendation:** Either:
1. Rename to `writeRegistryIfNotExists()` on both port and adapter, or
2. Remove the guard and always write (the caller controls when to write), or
3. Add a JSDoc comment to the port interface documenting the idempotent-create semantics.

---

### CR-005 · Minor · Use Case Returns `void` Instead of a Result Type

**File:** `src/application/install.use-case.ts` (line 10)
**Problem:** `execute(): void` relies on thrown exceptions for error signaling. The CLI command wraps it in try/catch, but this pattern is less type-safe than a discriminated union Result type.

**Impact:** No compile-time guarantee that all errors are handled; easy to forget try/catch at new call sites.

**Recommendation:** Consider a `Result<void, InstallError>` return type (not blocking for M1, but track as tech debt).

---

### CR-006 · Nit · Node.js Version Mismatch

**File:** `package.json` (`"engines": { "node": ">=22" }`)
**Observation:** The project requires Node ≥22, but the local environment is running Node 20.9.0. Vitest 4.x requires `node:util#styleText` which was added in Node 21.7+. Tests cannot run locally.

**Impact:** Tests cannot be executed in the current environment.

**Recommendation:** Upgrade the local Node.js version to ≥22 or add an `.nvmrc` / `.node-version` file to enforce the correct version.

---

### CR-007 · Nit · Drive-by Newline Fix

**File:** `src/domain/services/index.ts`
**Observation:** Added trailing newline to fix missing EOF newline. Harmless and correct — just flagging it as a drive-by change.

---

## Positive Observations ✅

1. **Clean hexagonal layering:** Domain ports are pure interfaces with zero external imports. Application use case depends only on ports. Infrastructure adapter implements the driven port. CLI wires everything via the composition root. Dependency direction `cli → application → domain ← infrastructure` is respected.

2. **Excellent test coverage:** Unit test with mocked ports verifies use-case orchestration and call order. Integration test uses a real temp directory for filesystem operations. Both are co-located with their source files.

3. **ESM compliance:** All imports use `.js` extensions. `package.json` has `"type": "module"`. No CommonJS patterns.

4. **Idempotent install:** `writeConfigIfNotExists` and `writeRegistry` guard against overwriting existing user data — safe for re-running `aeos install`.

5. **Proper Commander.js integration:** Command registration is cleanly separated from the program builder, enabling testability.

---

## Required Fixes Before Merge

| ID     | Severity | Action |
|--------|----------|--------|
| CR-001 | Critical | Replace `execSync` with `execFileSync` and array arguments in `fs-config.adapter.ts` |
| CR-002 | Major    | Replace `process.argv[1].endsWith()` with `import.meta.url`-based detection or extract to a thin bin wrapper |

---

## Draft PR Summary

> **`aeos install` — Global Setup Command (M1-001)**
>
> Implements the `aeos install` CLI command that performs one-time global setup:
> - Creates `~/.aeos/` directory
> - Writes default `config.json` (model, currency, advance mode)
> - Initializes empty `registry.json`
> - Configures `.aeos/` in the global gitignore
>
> **Architecture:** Hexagonal — `InstallPort` (driving port) → `InstallUseCase` (application) → `ConfigStore` (driven port) ← `FsConfigStore` (infrastructure adapter). Wired via composition root in `cli/container.ts`.
>
> **Dependencies added:** `commander@^14.0.3` (CLI framework), `@types/node@^25.5.2` (dev).
>
> **Tests:** Unit test for use-case orchestration, integration test for filesystem adapter against real temp directory.
