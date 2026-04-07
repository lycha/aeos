# Code Review — M1-014: `gitCommit(message, files[])` Filesystem Helper

**Reviewer:** Augment Agent (Staff SWE)
**Date:** 2026-04-07
**Scope:** Uncommitted changes — `git diff HEAD` (6 files, +91 −4)
**Verdict:** ✅ **Approve with Minor suggestions**

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 Major | 0 |
| 🟡 Minor | 3 |
| 🔵 Nit | 2 |
| ✅ Positive | 5 |

---

## Findings

### 🟡 M-001 — Empty `files` array not guarded

**File:** `src/infrastructure/git/simple-git-gateway.adapter.ts:23`
**Problem:** If `gitCommit()` is called with an empty `files` array, `git.add([])` is called followed by `git.commit()`. Behaviour depends on `simple-git`'s handling of an empty array — it may stage nothing and then hit the "nothing to commit" path, but it's implicit, not intentional.
**Impact:** Could silently succeed or produce confusing errors in edge cases.
**Recommendation:** Add an early return or explicit guard at the top of `gitCommit()`:
```typescript
if (files.length === 0) return;
```
**Test gap:** No test for the empty-files-array case.

---

### 🟡 M-002 — `realpathSync` throws on non-existent file

**File:** `src/infrastructure/git/simple-git-gateway.adapter.ts:30`
**Problem:** `fs.realpathSync(path.resolve(file))` will throw `ENOENT` if the file doesn't exist yet (e.g., caller stages a path before writing). The thrown error is an opaque `ENOENT` rather than the descriptive "outside .aeos/" message.
**Impact:** Confusing error message if a caller passes a not-yet-written path.
**Recommendation:** Either document that files must already exist, or catch `ENOENT` in the validation loop and throw a descriptive error:
```typescript
let resolved: string;
try {
  resolved = fs.realpathSync(path.resolve(file));
} catch {
  throw new Error(`Git commit failed in .aeos/: file "${file}" does not exist`);
}
```

---

### 🟡 M-003 — Port method naming inconsistency

**File:** `src/domain/ports/driven/git-gateway.port.ts:17`
**Problem:** The new method is named `gitCommit` while the existing method is `commit`. The `git` prefix is redundant on an interface already named `GitGateway`. This creates an asymmetric API: `gateway.commit(dir, msg)` vs `gateway.gitCommit(msg, files)`.
**Impact:** API ergonomics and readability. Callers must remember which method has the prefix.
**Recommendation:** Consider renaming to `commitFiles` or `commitSelective` to distinguish from `commit` without the redundant `git` prefix. This is a naming nit — if the team has consciously chosen this name, it's fine to keep.

---

### 🔵 N-001 — `root` parameter leaks infrastructure concern into domain port

**File:** `src/domain/ports/driven/git-gateway.port.ts:17`
**Problem:** The `root?: string` parameter and the `@param root` JSDoc reference `projectRoot()` — a function from the infrastructure layer. Domain ports should be infrastructure-agnostic.
**Impact:** Mild DDD purity concern. The port's contract subtly references infrastructure behaviour.
**Recommendation:** The optional `root` parameter itself is fine (it's just a string), but the JSDoc should avoid referencing `projectRoot()`. Suggested: `@param root  Optional project root directory; defaults to auto-detected root`.

---

### 🔵 N-002 — Test uses `process.chdir()` (global state mutation)

**File:** `src/infrastructure/git/simple-git-gateway.adapter.test.ts:33`
**Problem:** Tests mutate `process.cwd()` globally. While `afterEach` restores it, if a test throws before cleanup, parallel tests could be affected.
**Impact:** Low — Vitest runs tests in the same file serially, and `afterEach` is always called even on failure. But it's a fragile pattern.
**Recommendation:** Acceptable for now since the explicit `root` parameter test (line 136) already demonstrates the non-cwd path. Consider migrating other tests to use explicit `root` parameter to reduce `process.chdir()` usage.

---

## ✅ Positive Observations

1. **Path traversal prevention** — Symlink-aware `realpathSync` validation prevents committing files outside `.aeos/`. This is a solid security boundary.

2. **Domain purity preserved** — `git-gateway.port.ts` has zero imports. The domain port remains clean.

3. **Error wrapping** — Infrastructure errors are caught and re-thrown with context (`Git commit failed in .aeos/: ...`). This follows the project's error handling pattern.

4. **Idempotent on empty diff** — The "nothing to commit" case is explicitly handled rather than bubbling up as an error. Good defensive design.

5. **Comprehensive test suite** — 7 tests covering: happy path, verbatim message, empty diff, outside-directory rejection, corrupt repo, multi-file commit, and explicit root. All key scenarios from the task spec are covered.

---

## Architecture Compliance

| Check | Status |
|-------|--------|
| Domain has zero external imports | ✅ |
| Dependency direction: infra → domain | ✅ |
| Port defines contract, adapter implements | ✅ |
| No `any` types | ✅ |
| ESM `.js` extensions in imports | ✅ |
| `execFile` used (not `exec`) | ✅ |
| Strict null checks respected | ✅ |
| ESLint clean | ✅ |
| TypeScript compiles (`tsc --noEmit`) | ✅ |

---

## Mock Updates in Existing Tests

The mock updates in `project-init.use-case.test.ts` and `ticket-create.use-case.test.ts` correctly add `gitCommit: vi.fn().mockResolvedValue(undefined)` to satisfy the expanded `GitGateway` interface. ✅

---

## Draft PR Summary

> **M1-014: Add `gitCommit(message, files[])` to GitGateway**
>
> Adds a selective file-staging commit method to the `GitGateway` port and its `SimpleGitGateway` adapter, backed by the `simple-git` library. This enables callers to commit specific files to the `.aeos/.git` artifact repo with format-agnostic commit messages.
>
> **Changes:**
> - Extended `GitGateway` port with async `gitCommit(message, files[], root?)` method
> - Implemented in `SimpleGitGateway` with path traversal validation (symlink-aware)
> - Handles empty diff gracefully (no-op, no error)
> - Added `simple-git` as production dependency
> - 7 integration tests using temp git repos
> - Updated mocks in existing use-case tests
