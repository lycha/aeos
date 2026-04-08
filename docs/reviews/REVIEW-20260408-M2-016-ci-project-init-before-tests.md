# Review: M2-016 — Add `aeos project init` Step to CI Workflow

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Task file:** `docs/tasks/M2-016-ci-project-init-before-tests.md`
**Cross-referenced against:**
- `docs/03-system-design.md` (System Design v0.3)
- `docs/02-prd.md` (PRD v0.1)
- `docs/05-action-plan-v1.md` (Action Plan)
- Sibling tasks: M2-014, M2-015
- Source code: `.github/workflows/ci.yml`, `src/cli/index.ts`, `src/cli/commands/project-init.command.ts`, `src/infrastructure/spec-loader/yaml-agent-spec-loader.adapter.test.ts`, `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.test.ts`, `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts`

---

## Verdict: APPROVE with findings

No blockers. One major issue, two medium issues, three minor issues, and one informational note.

---

## Critical Issues

_None._

---

## Major Issues

### 🔴 J1: Stale acceptance criterion — "All 14 tests in `yaml-agent-spec-loader.adapter.test.ts`" count is wrong and scope is incomplete

The acceptance criterion states: _"All 14 tests in `yaml-agent-spec-loader.adapter.test.ts` pass in CI (including the 8 integration tests)."_

**Problems:**
1. **Test count is stale.** The current `yaml-agent-spec-loader.adapter.test.ts` contains 14 tests total (6 unit + 8 integration), but M2-014 will refactor the integration tests to use `tmpDir` instead of `repoRoot`, making them self-contained. After M2-014, the integration tests no longer depend on CI bootstrapping — they create their own temp directory with scaffolded defaults. The "8 integration tests" may be restructured or renumbered.
2. **Missing column-spec tests.** M2-015 introduces new integration tests in `yaml-column-spec-loader.adapter.test.ts` that load scaffolded defaults. These tests also depend on `aeos project init` having run (or on `tmpDir` scaffolding). The acceptance criterion only mentions agent-spec tests, ignoring column-spec tests entirely.
3. **Scope confusion with M2-014.** The M2-014 review (finding m4) resolved this: M2-014 converts agent-spec integration tests to `tmpDir` (self-contained), and M2-016 covers _remaining_ tests that still need CI bootstrapping. But the acceptance criterion was written before this clarification and still references agent-spec tests that won't need CI bootstrapping after M2-014.

**Recommendation:** Rewrite the acceptance criterion as: _"All tests in `yaml-agent-spec-loader.adapter.test.ts` and `yaml-column-spec-loader.adapter.test.ts` pass in CI. No test failures caused by missing `.aeos/` directory or spec files."_ This is future-proof regardless of how M2-014 restructures the integration tests.

---

## Medium Issues

### ⚠️ M1: CLI command mismatch — `aeos install` vs `node dist/cli/index.js install`

The task's YAML snippet uses `node dist/cli/index.js install` (correct for CI), but the Notes section says: _"`aeos install` creates `~/.aeos/` (global dirs)."_ and _"`aeos project init` creates `.aeos/`..."_. This is cosmetically fine but the important technical detail is that the CI runner must use the built JS file, not the `aeos` binary.

The CI step is:
```yaml
node dist/cli/index.js install
node dist/cli/index.js project init --name aeos --key AEOS
```

**Verified:** `src/cli/index.ts` uses `buildProgram().parse()` when run as entrypoint. `dist/cli/index.js` will be the compiled output. The `install` command is registered at line 49. The `project init` command is registered at line 50 with `--name` and `--key` options (line 21-22 of `project-init.command.ts`). **The commands are correct.**

However, the `--key AEOS` flag uses all caps, which is validated by `KEY_REGEX = /^[A-Z]{2,4}$/` (line 7 of `project-init.command.ts`). This is valid and matches the action plan's convention: _"`AEOS` is the project key for the AEOS project itself."_ (M3 section of action plan). ✅ Correct.

