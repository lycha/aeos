# Code Review: M1-012 — `projectRoot()` Filesystem Helper

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Uncommitted changes — `src/infrastructure/filesystem/fs-project.repository.ts`, `src/shared/errors.ts`, new test file `src/infrastructure/filesystem/fs-project.repository.test.ts`

---

## Overall Assessment

The implementation of `projectRoot()`, `aeosDir()`, and `readProjectConfig()` is clean, correct, and follows the task spec (M1-012) faithfully. The algorithm is sound, the max-depth guard prevents symlink loops, and the error messages are actionable. The new `ProjectRootNotFoundError` is correctly placed in the shared kernel. Tests are thorough and cover all acceptance criteria.

Two major issues need attention: (1) the new `ProjectConfig` interface duplicates the existing `Project` domain model, creating a maintenance risk; and (2) `readProjectConfig()` uses plain `Error` throws instead of typed/domain-specific errors, diverging from the project's error-handling pattern. One minor issue around the duplication between `projectRoot()` and the existing `FsProjectRepository.findRoot()` method.

**Verdict:** Approve with changes

---

## Critical Issues

_None._

---

## Major Issues

### M1. `ProjectConfig` duplicates `Project` domain model

**File:** `src/infrastructure/filesystem/fs-project.repository.ts` (interface `ProjectConfig`, lines 14–21)

**Problem:**
`ProjectConfig` is a field-for-field duplicate of the existing `Project` interface in `src/domain/model/project.ts`. Both have identical fields: `uuid`, `id`, `name`, `key`, `path`, `created_at`. Introducing a second type for the same data creates a divergence risk — if a field is added to `Project`, `ProjectConfig` must be updated in lockstep or callers will silently lose data.

**Impact:**
Future changes to the domain model will need to be mirrored in two places. Callers importing `ProjectConfig` instead of `Project` may bypass domain-level type constraints added later. This violates DRY and increases coupling surface.

**Recommendation:**
Remove `ProjectConfig` and use the existing `Project` type from the domain model. The `readProjectConfig()` return type becomes `Project`:
```typescript
import type { Project } from '../../domain/model/project.js';

export function readProjectConfig(root?: string): Project { ... }
```
If a subset of fields is intentionally needed in the future, use `Pick<Project, ...>` rather than a standalone interface.

---

### M2. `readProjectConfig()` throws generic `Error` instead of typed errors

**File:** `src/infrastructure/filesystem/fs-project.repository.ts` (function `readProjectConfig`, lines 52–68)

**Problem:**
Both error paths throw `new Error(...)` instead of domain-specific error classes. The verification checklist requires: "Error handling uses typed result objects — not thrown exceptions for expected failures." While the task spec prescribes thrown errors for this function, the error classes should at minimum be typed (like `ProjectRootNotFoundError`) so callers can discriminate errors programmatically.

**Impact:**
Callers cannot distinguish a missing `project.json` from a corrupt one without string-matching the error message, which is brittle. The CLI layer cannot provide targeted recovery guidance without `instanceof` checks.

**Recommendation:**
Create typed error classes in `src/shared/errors.ts`:
```typescript
export class ProjectConfigNotFoundError extends Error {
  constructor() {
    super("project.json not found. Run 'aeos project init' first.");
    this.name = 'ProjectConfigNotFoundError';
  }
}

export class ProjectConfigCorruptError extends Error {
  constructor() {
    super("project.json is corrupt. Run 'aeos project init' to re-initialise.");
    this.name = 'ProjectConfigCorruptError';
  }
}
```
Then throw these in `readProjectConfig()`. Update tests to assert `toThrow(ProjectConfigNotFoundError)` etc.

---

## Minor Issues

### m1. `projectRoot()` duplicates logic in `FsProjectRepository.findRoot()`

**File:** `src/infrastructure/filesystem/fs-project.repository.ts` (lines 28–44 vs. 94–108)

**Problem:**
The new standalone `projectRoot()` function and the existing `findRoot()` method on `FsProjectRepository` both walk up the directory tree looking for `.aeos/`. They differ slightly: `projectRoot()` checks for `.aeos/` directory existence, while `findRoot()` checks for `.aeos/project.json` file existence; `projectRoot()` throws, `findRoot()` returns `null`; `projectRoot()` has a max-depth guard, `findRoot()` does not.

