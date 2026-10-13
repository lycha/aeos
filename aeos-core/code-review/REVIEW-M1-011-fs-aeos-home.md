# Code Review: M1-011 — `aeosHome()` Unit Tests

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Uncommitted changes — `src/shared/config.test.ts` (new file)

---

## Overall Assessment

The test file is well-structured, covers all six acceptance criteria from the task spec, and follows project conventions (co-located `*.test.ts`, proper ESM imports with `.js` extension, Vitest usage). Environment variable isolation via `beforeEach`/`afterEach` is correctly implemented — the original `AEOS_HOME` value is saved and restored, preventing cross-test pollution.

No Critical or Major issues found. Two Minor issues relate to duplicated test setup boilerplate and a redundant test case. The production code in `src/shared/config.ts` is already committed and correctly implements the `AEOS_HOME` override and all three convenience wrappers (`aeosConfigPath`, `aeosRegistryPath`, `aeosDbPath`).

**Verdict:** Approve with minor suggestions

---

## Critical Issues

None.

---

## Major Issues

None.

---

## Minor Issues

### m1. Duplicated `beforeEach`/`afterEach` env var boilerplate across 3 describe blocks

**File:** `src/shared/config.test.ts` (lines 7–20, 56–67, 87–98)

**Problem:**
The same env var save/restore pattern is repeated verbatim in all three `describe` blocks. This is 36 lines of pure duplication. If the cleanup logic needs to change (e.g., adding a second env var), all three copies must be updated.

**Recommendation:**
Extract to a shared helper or use a single outer `describe` with a single `beforeEach`/`afterEach`:

```typescript
function withAeosHomeEnv(value?: string) {
  let original: string | undefined;
  beforeEach(() => {
    original = process.env['AEOS_HOME'];
    if (value !== undefined) {
      process.env['AEOS_HOME'] = value;
    } else {
      delete process.env['AEOS_HOME'];
    }
  });
  afterEach(() => {
    if (original !== undefined) {
      process.env['AEOS_HOME'] = original;
    } else {
      delete process.env['AEOS_HOME'];
    }
  });
}
```

### m2. Redundant test — "cross-platform safety" is identical to "default path" test

**File:** `src/shared/config.test.ts` (lines 46–50 vs lines 28–31)

**Problem:**
The test at line 46 ("should use path.join for cross-platform safety") asserts exactly the same thing as the test at line 28 ("should default to `<homedir>/.aeos`"):

```typescript
// Line 29-30
expect(result).toBe(path.join(os.homedir(), '.aeos'));

// Line 49 — identical assertion
expect(result).toBe(path.join(os.homedir(), '.aeos'));
```

Both delete `AEOS_HOME` and compare against `path.join(os.homedir(), '.aeos')`. The cross-platform intent is already validated by the default-path test since it uses `path.join`.

**Recommendation:**
Remove the duplicate test or, if the intent is to explicitly test that no hardcoded `/` separators appear, assert on separator absence instead:

```typescript
it('should not contain hardcoded path separators', () => {
  const result = aeosHome();
  // The path should be constructed via path.join, not string concat
  expect(result).not.toContain('//');
});
```

---

## Positive Observations

1. **Correct ESM import** — `from './config.js'` with `.js` extension; will resolve correctly under `"module": "NodeNext"`.
2. **Env var isolation** — saves original value and restores it in `afterEach`, including handling `undefined` vs missing. This prevents test pollution even if a real `AEOS_HOME` is set in the developer's shell.
3. **Acceptance criteria coverage** — all six ACs from the task spec are covered by at least one test.
4. **No filesystem I/O** — tests only exercise pure path string construction, matching the "Out of Scope" constraint from the task.
5. **Bracket notation for env access** — `process.env['AEOS_HOME']` avoids TypeScript index-signature issues with `process.env.AEOS_HOME`.

---

## Architecture Compliance

- [x] Dependency direction: test imports from `src/shared/config.js` — valid (shared → shared)
- [x] Domain layer purity: no domain code touched
- [x] Barrel exports updated: N/A (test files are not exported)
- [x] Composition root: N/A (no new adapters/use cases)

---

## Verification Notes

- `npm run typecheck` — **PASS**
- `npm run lint` (on `src/shared/config.test.ts`) — **PASS**
- `npx vitest run src/shared/config.test.ts` — **FAIL** (Node 20.9.0 environment issue — Vitest/Rolldown requires `node:util.styleText` from Node 21+; not a test code defect)

---

## Draft PR Summary

**Summary:**
- Added unit tests for `aeosHome()`, `aeosHomePath()`, and convenience wrappers (`aeosConfigPath`, `aeosRegistryPath`, `aeosDbPath`) in `src/shared/config.test.ts`
- Tests cover: default path resolution, `AEOS_HOME` env var override, path segment joining, convenience wrapper equivalence
- All tests use proper env var isolation via `beforeEach`/`afterEach`

**Testing:**
- 11 test cases across 3 describe blocks
- Typecheck: PASS | Lint: PASS
- Vitest: blocked by Node version mismatch in local env (not a code issue)

Please review this summary and confirm it matches the intended changes.
