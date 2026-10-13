# Task: Initialize npm Project and TypeScript Configuration

**Milestone:** M0 — Repo & Toolchain Setup
**Agent:** typescript-pro
**Method:** Manual

## Context
Establishes the TypeScript project baseline. All subsequent source files depend on this configuration being correct. Requires M0-001 (repo exists and is cloned).

## What needs to be done
- Create `.gitignore` at the repo root with the following entries (do this **before** `npm install`):
  ```
  node_modules/
  dist/
  coverage/
  *.js.map
  .env
  .env.local
  ```
- Run `npm init -y` to generate `package.json`
- Set `"type": "module"` in `package.json` for ESM output
- Set `"engines": { "node": ">=20" }` in `package.json`
- Create `tsconfig.json` with the following settings:
  - `"strict": true`
  - `"module": "NodeNext"` and `"moduleResolution": "NodeNext"`
  - `"target": "ES2022"`
  - `"outDir": "./dist"`
  - `"rootDir": "./src"`
  - `"declaration": true`
  - `"declarationMap": true`
  - `"sourceMap": true`
  - `"skipLibCheck": true`
  - `"forceConsistentCasingInFileNames": true`
- Install `typescript` as a dev dependency: `npm install -D typescript`
- Create `src/` directory with a placeholder `src/index.ts` (empty export)
- Confirm `npx tsc --noEmit` exits 0

## Acceptance Criteria
- [x] Given the repo root, when running `npx tsc --noEmit`, then exit code is 0 with no errors
- [x] Given `package.json`, when inspecting `"type"`, then value is `"module"`
- [x] Given `tsconfig.json`, when inspecting `"strict"`, then value is `true`
- [x] Given `package.json`, when inspecting `"engines"`, then Node ≥ 20 is required
- [x] Given the repo root, when running `npm install` then `git status`, then `node_modules/` does not appear in untracked files

## Out of Scope
- ESLint or Prettier configuration (M0-003)
- Test runner configuration (M0-004)
- Build scripts (M0-005)

## Technical Notes / Hints
- Use `"module": "NodeNext"` not `"module": "ESNext"` — required for `.js` extension imports in ESM Node projects
- `"moduleResolution": "NodeNext"` must pair with `"module": "NodeNext"`
- `"skipLibCheck": true` suppresses type errors in `node_modules` `.d.ts` files; safe to enable and avoids noise from packages with imperfect typings
- `"forceConsistentCasingInFileNames": true` catches import casing mismatches that are silent on macOS but fatal on the Linux CI runner
- `"declarationMap": true` pairs with `"declaration": true` to enable IDE source-level navigation into `.d.ts` output

## Dependencies
- M0-001: Repo cloned locally

## Definition of Done
- [x] `.gitignore` committed with `node_modules/`, `dist/`, `coverage/` entries
- [x] `package.json` committed with ESM + Node 20 settings
- [x] `tsconfig.json` committed with strict mode enabled
- [x] `npx tsc --noEmit` passes cleanly
- [ ] Code reviewed and approved
