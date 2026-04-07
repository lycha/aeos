# Task: Set Up Vitest as the Unit Test Runner

**Milestone:** M0 — Repo & Toolchain Setup
**Agent:** tdd-orchestrator
**Method:** Manual

## Context
Establishes the testing baseline. All state machine and helper unit tests in M1 depend on this being in place. Requires M0-002 (TypeScript initialized).

## What needs to be done
- Install: `npm install -D vitest @vitest/coverage-v8`
- Create `vitest.config.ts` at the repo root:
  - Set `test.environment` to `"node"`
  - Enable coverage via `@vitest/coverage-v8`
  - Set `test.include` to `["src/**/*.test.ts"]`
- Write a single smoke-test at `src/index.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  describe('smoke', () => {
    it('passes', () => expect(true).toBe(true));
  });
  ```
- Confirm `npx vitest run` exits 0 and reports 1 test passed

## Acceptance Criteria
- [x] Given the repo, when running `npx vitest run`, then exit code is 0 and 1 test passes
- [x] Given `vitest.config.ts`, when inspecting `test.include`, then only `src/**/*.test.ts` files are picked up
- [x] Given `npx vitest run --coverage`, then a coverage report is produced in `coverage/`

## Out of Scope
- Integration or end-to-end test setup
- Coverage thresholds (set when there is real code to cover)

## Technical Notes / Hints
- Vitest natively supports ESM — no Babel or transform config needed for TypeScript + ESM
- `@vitest/coverage-v8` uses Node's built-in V8 coverage, no Istanbul needed

## Dependencies
- M0-002: TypeScript initialized

## Definition of Done
- [x] `vitest.config.ts` and smoke test committed
- [x] `npx vitest run` exits 0
- [ ] Code reviewed and approved
