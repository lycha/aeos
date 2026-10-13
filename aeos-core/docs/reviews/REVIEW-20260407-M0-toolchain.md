# Code Review: M0 — Repo & Toolchain Setup (Tasks M0-001 through M0-007)

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Task specification documents — M0-001, M0-002, M0-003, M0-004, M0-005, M0-006, M0-007

---

## Overall Assessment

The M0 task set is well-structured with clear GIVEN/WHEN/THEN acceptance criteria, explicit Out of Scope
sections, and a correctly modelled dependency chain. The ESM-first approach, the choice of Vitest over
Jest, and the `npm ci` / `actions/setup-node@v4` CI conventions all reflect current best practice for a
2026 Node.js CLI project. The rationale for separating the developer's manual gitignore step (M0-006)
from the programmatic `aeos install` equivalent in M1 is sound and well-communicated.

Two Major issues must be addressed before execution begins: the ESLint flat-config package API is
under-specified in a way that will cause implementation confusion, and no task creates the repo-level
`.gitignore`, leaving `node_modules/` and `dist/` unprotected. Six Minor issues are safe to fix
in-line during implementation.

**Verdict:** Approve with changes

---

## Major Issues

### M1. ESLint flat-config package API mismatch

**File:** `docs/tasks/M0-003-eslint-prettier.md`

**Problem:**
The install command lists `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin` as
separate packages — the ESLint v8 / legacy-config API. The task simultaneously mandates ESLint v9
flat config (`eslint.config.js`) and instructs the implementer to enable `@typescript-eslint/recommended`.
In ESLint v9 flat config, `@typescript-eslint/recommended` is not accessible as a named string export
from the separate packages; it must be accessed via `plugin.configs['flat/recommended']` on the plugin
object, or more cleanly via the unified `typescript-eslint` umbrella package (`tseslint.config()`).
Without this clarification an implementer following the docs literally will hit a runtime config error.

**Impact:**
Blocked implementation of M0-003; any agent given this task will produce a broken `eslint.config.js`
or waste cycles debugging ESLint startup errors.

**Recommendation:**
Replace the install command with:
```
npm install -D typescript-eslint eslint-config-prettier prettier
```
The `typescript-eslint` umbrella package (v8+) bundles parser, plugin, and typed config helpers.
Update the Technical Notes to show the canonical flat-config shape:
```js
// eslint.config.js
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  { rules: { 'no-console': 'warn', '@typescript-eslint/no-explicit-any': 'error' } },
);
```

---

### M2. No task creates the repo-level `.gitignore`

**File:** Cross-cutting — M0-002 through M0-007

**Problem:**
None of the M0 tasks include creating a `.gitignore` for the repo. M0-005 mentions `dist/` in
Technical Notes ("Add `dist/` to `.gitignore`") but there is no task that actually creates the file.
`node_modules/` (50 MB+), `dist/`, and `coverage/` are not protected from accidental commit.

**Impact:**
High probability of accidentally committing `node_modules/` after the first `npm install` in M0-002,
especially since the `docs/tasks/` directory is already untracked and will be committed alongside
toolchain files. Recovering a `node_modules/` commit from a git history is time-consuming.

**Recommendation:**
Add a `.gitignore` creation step to M0-002 (or as a dedicated sub-step before any `npm install`):
```
node_modules/
dist/
coverage/
*.js.map
.env
.env.local
```
Add the Acceptance Criterion: "Given the repo root, when running `git status` after `npm install`,
then `node_modules/` does not appear in untracked files."

---

## Minor Issues

### m1. M0-001 AC #3 contradicts the existing LICENSE file

**File:** `docs/tasks/M0-001-create-github-repo.md`

**Problem:**
AC #3 states "when running `ls -la`, then `.git/` is present and no other files exist." The repo
already contains `LICENSE`. This criterion will fail on the first verification.

**Recommendation:**
Change to "then only `.git/` and `LICENSE` are present" — or drop the AC entirely since the
clone-is-clean check is already covered by AC #2 (`git status` clean on `main`).

---

### m2. tsconfig missing two common strict flags

**File:** `docs/tasks/M0-002-npm-init-tsconfig.md`

**Problem:**
`"skipLibCheck": true` and `"forceConsistentCasingInFileNames": true` are absent from the
prescribed tsconfig. Without `skipLibCheck`, TypeScript checks all `.d.ts` files in `node_modules`
and may produce noise on packages with imperfect typings. Without `forceConsistentCasingInFileNames`,
import paths that differ only in case (valid on macOS, broken on Linux) will pass the type check
locally but fail in CI.

**Recommendation:**
Add both flags to the tsconfig specification. Also consider `"declarationMap": true` alongside
`"declaration": true` for better IDE source navigation.

