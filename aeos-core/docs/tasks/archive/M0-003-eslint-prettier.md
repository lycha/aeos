# Task: Configure ESLint and Prettier for TypeScript

**Milestone:** M0 — Repo & Toolchain Setup
**Agent:** typescript-pro
**Method:** Manual

## Context
Enforces consistent code style and catches common errors before they reach CI. Must be in place before any source code is written. Requires M0-002 (TypeScript initialized).

## What needs to be done
- Install dependencies:
  - `npm install -D typescript-eslint eslint eslint-config-prettier prettier`
  - Note: `typescript-eslint` (v8+) is the unified umbrella package — it bundles the parser, plugin,
    and typed config helpers. Do **not** install the older separate packages
    (`@typescript-eslint/parser` / `@typescript-eslint/eslint-plugin`) alongside it.
- Create `.prettierrc` with opinionated defaults:
  - `singleQuote: true`, `semi: true`, `trailingComma: "all"`, `printWidth: 100`
- Create `.prettierignore` excluding `dist/`, `node_modules/`, `coverage/`
- Create `eslint.config.js` (ESLint v9 flat config) using `tseslint.config()`:
  ```js
  // eslint.config.js
  import tseslint from 'typescript-eslint';
  import eslintConfigPrettier from 'eslint-config-prettier';

  export default tseslint.config(
    ...tseslint.configs.recommended,
    eslintConfigPrettier,
    {
      rules: {
        'no-console': 'warn',
        '@typescript-eslint/no-explicit-any': 'error',
      },
    },
  );
  ```
- Confirm `npx eslint 'src/**/*.ts'` exits 0 on the placeholder `src/index.ts`
- Confirm `npx prettier --check src/` exits 0

## Acceptance Criteria
- [x] Given `src/index.ts`, when running `npx eslint 'src/**/*.ts'`, then exit code is 0
- [x] Given `src/index.ts`, when running `npx prettier --check src/`, then exit code is 0
- [x] Given a file using `any` type explicitly, when running ESLint, then an error is reported
- [x] Given misformatted code, when running `npx prettier --check`, then exit code is non-zero

## Out of Scope
- IDE plugin configuration (developer choice)
- Pre-commit hooks (not in scope for v1)

## Technical Notes / Hints
- Use ESLint v9 flat config (`eslint.config.js`) — the legacy `.eslintrc` format is deprecated
- `typescript-eslint` v8+ exports `tseslint.config()` which replaces the old `extends` array pattern;
  pass `eslintConfigPrettier` as the last spread to disable any formatting rules ESLint would otherwise
  conflict with Prettier on
- `eslint-config-prettier` must always be applied after the TypeScript rules so it can override them

## Dependencies
- M0-002: TypeScript initialized

## Definition of Done
- [x] `.prettierrc`, `.prettierignore`, `eslint.config.js` committed
- [x] `npx eslint 'src/**/*.ts'` and `npx prettier --check src/` both pass
- [ ] Code reviewed and approved