**One concern:** `aeos install` writes to `~/.aeos/` in the CI runner's home directory. This modifies the CI runner's global state. While ephemeral runners (GitHub Actions `ubuntu-latest`) reset between runs, this should be noted. No action needed — just documenting.

### ⚠️ M2: Missing `--name` flag vs `--name aeos` inconsistency with action plan

The CI step uses `--name aeos` (lowercase). The action plan §M3 says: _"`AEOS` is the project key..."_ but does not specify the `--name` value. The `--name` flag is the human-readable project name (not the key). Using `aeos` (lowercase) as the name is fine — it's cosmetic. However, the system design §3.5 registry example shows capitalised names (`"name": "Startup A"`). This is purely aesthetic — no functional impact.

---

## Minor Issues

### m1: Missing `--key` flag documentation in system design

System design §3.6 shows `aeos project init --name "Startup A"` but does not show the `--key` flag. The action plan §M3 and §Open Decisions confirm the `--key` flag exists. The CLI implementation at `project-init.command.ts` line 22 confirms `--key <key>` is supported. The system design is stale on this point but not blocking.

### m2: No rollback or cleanup if `aeos project init` fails in CI

The CI step runs two commands sequentially:
```yaml
node dist/cli/index.js install
node dist/cli/index.js project init --name aeos --key AEOS
```

If `install` succeeds but `project init` fails, the CI step will fail and tests won't run. This is correct behaviour (fail fast). However, there's no explicit error handling or diagnostic output. If this step fails in CI, the developer will see a generic shell error. Consider adding `set -e` or `|| exit 1` for clarity, though the default shell behaviour in GitHub Actions already fails on non-zero exit codes.

### m3: Task does not specify whether `.aeos/` should be cached in CI

GitHub Actions supports caching (`actions/cache`). The `.aeos/` directory created by `project init` is small and deterministic (same inputs → same outputs). Caching is not needed — the step runs in ~1 second after build. But the task could note that caching is unnecessary to prevent future optimisation attempts.

---

## Informational

### i1: `aeos install` global gitignore effect in CI

`aeos install` configures `~/.gitignore_global` to exclude `.aeos/` and runs `git config --global core.excludesfile`. In CI, this modifies the runner's git config. Since `.aeos/` is created in the workspace (not committed), and the CI runner is ephemeral, this has no effect on test results. However, if any test checks `git status` output expecting `.aeos/` to be untracked, the global gitignore would hide it. Current tests do not appear to check this.

---

## Correctness vs System Design

| Aspect | Task | System Design | Codebase | Verdict |
|--------|------|---------------|----------|---------|
| `aeos install` purpose | Creates `~/.aeos/` (global dirs) | §3.2, §3.6: creates `~/.aeos/`, configures global gitignore | `install.use-case.ts` | ✅ Match |
| `aeos project init` purpose | Creates `.aeos/` with specs | §3.3, §3.6: creates `.aeos/`, registers in registry | `project-init.use-case.ts` | ✅ Match |
| `--name` and `--key` flags | `--name aeos --key AEOS` | §3.6 shows `--name` only | CLI has both flags | ✅ Correct (design stale) |
| CI step ordering | Build → Bootstrap → Test | N/A (CI not in system design) | `ci.yml` has Build → Test | ✅ Task inserts between correctly |
| `.aeos/` gitignore in CI | Notes say "gitignored-safe" | §3.4 global gitignore | `install` sets up global gitignore | ✅ Match |

---

## File Path Alignment with Hexagonal Scaffold

| Referenced Path | Exists | Status |
|----------------|--------|--------|
| `.github/workflows/ci.yml` | ✅ | To be modified (add step between Build and Test) |
| `dist/cli/index.js` | Build output | Generated by `npm run build` — correct |
| `.aeos/` (runtime) | Created by `project init` | Not in source tree — correct |

No new source files are created by this task. It only modifies the CI workflow file. ✅ Correct scope.

---

## Dependency Validation