---

### m3. `.prettierignore` missing `coverage/`

**File:** `docs/tasks/M0-003-eslint-prettier.md`

**Problem:**
`.prettierignore` is specified to exclude `dist/` and `node_modules/` but not `coverage/`. After
running `npm run test:coverage`, Prettier will attempt to check generated HTML/JSON coverage files.

**Recommendation:**
Add `coverage/` to `.prettierignore`.

---

### m4. Lint script glob ambiguity under ESLint v9

**File:** `docs/tasks/M0-005-package-scripts.md`

**Problem:**
`"lint": "eslint src/ && prettier --check src/"` passes a directory path to ESLint v9. ESLint v9
with flat config resolves file patterns from the `files` array in the config rather than the CLI
argument. Passing `src/` works but may silently skip files not matched by `files` in the config.

**Recommendation:**
Change to `eslint 'src/**/*.ts'` for explicit, unambiguous targeting. This also makes it clearer
to future contributors which files are linted.

---

### m5. macOS alternative global gitignore path not documented

**File:** `docs/tasks/M0-006-global-gitignore.md`

**Problem:**
Some macOS git installations default to `~/.config/git/ignore` rather than `~/.gitignore_global`.
The task hardcodes `~/.gitignore_global`, which is valid (the `git config` step makes it explicit),
but a developer who already has `core.excludesfile` pointing elsewhere will end up with two competing
global ignore files.

**Recommendation:**
Add a pre-check step: `git config --global core.excludesfile` — if it already returns a path, append
`.aeos/` to that file rather than creating a second one.

---

### m6. CI missing `typecheck` step and hardening options

**File:** `docs/tasks/M0-007-github-actions-ci.md`

**Problem:**
(a) The pipeline runs lint → build → test but omits `typecheck` (`tsc --noEmit`). While `build`
catches type errors too, running `typecheck` first gives faster feedback and makes the signal explicit.
(b) No `concurrency` group is defined; rapid consecutive pushes queue duplicate runs rather than
cancelling superseded ones.

**Recommendation:**
(a) Add `npm run typecheck` as the first step after `npm ci`. (b) Add a concurrency group:
```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

---

## Positive Observations

1. **Dependency chain is correctly modelled.** M0-001 → M0-002 → M0-003/M0-004 → M0-005 → M0-007,
   with M0-006 correctly marked as parallel (only requires M0-001). No circular deps.
2. **ESM-first from the start** (`"type": "module"` + `"module": "NodeNext"`) is the right call for a
   2026 Node.js CLI project. Avoiding the `"module": "ESNext"` trap is explicitly noted — well done.
3. **Vitest over Jest** is the correct choice for an ESM TypeScript project — no Babel shim required,
   V8-native coverage, first-class TypeScript support. Noted clearly in M0-004 hints.
4. **M0-006 design rationale** — distinguishing the developer's manual setup from the end-user's
   `aeos install` programmatic equivalent is clearly communicated and cross-referenced. Good foresight.
5. **`npm ci` in CI** and `actions/setup-node@v4` with npm cache — correct CI hygiene, correctly
   specified in M0-007.
6. **GIVEN/WHEN/THEN acceptance criteria** — consistent, testable, and implementer-friendly across
   all seven tasks.

---

## Verification Notes

- M0-003 and M0-005 acceptance criteria are interdependent; verify both scripts in order after M1 fix
  is applied to the ESLint config.
- After applying m2 fix: run `npx tsc --noEmit` with the updated tsconfig on a freshly cloned repo on
  Linux (or via the CI job) to confirm `forceConsistentCasingInFileNames` doesn't surface spurious
  errors in the existing placeholder code.
- M0-006 verification: the temporary `.aeos/` directory created during testing must be removed before
  committing — add a reminder to the task checklist.

---

## Draft PR Summary

**Scope:** M0 task specification documents (M0-001 through M0-007)
**Changes needed before execution:**

- **M0-002:** Add `.gitignore` creation step (node_modules, dist, coverage); add `skipLibCheck` and
  `forceConsistentCasingInFileNames` to tsconfig spec; add `declarationMap`.
- **M0-003:** Replace `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin` with
  `typescript-eslint` umbrella package; add canonical `tseslint.config()` flat-config example;
  add `coverage/` to `.prettierignore` spec.
- **M0-001:** Fix AC #3 to account for LICENSE file.
- **M0-005:** Change lint script glob to `eslint 'src/**/*.ts'`.
- **M0-006:** Add pre-check step for existing `core.excludesfile`.
- **M0-007:** Add `typecheck` step; add concurrency group.

Please review this summary and confirm it matches the intended changes before updating the task documents.
