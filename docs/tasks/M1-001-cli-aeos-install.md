# Task: Implement `aeos install` CLI Command

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** typescript-pro
**Method:** Manual (bootstrapping)

## Context
First CLI command a user ever runs. Creates `~/.aeos/` global home directory, configures the global gitignore (programmatic equivalent of M0-006), and writes default `config.json`. Requires the CLI shell (Commander.js) to be wired up.

## What needs to be done

### CLI entrypoint wiring
- Install Commander.js: `npm install commander`
- Add `"bin": { "aeos": "./dist/cli.js" }` to `package.json`
- Create `src/cli.ts` as the CLI entrypoint:
  1. First line must be `#!/usr/bin/env node`
  2. Import and configure Commander.js: `const program = new Command(); program.name('aeos').version('0.1.0');`
  3. Register the `install` subcommand: `program.command('install').description('One-time global setup').action(installAction)`
  4. Call `program.parse()`
- After `npm run build`, run `npm link` to make `aeos` available globally during development

### Install command implementation
- Implement `aeos install` command in `src/commands/install.ts`:
  1. Create `~/.aeos/` directory if it does not exist (use `aeosHome()` from M1-011)
  2. Write `~/.aeos/config.json` with defaults if it does not exist: `{ "model": "claude-opus-4-6", "currency": "USD", "advanceMode": "manual" }`
  3. Create `~/.aeos/registry.json` as `{ "projects": [] }` if it does not exist
  4. Configure global gitignore (matching M0-006 logic):
     1. Read `git config --global core.excludesfile`
     2. If a value exists, use **that file** as the target
     3. If no value exists, use `~/.gitignore_global` and run `git config --global core.excludesfile ~/.gitignore_global`
     4. Append `.aeos/` to the target file if not already present
  5. Print success message: `✓ AEOS installed. Run 'aeos project init' in your project.`
- Running `aeos install` a second time must be idempotent (no duplicate entries, no errors, existing config not overwritten)

## Acceptance Criteria
- [ ] Given a fresh environment, when running `aeos install`, then `~/.aeos/` exists with `config.json` and `registry.json`
- [ ] Given `~/.aeos/config.json`, when inspecting it, then `advanceMode` is `"manual"` and `model` is `"claude-opus-4-6"`
- [ ] Given running `aeos install` twice, when checking the active global gitignore file, then `.aeos/` appears exactly once
- [ ] Given a machine where `core.excludesfile` is already set to a custom path, when running `aeos install`, then `.aeos/` is appended to that existing file (not to a new `~/.gitignore_global`)
- [ ] Given `git config --global core.excludesfile`, when checked after install, then it resolves to a valid path containing `.aeos/`

## Out of Scope
- First-run wizard / interactive prompts (M7-002)
- Project-level init (M1-002)

## Technical Notes / Hints
- Use `aeosHome()`, `aeosConfigPath()`, `aeosRegistryPath()` from `src/fs/aeos-home.ts` (M1-011) for all path resolution — do not use raw `os.homedir()` calls
- Use `fs.existsSync` + `fs.mkdirSync({ recursive: true })` for directory creation
- Use `fs.readFileSync` / `fs.writeFileSync` with JSON parse/stringify for config files
- Use `child_process.execSync('git config --global core.excludesfile')` to read the existing value; handle the case where the command returns empty (no config set)
- Wrap all filesystem and git operations in try/catch. On failure, print a clear error message indicating what failed and what the operator should check (e.g. `Error: Cannot write to ~/.aeos/. Check directory permissions.` or `Error: git is not installed or not in PATH.`). Exit with non-zero code on any failure.

## Dependencies
- M0-002 through M0-005: TypeScript + scripts configured
- M1-011: `aeosHome()` filesystem helper (implements path resolution utilities)

## Definition of Done
- [ ] `aeos install` runs without error on a clean machine
- [ ] Idempotency confirmed by running twice (config not overwritten, gitignore not duplicated)
- [ ] Unit tests cover: creates dirs, writes config, respects existing `core.excludesfile`, is idempotent
- [ ] CLI binary wiring verified: `npm run build && npm link && aeos install` works from a fresh terminal
- [ ] Code reviewed and approved
