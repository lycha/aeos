# Code Review: M1-006 SQLite Schema — Config Centralisation & DB Path Refactor

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Uncommitted changes — `src/shared/config.ts`, `src/infrastructure/persistence/database.ts`, new `src/infrastructure/persistence/database.test.ts`

---

## Overall Assessment

This changeset addresses two prior review findings: (1) adding an `AEOS_HOME` environment variable override to `aeosHome()` for safe integration testing, and (2) adding convenience path wrappers (`aeosHomePath`, `aeosConfigPath`, `aeosRegistryPath`, `aeosDbPath`) to centralise path construction. The `database.ts` module is updated to use `aeosDbPath()` instead of inlining `path.join(aeosHome(), 'state.db')`, and the unused `node:path` import is removed. A comprehensive test file for the database module is added.

The changes are clean, well-scoped, and correctly implement the recommendations from the prior M1-011 review. No Critical issues found. One Minor issue identified regarding a missed opportunity to use the new convenience wrappers in `FsConfigStore`. The test file is thorough, co-located, and uses the `AEOS_HOME` override pattern correctly.

**Verdict:** Approve with changes

---

## Critical Issues

None.

---

## Major Issues

None.

---

## Minor Issues

### m1. `FsConfigStore` does not use the new `aeosConfigPath()` / `aeosRegistryPath()` convenience wrappers

**File:** `src/infrastructure/filesystem/fs-config.adapter.ts` (configPath, registryPath getters)

**Problem:**
`FsConfigStore` still manually constructs paths via `path.join(this.homePath, CONFIG_FILENAME)` and `path.join(this.homePath, REGISTRY_FILENAME)`. The new `aeosConfigPath()` and `aeosRegistryPath()` wrappers in `config.ts` do exactly this. Using them would reduce duplication, remove the `path` and `os` imports from the adapter (since `aeosHome()` is already imported), and ensure all path logic flows through one place.

**Recommendation:**
Refactor `FsConfigStore` to use the new wrappers:
```typescript
import { aeosHome, aeosConfigPath, aeosRegistryPath } from '../../shared/config.js';

private get configPath(): string { return aeosConfigPath(); }
private get registryPath(): string { return aeosRegistryPath(); }
```
This can be done in a follow-up — not blocking.

### m2. `os` import in `FsConfigStore` only used by `ensureGlobalGitignore` — consider `aeosHome()` for homedir

**File:** `src/infrastructure/filesystem/fs-config.adapter.ts` (line 5, 69, 77)

**Problem:**
The `os` import is used in `ensureGlobalGitignore` to resolve `os.homedir()` for the default gitignore path and tilde expansion. This is a legitimate use (it's about the user's home dir, not the AEOS home dir), so this is purely informational — no change needed. However, the `path` import (line 4) could be removed from the top of the file if `configPath`/`registryPath` were refactored per m1, since the remaining uses in `ensureGlobalGitignore` could use `node:path` inline.

**Recommendation:**
Address alongside m1 if refactoring. Low priority.

### m3. Tests cannot run — Node.js v20.9.0 incompatible with Vitest/Rolldown

**File:** `src/infrastructure/persistence/database.test.ts` (all tests)

**Problem:**
`npx vitest run` fails with `SyntaxError: The requested module 'node:util' does not provide an export named 'styleText'`. `node:util.styleText` was added in Node.js 21.7.0 / 22.x. The project specifies Node 22+ but the current environment runs v20.9.0.

**Recommendation:**
Upgrade the local Node.js runtime to v22+ as specified by the project requirements. The test file itself is well-structured — this is an environment issue, not a code issue.

---

## Positive Observations

1. **`AEOS_HOME` override pattern** — Clean implementation using `process.env.AEOS_HOME ?? path.join(...)`. This follows the same pattern as `GIT_DIR`, `DOCKER_CONFIG`, etc. Unblocks safe integration testing across all modules.
2. **`aeosHomePath(...segments)` variadic design** — Accepting rest parameters makes the helper flexible for any sub-path without creating N wrappers.
3. **Convenience wrappers as arrow functions** — `aeosConfigPath`, `aeosRegistryPath`, `aeosDbPath` are concise and self-documenting. Good use of `const` arrow functions for simple delegations.
4. **Removed dead `node:path` import** from `database.ts` — no unused imports left behind.
5. **Comprehensive test coverage** in `database.test.ts`:
   - Singleton behaviour verified (same instance, fresh after reset)
   - Schema idempotency tested (calling `initSchema` twice)
   - WAL journal mode assertion
   - All three tables exercised with INSERT + SELECT
   - Composite primary key enforcement tested
   - Foreign key relationships exercised
   - `AEOS_HOME` env var properly saved/restored in `beforeEach`/`afterEach`
   - Temp directory cleaned up with `fs.rmSync`
6. **Test file is co-located** next to the source file, following project conventions.

---

## Architecture Compliance

- [x] Dependency direction: `cli → application → domain ← infrastructure` — maintained. `database.ts` (infrastructure) imports from `shared/config.ts` (shared kernel). No domain layer violations.
- [x] Domain layer purity: no I/O, no framework imports in `src/domain/` — unchanged.
- [ ] Barrel exports updated for any new modules — N/A (no new modules added).
- [ ] Composition root (`container.ts`) updated if new adapters/use cases added — N/A.

---

## Verification Notes

- `npm run typecheck` — **PASS** (0 errors)
- `npm run lint` — **PASS** (0 errors on changed files)
- `npm test` — **COULD NOT RUN** (Node.js v20.9.0 < required v22+; `styleText` not available)
- Manual inspection confirms: `aeosDbPath()` returns `path.join(aeosHome(), 'state.db')`, matching the previous inline logic in `getDb()`.

---

## Draft PR Summary

**Summary:**
- Added `AEOS_HOME` environment variable override to `aeosHome()` for safe integration testing
- Added `aeosHomePath(...segments)` variadic helper for constructing paths inside `~/.aeos/`
- Added convenience wrappers: `aeosConfigPath()`, `aeosRegistryPath()`, `aeosDbPath()`
- Refactored `database.ts` to use `aeosDbPath()` instead of inline `path.join(aeosHome(), 'state.db')`
- Removed unused `node:path` import from `database.ts`
- Added comprehensive unit tests for database module: singleton, schema idempotency, WAL mode, all tables

**Testing:**
- TypeScript type-check: PASS
- ESLint: PASS
- Unit tests: could not run (Node.js version mismatch — needs v22+)

Please review this summary and confirm it matches the intended changes.
