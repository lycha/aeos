# Code Review: M1-013 — `artifactPath()` / `writeArtifact()` / `listArtifacts()` Filesystem Helpers

**Date:** 2026-04-07
**Reviewer:** Staff SWE (Augment Agent)
**Scope:** Uncommitted changes — `src/infrastructure/filesystem/fs-artifact-store.adapter.ts` (modified), `src/infrastructure/filesystem/fs-artifact-store.adapter.test.ts` (new, untracked)

---

## Overall Assessment

The changeset adds three standalone helper functions (`artifactPath`, `writeArtifact`, `listArtifacts`) to the existing `FsArtifactStore` adapter module. The implementation is clean, well-documented, and the test file provides thorough coverage of all acceptance criteria from M1-013. However, there is one **Critical** security gap: the new standalone functions bypass the path traversal validation that the class methods enforce via `validatePathComponent()`. This must be fixed before merge.

**Verdict:** Request changes

---

## Critical Issues

### C1. Missing path traversal validation on standalone functions

**File:** `src/infrastructure/filesystem/fs-artifact-store.adapter.ts` (`artifactPath`, `writeArtifact`, `listArtifacts`)

**Problem:**
The existing `FsArtifactStore` class validates `ticketId` and `filename` via `validatePathComponent()`, rejecting values containing `..`, `/`, or `path.sep`. The new standalone functions accept `ticketId` and `artifactName` directly and pass them to `path.join()` without any validation.

A malicious or malformed `ticketId` like `../../etc` or `artifactName` like `../../../.bashrc` would escape the `.aeos/tickets/` boundary:

```typescript
artifactPath('../../etc', 'passwd')
// → <root>/.aeos/tickets/../../etc/../../etc-passwd
// resolves to <root>/../etc-passwd  (outside project!)

writeArtifact('AEOS-1', '../../../.env', 'OVERWRITTEN', root)
// → writes outside .aeos/tickets/
```

**Impact:**
Path traversal — arbitrary file read (via `listArtifacts`) and arbitrary file write (via `writeArtifact`) outside the `.aeos/` sandbox. This matches the Critical severity definition: "Path traversal allowing reads/writes outside `.aeos/` boundary."

**Recommendation:**
Reuse or extract `validatePathComponent` from the class and call it at the top of each standalone function:

```typescript
function validatePathComponent(value: string, name: string): void {
  if (value.includes('..') || value.includes(path.sep) || value.includes('/')) {
    throw new Error(`Invalid ${name}: must not contain path separators or '..' segments`);
  }
}

export function artifactPath(ticketId: string, artifactName: string, root?: string): string {
  validatePathComponent(ticketId, 'ticketId');
  validatePathComponent(artifactName, 'artifactName');
  return path.join(aeosDir(root), TICKETS_DIR, ticketId, `${ticketId}-${artifactName}`);
}
```

Apply the same validation at the entry of `writeArtifact` and `listArtifacts` (they delegate to `artifactPath` for the path, but `listArtifacts` constructs `dir` independently and must also validate `ticketId`).

Add tests for traversal rejection:
```typescript
it('rejects ticketId with path traversal', () => {
  expect(() => artifactPath('../../etc', 'passwd')).toThrow(/path separators/);
});
it('rejects artifactName with path traversal', () => {
  expect(() => writeArtifact('AEOS-1', '../../../.env', 'x', tmpDir)).toThrow(/path separators/);
});
```

---

## Major Issues

None.

---

## Minor Issues

### m1. Return-type inconsistency between standalone `listArtifacts` and class `listArtifacts`

**File:** `src/infrastructure/filesystem/fs-artifact-store.adapter.ts` (lines 46–61 vs 82–90)

**Problem:**
The standalone `listArtifacts()` returns **full absolute paths** (`path.join(dir, f)`), while the class method `FsArtifactStore.listArtifacts()` returns **bare filenames** (from `readdirSync` directly). Callers switching between the two will get different shapes.

**Recommendation:**
This is by design per the task spec ("Return full paths"), so no change needed now, but add a JSDoc note on the standalone function clarifying it returns absolute paths — and consider aligning the class method in a future task if both APIs are meant to be interchangeable.

### m2. `AEOS_DIR` constant is partially redundant

**File:** `src/infrastructure/filesystem/fs-artifact-store.adapter.ts` (line 8)

**Problem:**
The new standalone functions use `aeosDir(root)` (which internally appends `.aeos`), so they never reference the local `AEOS_DIR` constant. Only the class methods still use `AEOS_DIR`. This creates two path-construction strategies in the same file.

**Recommendation:**
No immediate change required. When the class methods are refactored to use `aeosDir()` in a future task, `AEOS_DIR` can be removed entirely.

---

## Positive Observations

1. **Excellent JSDoc with examples** — `artifactPath()` includes a concrete example showing input → output, making the naming convention instantly clear.
2. **Thorough test coverage** — 12 test cases covering path construction, write round-trip, auto-directory creation, prefix filtering, non-`.md` extensions, cross-ticket isolation, and both `ENOENT` scenarios (missing ticket dir, missing `tickets/` parent).
3. **Correct `ENOENT` handling** — `listArtifacts` catches only `ENOENT` and re-throws other errors, avoiding the "swallow all" anti-pattern.
4. **Proper `recursive: true`** — `writeArtifact` uses `fs.mkdirSync(path.dirname(filePath), { recursive: true })`, handling both missing `tickets/` parent and ticket subdirectory in one call.
5. **Test fixtures use `os.tmpdir()`** — Tests create and clean up temp directories properly, following project conventions.

---

## Architecture Compliance

- [x] Dependency direction: `cli → application → domain ← infrastructure`
- [x] Domain layer purity: no I/O in `src/domain/` — all new code is in `src/infrastructure/`
- [x] Barrel exports: no new module; functions added to existing adapter file
- [x] Composition root (`container.ts`): no changes needed — standalone functions, not new adapters

---

## Verification Notes

- `npm run typecheck` — **PASS** (tsc --noEmit clean)
- `npm run lint` — **PASS** (eslint clean on changed file)
- `npm test` — **SKIPPED** (Vitest requires Node 22+ for `styleText`; test file structure verified manually)

---

## Draft PR Summary

**Summary:**
- Added `artifactPath(ticketId, artifactName, root?)` — returns canonical path `<root>/.aeos/tickets/<ticketId>/<ticketId>-<artifactName>`
- Added `writeArtifact(ticketId, artifactName, content, root?)` — writes content to canonical path, auto-creates directories
- Added `listArtifacts(ticketId, root?)` — lists all artifact files matching ticket prefix, returns `[]` for missing directories
- Added 12 unit tests covering all acceptance criteria

**Blocking:**
- **C1:** Add path traversal validation to all three standalone functions before merge.

**Testing:**
- 12 Vitest tests in `fs-artifact-store.adapter.test.ts`
- TypeScript strict mode — clean
- ESLint — clean

Please review this summary and confirm it matches the intended changes.
