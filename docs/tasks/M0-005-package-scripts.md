# Task: Configure package.json Scripts (build, dev, test, lint)

**Milestone:** M0 — Repo & Toolchain Setup
**Agent:** typescript-pro
**Method:** Manual

## Context
Standard npm script surface used by CI and developers. All four scripts must be present and functional before M0-007 (GitHub Actions CI) can reference them. Requires M0-002, M0-003, M0-004.

## What needs to be done
Add the following scripts to `package.json`:

```json
"scripts": {
  "build": "tsc --project tsconfig.json",
  "dev":   "tsc --watch --project tsconfig.json",
  "test":  "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "lint":  "eslint 'src/**/*.ts' && prettier --check src/",
  "lint:fix": "eslint 'src/**/*.ts' --fix && prettier --write src/",
  "typecheck": "tsc --noEmit"
}
```

- Verify each script runs successfully from repo root:
  - `npm run build` → produces `dist/` with compiled JS
  - `npm test` → exits 0 (smoke test)
  - `npm run lint` → exits 0 (no violations)
  - `npm run typecheck` → exits 0

## Acceptance Criteria
- [x] Given the repo root, when running `npm run build`, then `dist/` is produced and exit code is 0
- [x] Given the repo root, when running `npm test`, then exit code is 0
- [x] Given the repo root, when running `npm run lint`, then exit code is 0
- [x] Given the repo root, when running `npm run typecheck`, then exit code is 0

## Out of Scope
- `prepublish` or release scripts (M7)
- `pkg` binary packaging scripts (M7-001)

## Technical Notes / Hints
- `npm run dev` is a watch mode — it does not need to exit 0; it runs until killed
- The explicit `'src/**/*.ts'` glob in the lint script ensures ESLint v9 flat config targets only
  TypeScript source files, regardless of the `files` pattern in `eslint.config.js`

## Dependencies
- M0-002: TypeScript configured
- M0-003: ESLint + Prettier configured
- M0-004: Vitest configured

## Definition of Done
- [x] All four core scripts (`build`, `test`, `lint`, `typecheck`) run without error
- [ ] `package.json` committed and code reviewed