| Dependency | Status | Verified |
|-----------|--------|----------|
| M2-014: Scaffold agent specs on init | ⏳ pending | Task reviewed and approved; not yet implemented |
| M2-015: Scaffold column specs on init | ⏳ pending | Task reviewed and approved; not yet implemented |

**Both dependencies are critical.** Without M2-014 and M2-015, `aeos project init` creates `.aeos/` but leaves `agents/` empty and `column-specs/` empty. The CI bootstrap step would succeed (exit code 0) but produce no spec files, so integration tests loading specs from `.aeos/` would still fail. M2-016 is only useful after M2-014 + M2-015 are implemented.


---

## Consistency with Sibling Tasks

| Sibling | Consistent | Notes |
|---------|-----------|-------|
| M2-014 (scaffold agent specs) | ⚠️ Partial | M2-014's review (m4) clarified that agent-spec integration tests become self-contained via `tmpDir`, not CI-bootstrapped. M2-016's acceptance criterion still references agent-spec tests as needing CI bootstrapping. See J1. |
| M2-015 (scaffold column specs) | ✅ | M2-015 scaffolds column specs on init. After M2-015, `aeos project init` in CI produces all 7 column spec files. Column-spec integration tests already use `tmpDir` (self-contained). M2-016 is complementary. |
| M3-001 through M6-006 (pipeline tickets) | ✅ | All downstream pipeline tickets depend on `aeos project init` having scaffolded specs. M2-016 ensures CI can run these tests. |

---

## CI Workflow Analysis

Current `ci.yml` structure (lines 17-41):
```
Checkout → Node setup → npm ci → Typecheck → Lint → Build → Test
```

Task proposes inserting between Build and Test:
```
Checkout → Node setup → npm ci → Typecheck → Lint → Build → Bootstrap AEOS → Test
```

**Verified correct ordering:**
1. `npm run build` must complete first — `node dist/cli/index.js` requires compiled JS. ✅
2. `install` creates `~/.aeos/` — needed before `project init`. ✅
3. `project init` creates `.aeos/` with agents/ and column-specs/ — needed before tests load specs. ✅
4. `npm test` runs all vitest tests including integration tests. ✅

**Edge case:** If `npm run build` fails, the Build step fails and Bootstrap never runs. Correct — no issue.

**Edge case:** If the `dist/cli/index.js` entrypoint path changes (e.g., during a build config refactor), the CI step silently breaks. The path `dist/cli/index.js` is derived from `src/cli/index.ts` via `tsconfig.json` `outDir: "dist"`. This is stable but undocumented in the task.

---

## Blocking Gaps

**No blocking gaps for implementation.** The task is a single YAML edit to `.github/workflows/ci.yml`. However:

1. **Execution dependency on M2-014 + M2-015:** M2-016 must be implemented _after_ M2-014 and M2-015. Without scaffolded specs, the bootstrap step creates an empty `.aeos/` — tests still fail. The dependency is correctly declared.
2. **Acceptance criterion needs rewrite (J1):** The test count and scope are stale. This doesn't block implementation but will cause confusion during verification.

---

## Summary

| Category | Count |
|----------|-------|
| Critical | 0 |
| Major | 1 |
| Medium | 2 |
| Minor | 3 |
| Informational | 1 |

**Overall:** The task is correctly scoped — a single CI workflow edit inserting `aeos install` + `aeos project init` between Build and Test. The CLI commands, flags, and ordering are all verified against the codebase. The major finding (J1) is that the acceptance criterion references a stale test count and only mentions agent-spec tests, when (a) M2-014 makes agent-spec integration tests self-contained via `tmpDir` (removing the need for CI bootstrapping), and (b) M2-015 introduces column-spec integration tests that are also self-contained. After M2-014 and M2-015 land, the primary value of M2-016 is ensuring that _any future_ integration test relying on real `.aeos/` content works, and that the `aeos` CLI itself is exercised in CI as a smoke test. The acceptance criterion should be rewritten to reflect this updated scope. All other aspects — file paths, CI step ordering, dependency chain, command flags — are sound.