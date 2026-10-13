# Code Review: M1-011 — `aeosHome()` Filesystem Helper

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Task specification document — `docs/tasks/M1-011-fs-aeos-home.md`

---

## Overall Assessment

The task is tight, focused, and correctly scoped. Pure path-resolution functions with zero side effects, centralised in one location, using `node:path` for cross-platform safety — this is exactly the right abstraction. The convenience wrappers (`aeosConfigPath`, `aeosRegistryPath`) reduce call-site noise across M1-001, M1-002, and M1-006. The layer mapping and placement guidance are sound.

There is one Major issue: the function does not support an `AEOS_HOME` environment variable override, which makes integration testing impossible without mocking `os.homedir()` — every test that exercises the full path (M1-001, M1-002, M1-006) would read/write the real `~/.aeos/`. One Minor issue covers a missing `aeosDbPath()` convenience wrapper that M1-006 already expects.

**Verdict:** Approve with changes

---

## Major Issues

### M1. No environment variable override — integration tests will hit the real `~/.aeos/`

**File:** `docs/tasks/M1-011-fs-aeos-home.md` — `aeosHome()` implementation

**Problem:**
The implementation is:
```typescript
export function aeosHome(): string {
  return join(homedir(), '.aeos');
}
```

This always resolves to the operator's real home directory. Any integration test that exercises the full path chain — `aeosHome()` → `aeosRegistryPath()` → read/write `registry.json` — will read and write the operator's actual `~/.aeos/registry.json`. This is destructive and non-deterministic.

Common solutions:
1. **Environment variable override:** `process.env.AEOS_HOME ?? join(homedir(), '.aeos')` — standard pattern used by git (`GIT_DIR`), npm (`npm_config_cache`), Docker (`DOCKER_CONFIG`).
2. **Dependency injection:** pass the home dir as a parameter — but this conflicts with the zero-argument `getDb()` design in M1-006, which calls `aeosHomePath('state.db')` internally.

Option 1 is simpler and doesn't require changing any downstream signatures. Tests set `process.env.AEOS_HOME = tmpDir` in `beforeEach` and clean up in `afterEach`.

**Impact:**
- M1-001 integration tests (creates `~/.aeos/`, writes `config.json`, `registry.json`) would corrupt the operator's real config.
- M1-006 integration tests (creates `state.db`) would corrupt the operator's real database.
- CI/CD environments have no `~/.aeos/` and may fail unpredictably depending on the runner's home directory permissions.

**Recommendation:**
Update the implementation to:
```typescript
export function aeosHome(): string {
  return process.env.AEOS_HOME ?? join(homedir(), '.aeos');
}
```

Add an AC: "Given `AEOS_HOME=/tmp/test-aeos`, when calling `aeosHome()`, then it returns `/tmp/test-aeos` (not `~/.aeos/`)."

Add a Technical Note: "`AEOS_HOME` is intended for testing and development. It is not documented as a user-facing feature. Production always uses `~/.aeos/`."

---

## Minor Issues

### m1. Missing `aeosDbPath()` convenience wrapper — M1-006 inlines it

**File:** `docs/tasks/M1-011-fs-aeos-home.md` — convenience wrappers

**Problem:**
The task exports `aeosConfigPath()` and `aeosRegistryPath()` as convenience wrappers. M1-006 calls `aeosHomePath('state.db')` to resolve the database path. This is the third most-used global path in the system (after config and registry).

Without a named wrapper, every caller that needs the DB path writes `aeosHomePath('state.db')` — the string `'state.db'` is scattered across the codebase. If the DB filename ever changes (e.g. to `aeos.db`), every call site breaks.

**Recommendation:**
Add a convenience wrapper alongside the existing ones:
```typescript
export const aeosDbPath = () => aeosHomePath('state.db');
```

Update M1-006 to use `aeosDbPath()` instead of `aeosHomePath('state.db')`.

---

## Positive Observations

1. **Zero side effects** — pure path resolution with no filesystem I/O. This is explicitly called out in Out of Scope and Technical Notes. Correct separation of concerns.
2. **`node:path.join`** for all path construction — no string concatenation, cross-platform safe. The Windows AC (line 42) explicitly tests this.
3. **Rest parameter `...segments`** on `aeosHomePath()` — supports arbitrary nesting (e.g. `aeosHomePath('projects', projectId, 'state.db')`) without needing a new function per path.
4. **Layer mapping** is clearly documented with infrastructure adapter placement and the domain port boundary.
5. **Convenience wrappers as arrow functions** — `const aeosConfigPath = () => ...` is cleaner than a full `function` declaration for one-liner delegates.

---

## Verification Notes

- After M1 fix: set `AEOS_HOME=/tmp/test-aeos` in a test, call `aeosHome()`, verify it returns `/tmp/test-aeos`. Unset the env var, call again, verify it returns `~/.aeos/`.
- After m1 fix: update M1-006's `getDb()` to use `aeosDbPath()` instead of `aeosHomePath('state.db')`.
- Cross-reference: verify M1-001, M1-002, and M1-006 all import from the same file and do not hardcode `os.homedir()`.

---

## Draft PR Summary

**Scope:** M1-011 task specification document
**Changes needed before implementation:**

- **`aeosHome()`:** Support `AEOS_HOME` environment variable override for testing. Add AC for env var behaviour. Document as internal/testing-only.
- **Convenience wrappers:** Add `aeosDbPath()` alongside `aeosConfigPath()` and `aeosRegistryPath()`. Update M1-006 to reference it.