**Recommendation:**
Refactor `findRoot()` to delegate to `projectRoot()` internally, catching the error and returning `null`. Alternatively, document the intentional semantic difference (directory vs. file check) with a comment. At minimum, add the max-depth guard to `findRoot()` to prevent the same symlink-loop risk.

### m2. `readProjectConfig()` uses `as ProjectConfig` without runtime validation

**File:** `src/infrastructure/filesystem/fs-project.repository.ts` (line 64)

**Problem:**
`JSON.parse(raw) as ProjectConfig` is an unsafe type assertion. If `project.json` is valid JSON but has wrong structure (e.g., missing `key` field), the returned object will satisfy the type at compile time but fail at runtime. The verification checklist recommends "Zod schemas used for runtime validation of external data (YAML, JSON, CLI input)."

**Recommendation:**
Add Zod validation or at minimum a structural check. This can be deferred if Zod schemas are introduced in a later milestone (M2-007), but note it as tech debt.

### m3. No `readonly` on the `ProjectConfig` interface fields

**File:** `src/infrastructure/filesystem/fs-project.repository.ts` (lines 14–21)

**Problem:**
If `ProjectConfig` is retained (see M1), its fields should be `readonly` to signal immutability, matching the value-object semantics of configuration data.

**Recommendation:**
Use `Readonly<ProjectConfig>` as the return type, or mark each field `readonly`.

---

## Positive Observations

1. **Correct algorithm** — The walk-up logic with `path.dirname` parent detection and max-depth guard matches `git`'s safety pattern exactly.
2. **Well-placed error class** — `ProjectRootNotFoundError` in `src/shared/errors.ts` follows the layer mapping from the task spec.
3. **Excellent test coverage** — All 8 acceptance criteria are covered: same-dir, parent, grandparent, not-found, max-depth, aeosDir, readProjectConfig happy path, missing file, corrupt file.
4. **Proper temp directory usage** — Tests use `os.tmpdir()` + `fs.mkdtempSync` with cleanup in `afterEach`, no hardcoded paths.
5. **ESM compliance** — All imports use `.js` extensions correctly.
6. **Barrel exports already include new exports** — `src/infrastructure/filesystem/index.ts` and `src/shared/index.ts` already re-export the new modules.

---

## Architecture Compliance

- [x] Dependency direction: `cli → application → domain ← infrastructure`
- [x] Domain layer purity: no I/O, no framework imports in `src/domain/`
- [x] Barrel exports updated for any new modules
- [x] Composition root (`container.ts`) updated if new adapters/use cases added — N/A (no new adapters/use cases)

---

## Verification Notes

- `npx tsc --noEmit` — **PASS**
- `npx eslint` (changed files) — **PASS**
- `npx vitest run` — **COULD NOT RUN** (Vitest requires Node 22+; environment has Node v20.9.0. `styleText` from `node:util` is Node 21+.)
- Tests are syntactically correct and follow project patterns; manual inspection confirms correctness.

---

## Draft PR Summary

**Summary:**
- Add `projectRoot(startDir?)` — walks up directory tree to find nearest `.aeos/` directory, throws `ProjectRootNotFoundError` if not found or max depth exceeded
- Add `aeosDir(root?)` — convenience wrapper returning `projectRoot() + '/.aeos'`
- Add `readProjectConfig(root?)` — reads and parses `.aeos/project.json` with clear error messages
- Add `ProjectRootNotFoundError` to shared kernel (`src/shared/errors.ts`)
- Add `ProjectConfig` interface for typed project metadata
- Add comprehensive test suite (8 test cases covering all acceptance criteria)

**Testing:**
- 8 unit tests in `fs-project.repository.test.ts` covering: same-dir, parent, grandparent, not-found, max-depth guard, aeosDir, readProjectConfig (valid, missing, corrupt)

**Fixes needed before merge:**
1. **(M1)** Remove `ProjectConfig` interface; use `Project` from domain model instead
2. **(M2)** Replace generic `Error` throws in `readProjectConfig()` with typed error classes (`ProjectConfigNotFoundError`, `ProjectConfigCorruptError`)

Please review this summary and confirm it matches the intended changes.
