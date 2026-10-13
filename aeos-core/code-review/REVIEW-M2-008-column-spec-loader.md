# Code Review: M2-008 Column Spec Loader (YAML + Zod adapters)

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Uncommitted changes — `git diff HEAD` (7 modified, 3 untracked)

---

## Overall Assessment

Clean, well-structured implementation of the YAML spec-loading infrastructure adapters. The code follows the project's hexagonal architecture faithfully: port interfaces live in `src/domain/ports/driven/`, adapters live in `src/infrastructure/spec-loader/`, and dependency direction is correct (`infrastructure → domain`). Zod schemas provide runtime validation, `js-yaml` is configured with `DEFAULT_SCHEMA` to prevent YAML deserialization attacks, and custom error types give callers clear failure modes. Tests are comprehensive (covering happy path, defaults, schema validation, error cases, and all column mappings) and use proper temp-directory fixtures.

No Critical or Major issues found. Two Minor observations noted below.

**Verdict:** Approve

---

## Critical Issues

None.

---

## Major Issues

None.

---

## Minor Issues

### m1. No path-boundary validation on `agentFile` parameter

**File:** `src/infrastructure/spec-loader/yaml-agent-spec-loader.adapter.ts` (`load()`)

**Problem:**
`path.join(aeosDir(root), agentFile)` accepts an arbitrary string. A value like `../../etc/passwd` would resolve outside `.aeos/`. In the column-spec loader the filenames are hardcoded in `COLUMN_SPEC_FILENAMES`, so no equivalent risk exists there.

**Recommendation:**
Low urgency for a local CLI tool (the user authors their own YAML). When a network-facing or multi-tenant context arises, add a guard:
```typescript
const resolved = path.resolve(aeosDir(root), agentFile);
if (!resolved.startsWith(aeosDir(root))) {
  throw new AgentSpecNotFoundError(`Path escapes .aeos/ boundary: ${agentFile}`);
}
```

### m2. Composition root not updated

**File:** `src/cli/container.ts`

**Problem:**
`YamlAgentSpecLoader` and `YamlColumnSpecLoader` are not wired in `container.ts`. No use case consumes them yet, so this is expected — but it should be tracked for the next task that introduces a consuming use case.

**Recommendation:**
No action needed now. Ensure the follow-up task (e.g., column-run or ticket-advance) wires these adapters in the composition root.

---

## Positive Observations

1. **Correct hexagonal layering** — Port interfaces in `src/domain/ports/driven/`, adapters in `src/infrastructure/spec-loader/`, domain types imported via `type` where possible. Dependency direction `infrastructure → domain` upheld.
2. **Explicit `yaml.DEFAULT_SCHEMA`** — Prevents custom YAML type deserialization (!!python/object, etc.), a best-practice security measure.
3. **Comprehensive test suites** — 16 new tests across both adapters covering: valid load, schema defaults, missing file, missing fields, invalid types, optional fields, and exhaustive column-to-filename mapping.
4. **Proper temp-directory fixtures** — Tests use `os.tmpdir()` + `fs.mkdtempSync()` with cleanup in `afterEach`. No hardcoded paths.
5. **Custom error hierarchy** — `ColumnSpecNotFoundError` and `AgentSpecNotFoundError` extend `Error` with correct `this.name` assignment, consistent with existing `ProjectRootNotFoundError` / `ProjectConfigNotFoundError` pattern.
6. **Barrel exports wired** — Both `src/domain/ports/driven/index.ts` and `src/infrastructure/spec-loader/index.ts` re-export the new modules.
7. **`Readonly<>` wrapper on domain types** — `AgentSpec` and `ColumnSpec` are immutable at the type level, preventing accidental mutation.
8. **Synchronous I/O is appropriate** — Spec loading is a one-time setup operation, consistent with existing `readProjectConfig()` in `fs-project.repository.ts`.

---

## Architecture Compliance

- [x] Dependency direction: `cli → application → domain ← infrastructure`
- [x] Domain layer purity: no I/O, no framework imports in `src/domain/`
- [x] Barrel exports updated for new modules
- [ ] Composition root (`container.ts`) updated if new adapters/use cases added — **N/A, no consumer yet (see m2)**

---

## Verification Notes

- `npm run typecheck` — **PASS**
- `npm run lint` — **PASS** (on changed files)
- `npm test` — **PASS** (26 test files, 281 tests passing)

---

## Draft PR Summary

**Summary:**
- Define `AgentSpecLoader` and `ColumnSpecLoader` driven port interfaces in `src/domain/ports/driven/`
- Implement `YamlAgentSpecLoader` adapter — loads YAML agent specs from `.aeos/agents/`, validates with Zod `AgentSpecSchema`
- Implement `YamlColumnSpecLoader` adapter — maps `Column` enum to YAML filenames, loads from `.aeos/column-specs/`, validates with Zod `ColumnSpecSchema`
- Add `ColumnSpecNotFoundError` and `AgentSpecNotFoundError` custom error classes in `src/shared/errors.ts`
- Add `js-yaml` (runtime) and `@types/js-yaml` (dev) dependencies
- Add co-located test suites for both adapters (16 new tests)

**Testing:**
- 26 test files, 281 tests passing (including 16 new tests for this change)
- `tsc --noEmit` and ESLint pass cleanly

Please review this summary and confirm it matches the intended changes.
