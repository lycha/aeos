# Code Review: M2-004 — ContextAssembler

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Uncommitted changes — ContextAssembler service, AssembledContext value object, port additions, adapter implementations, test updates

---

## Overall Assessment

Solid implementation of the `ContextAssembler` application service. The change correctly adds a new domain value object (`AssembledContext`, `PriorArtifact`), extends two driven ports (`ArtifactStore.readArtifact`, `ProjectRepository.readConstraints`), provides filesystem adapter implementations, and includes a comprehensive test suite. Architecture compliance is excellent — dependency direction is clean, domain layer remains pure, and all barrel exports are already wired.

One minor concern around mixing synchronous file I/O inside an async orchestration method, and one minor concern about untyped error propagation. Neither blocks merge for a CLI tool at this stage.

**Verdict:** Approve

---

## Critical Issues

_None._

---

## Major Issues

_None._

---

## Minor Issues

### m1. Synchronous I/O called inside async orchestration method

**File:** `src/application/services/context-assembler.ts` (`assemble()`)

**Problem:**
`assemble()` is declared `async` but every call it makes (`readArtifact`, `listArtifacts`, `readConstraints`) is synchronous. The underlying adapter uses `fs.readFileSync` for each artifact. When multiple prior artifacts exist, this blocks the event loop for the duration of all reads. The verification checklist states: _"No synchronous file I/O in hot paths or async orchestration flows"_ and _"No mixing of sync and async APIs for the same resource"_.

**Recommendation:**
Acceptable for a CLI tool today. When the executor integration lands (M2-011), consider making the port methods async (`Promise<string>`) so adapters can use non-blocking I/O. The `async` signature on `assemble()` is forward-compatible — no change needed now, but document the intent.

### m2. Untyped error propagation from `readArtifact`

**File:** `src/application/services/context-assembler.ts` (`assemble()`)

**Problem:**
The `ArtifactStore.readArtifact` port is documented as _"Throws if file does not exist"_. If the ticket file is missing, `assemble()` will propagate a raw `Error` (from `readFileSync` ENOENT). The project convention prefers typed result objects for expected failures.

**Recommendation:**
For v1 this matches the existing codebase pattern (e.g., `FsProjectRepository.read()` also throws). When `ticket-run` use case is implemented, wrap the call in a try/catch and return a typed result, or add an `exists` check before reading. No change needed now.

### m3. New untracked test file not staged

**File:** `src/application/services/context-assembler.test.ts`

**Problem:**
The new test file appears as `??` (untracked) in `git status`. It will not be included in a commit unless explicitly staged.

**Recommendation:**
Stage the file with `git add src/application/services/context-assembler.test.ts` before committing.

---

## Positive Observations

1. **Domain purity maintained** — `AssembledContext` and `PriorArtifact` are pure TypeScript interfaces with zero external imports. ✓
2. **Hexagonal architecture followed** — `ContextAssembler` depends only on domain ports (`ArtifactStore`, `ProjectRepository`), never on concrete adapters. ✓
3. **Path traversal prevention** — `FsArtifactStore.readArtifact()` calls `validatePathComponent()` on both `ticketId` and `filename` before constructing the file path. ✓
4. **Comprehensive test coverage** — 7 test cases covering: ticket reading, prior artifact filtering, empty artifacts, constraints present/absent, and edge cases. ✓
5. **All existing mock factories updated** — every test file that creates mock `ArtifactStore` or `ProjectRepository` objects has been updated with the new methods. ✓
6. **Barrel exports already wired** — `src/application/services/index.ts` and `src/domain/model/index.ts` already re-export the new modules. ✓
7. **ESM compliance** — all imports use `.js` extensions, `type` import syntax used for port interfaces. ✓
8. **Graceful null handling for constraints** — `FsProjectRepository.readConstraints()` catches filesystem errors and returns `null`, matching the port contract. ✓

---

## Architecture Compliance

- [x] Dependency direction: `cli → application → domain ← infrastructure`
- [x] Domain layer purity: no I/O, no framework imports in `src/domain/`
- [x] Barrel exports updated for any new modules
- [ ] Composition root (`container.ts`) updated if new adapters/use cases added — **N/A**: `ContextAssembler` is an application service; wiring happens when `ticket-run` use case (M2-011) is implemented.

---

## Verification Notes

- `npm run typecheck` — **PASS**
- `npm run lint` — **PASS**
- `npm test` — **PASS** (20 test files, 209 tests passing)

---

## Draft PR Summary

**Summary:**
- Added `AssembledContext` and `PriorArtifact` value object interfaces to `src/domain/model/`
- Extended `ArtifactStore` port with `readArtifact(projectPath, ticketId, filename): string`
- Extended `ProjectRepository` port with `readConstraints(projectPath): string | null`
- Implemented `FsArtifactStore.readArtifact()` with path traversal validation
- Implemented `FsProjectRepository.readConstraints()` with graceful null fallback
- Created `ContextAssembler` application service that assembles ticket content, prior artifacts, and constraints into a single `AssembledContext` value object
- Updated all mock factories across 5 existing test files to include new port methods
- Added 7 unit tests for `ContextAssembler` covering all branches

**Testing:**
- All 209 existing tests pass
- 7 new tests for `ContextAssembler` pass
- Typecheck and lint pass clean
