# Code Review: M2-001 Executor Interface

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Uncommitted changes — 3 files, 42 additions

---

## Overall Assessment

This changeset introduces the `Executor` driven port and its two supporting value objects (`ExecutorInvocation`, `ExecutorResult`). The interfaces are clean, well-documented with JSDoc, and correctly placed in the hexagonal architecture. Domain purity is maintained — the only domain-internal import is the `Column` type. Barrel exports are already wired. ESM compliance is perfect.

The one substantive design issue is that `ExecutorResult` uses a `success: boolean` flag with optional fields instead of a discriminated union, which weakens type safety at consumption sites and contradicts the project's stated pattern for result types.

**Verdict:** Approve with changes

---

## Critical Issues

_None._

---

## Major Issues

### M1. `ExecutorResult` is not a discriminated union

**File:** `src/domain/model/executor-result.ts` (interface `ExecutorResult`)

**Problem:**
The interface uses `success: boolean` with optional `error?: string` and unconditional `artifactPath: string`. This permits invalid states at the type level:
- `{ success: true, error: "oops", artifactPath: "/tmp/x" }` — success with an error message
- `{ success: false, artifactPath: "/tmp/x" }` — failure with no error and a meaningless artifact path

The verification checklist (`references/verification-checklist.md`, line 7) requires:
> Discriminated unions used for result types (`{ ok: true } | { ok: false; reason: string }`)

**Impact:**
Every consumer of `ExecutorResult` must rely on runtime checks instead of exhaustive `if/switch` narrowing. This makes it easy to forget error handling and masks bugs at compile time.

**Recommendation:**
Refactor to a discriminated union:

```typescript
export type ExecutorResult = ExecutorSuccess | ExecutorFailure;

interface ExecutorSuccess {
  readonly ok: true;
  /** Absolute path of the written artifact */
  readonly artifactPath: string;
  /** Token usage if available from the model API */
  readonly usage?: TokenUsage;
}

interface ExecutorFailure {
  readonly ok: false;
  /** Human-readable error description */
  readonly reason: string;
}

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
}
```

This aligns with the project convention (see `validation-result.ts` for prior art) and enables `if (result.ok)` narrowing.

---

## Minor Issues

### m1. Inline `usage` type should be extracted

**File:** `src/domain/model/executor-result.ts` (interface `ExecutorResult`)

**Problem:**
The `usage` object type is defined inline. It will likely be reused by `CostRecord` or cost-tracking use cases.

**Recommendation:**
Extract to a standalone `TokenUsage` interface (or similar) in the same file or in a dedicated `token-usage.ts` value object. This is naturally addressed if M1 is applied.

### m2. `ExecutorInvocation` fields could be `readonly`

**File:** `src/domain/model/executor-invocation.ts` (interface `ExecutorInvocation`)

**Problem:**
Value objects should be immutable. The interface properties are not marked `readonly`.

**Recommendation:**
Add `readonly` to all properties:

```typescript
export interface ExecutorInvocation {
  readonly prompt: string;
  readonly outputPath: string;
  readonly ticketId: string;
  readonly column: Column;
}
```

---

## Positive Observations

1. **Excellent JSDoc coverage** — every field has a clear doc comment explaining its purpose.
2. **Domain purity maintained** — zero external/infrastructure imports in all three files.
3. **ESM compliance perfect** — all imports use `.js` extensions, `type` import syntax used correctly.
4. **Barrel exports already wired** — both `src/domain/model/index.ts` and `src/domain/ports/driven/index.ts` re-export the new modules.
5. **Clean port design** — `Executor.interrupt()` is a thoughtful addition for the `aeos ticket interrupt` use case, with clear no-op semantics documented.

---

## Architecture Compliance

- [x] Dependency direction: `cli → application → domain ← infrastructure`
- [x] Domain layer purity: no I/O, no framework imports in `src/domain/`
- [x] Barrel exports updated for any new modules
- [ ] Composition root (`container.ts`) updated if new adapters/use cases added — N/A (no adapter yet)

---

## Verification Notes

- `npm run typecheck` — **PASS**
- `npm run lint` — **PASS**
- `npm test` — **FAIL** (Vitest startup error: `node:util` missing `styleText` export — pre-existing environment issue, unrelated to this changeset; requires Node 22+)

---

## Draft PR Summary

**Summary:**
- Define `ExecutorInvocation` value object with `prompt`, `outputPath`, `ticketId`, and `column` fields
- Define `ExecutorResult` value object capturing success/failure, artifact path, and optional token usage
- Define `Executor` driven port with `run(invocation)` and `interrupt()` methods
- Wire barrel exports in `src/domain/model/index.ts` and `src/domain/ports/driven/index.ts`

**Testing:**
- `typecheck` ✅ | `lint` ✅ | Unit tests: N/A (pure interfaces, no logic to test)

Please review this summary and confirm it matches the intended changes.
