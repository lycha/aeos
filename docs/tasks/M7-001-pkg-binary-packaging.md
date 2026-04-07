# Task: Package `aeos` as a Single Binary with `pkg`

**Milestone:** M7 — Polish & Distribution
**Agent:** —
**Method:** Manual (packaging tooling)

## Context
v1 distribution goal: one file, no Node.js install required. The `pkg` tool bundles the Node.js runtime and the compiled application into a single executable. Users download and run — no `npm install` required.

## What needs to be done
- Install: `npm install -D @vercel/pkg` (or `pkg` if `@vercel/pkg` is unavailable)
- Add `pkg` configuration to `package.json`:
  ```json
  "pkg": {
    "scripts": "dist/**/*.js",
    "assets": ["src/agents/**/*.yaml", "src/column-specs/**/*.yaml"],
    "targets": ["node20-macos-arm64", "node20-macos-x64", "node20-linux-x64"],
    "outputPath": "release/"
  }
  ```
- Add script: `"package": "npm run build && pkg . --config package.json"`
- Run `npm run package` and confirm binaries are produced in `release/`
- Verify: copy binary to a fresh directory (no `node_modules`), run `./aeos install` — it should work
- Add `release/` to `.gitignore`

## Acceptance Criteria
- [ ] Given `npm run package`, when it completes, then binaries exist in `release/` for all 3 targets
- [ ] Given the macOS arm64 binary on a machine with no Node.js, when running `./aeos install`, then it succeeds
- [ ] Given `release/`, when checking `.gitignore`, then it is excluded from git
- [ ] Given binary size, when checking, then it is documented (acceptable baseline for v1: < 100 MB)

## Out of Scope
- Code signing / notarization (post-v1)
- Windows binary target (post-v1)
- GitHub Releases automation (manual upload for v1)

## Technical Notes / Hints
- `pkg` requires the `bin` field in `package.json` to point to the CLI entrypoint
- YAML agent/spec files must be listed as `assets` — they are not JS and won't be auto-bundled
- SQLite native bindings (`better-sqlite3`) require special handling with `pkg` — use `--public` flag or provide a prebuilt binary path

## Dependencies
- M6 complete: full pipeline working
- M0-005: `build` script works

## Definition of Done
- [ ] `npm run package` produces working binaries for all 3 targets
- [ ] Binary smoke test passes on a clean machine (no Node.js)
- [ ] `release/` in `.gitignore`
- [ ] Binary size documented
