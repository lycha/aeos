# Task: Add `aeos project init` Step to CI Workflow

**Milestone:** M2 — Agent & Column Spec Loading
**Agent:** — (manual)
**Method:** Manual

## Context
After M2-014 and M2-015, `aeos project init` scaffolds all default agent and column spec YAML files. The CI workflow needs to run `aeos project init` before tests so that integration tests can load real spec files from `.aeos/`.

## What needs to be done

### Update `.github/workflows/ci.yml`

Add a setup step between Build and Test:

```yaml
    - name: Build
      run: npm run build

    - name: Bootstrap AEOS project
      run: |
        node dist/cli/index.js install
        node dist/cli/index.js project init --name aeos --key AEOS

    - name: Test
      run: npm test
```

### Notes
- CI must use `node dist/cli/index.js` (not the `aeos` binary) because `npm link` isn't available in CI. The entrypoint path `dist/cli/index.js` is derived from `src/cli/index.ts` via `tsconfig.json` `outDir: "dist"`.
- `node dist/cli/index.js install` creates `~/.aeos/` (global dirs) and configures `~/.gitignore_global`. `node dist/cli/index.js project init` creates `.aeos/` in the repo root with all default specs.
- `--name aeos` is the human-readable project name (lowercase is fine). `--key AEOS` is the project key validated by `KEY_REGEX = /^[A-Z]{2,4}$/`. The `--key` flag is implemented in `project-init.command.ts` but not yet shown in system design §3.6 (design is stale on this point).
- This step must come after Build (needs compiled JS).
- The bootstrap creates `.aeos/` which is gitignored-safe — it only exists in the CI runner's workspace.
- If `install` succeeds but `project init` fails, the CI step fails and tests won't run (fail-fast). GitHub Actions' default shell behaviour fails on non-zero exit codes, so no explicit `set -e` is needed.
- Caching `.aeos/` via `actions/cache` is unnecessary — the directory is small, deterministic, and the bootstrap step runs in ~1 second after build.

## Acceptance Criteria
- [ ] CI workflow includes `aeos install` + `aeos project init` step before tests
- [ ] All tests in `yaml-agent-spec-loader.adapter.test.ts` and `yaml-column-spec-loader.adapter.test.ts` pass in CI. No test failures caused by missing `.aeos/` directory or spec files.
- [ ] No changes to `.gitignore` are needed

## Dependencies
- M2-014: Scaffold agent specs on init
- M2-015: Scaffold column specs on init

## Blocks
- CI green status
