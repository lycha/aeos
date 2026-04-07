# Task: Configure GitHub Actions CI Pipeline (typecheck → lint → build → test)

**Milestone:** M0 — Repo & Toolchain Setup
**Agent:** —
**Method:** Manual

## Context
Provides automated quality gates on every push and pull request. Must reference the scripts established in M0-005. Required before any feature work begins so the green/red signal is reliable from day one.

## What needs to be done
- Create `.github/workflows/ci.yml` with the following pipeline:
  1. **Trigger:** `push` and `pull_request` on all branches
  2. **Concurrency group:** cancel in-progress runs on the same branch when a new push arrives:
     ```yaml
     concurrency:
       group: ci-${{ github.ref }}
       cancel-in-progress: true
     ```
  3. **Job: `ci`** running on `ubuntu-latest` with Node 20 (LTS)
  4. Steps:
     - Checkout code (`actions/checkout@v4`)
     - Set up Node (`actions/setup-node@v4` with `node-version: '20'` and `cache: 'npm'`)
     - Install dependencies: `npm ci`
     - Run typecheck: `npm run typecheck`
     - Run lint: `npm run lint`
     - Run build: `npm run build`
     - Run tests: `npm test`
- Push to a branch and confirm GitHub Actions run shows all steps green

## Acceptance Criteria
- [ ] Given a push to any branch, when GitHub Actions runs, then the `ci` job is triggered automatically
- [ ] Given passing typecheck/lint/build/test, when the job completes, then status is ✅ green
- [ ] Given a lint violation introduced, when the job runs, then it fails on the lint step (not silently passes)
- [ ] Given the job, when it runs, then it uses Node 20
- [ ] Given two rapid pushes to the same branch, when the second push triggers CI, then the first run is cancelled

## Out of Scope
- Deployment steps (M7)
- Branch protection rules enforcement (separate GitHub repo settings step)
- Code coverage upload (not required for v1 CI)

## Technical Notes / Hints
- Use `npm ci` (not `npm install`) in CI — it uses `package-lock.json` for reproducible installs
- `actions/setup-node@v4` with `cache: 'npm'` caches the npm cache between runs for speed

## Dependencies
- M0-001: Repo on GitHub
- M0-003: ESLint + Prettier scripts work
- M0-004: Vitest configured
- M0-005: `package.json` scripts defined

## Definition of Done
- [ ] `.github/workflows/ci.yml` committed and pushed
- [ ] GitHub Actions shows a green run on the push
- [ ] All four steps (typecheck, lint, build, test) are individually visible in the Actions log
