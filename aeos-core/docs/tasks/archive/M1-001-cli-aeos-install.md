# Task: Implement `aeos install` CLI Command

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** typescript-pro
**Method:** Manual (bootstrapping)

## Context
First CLI command a user ever runs. Creates `~/.aeos/` global home directory, configures the global gitignore (programmatic equivalent of M0-006), and writes default `config.json`. Requires the CLI shell (Commander.js) to be wired up.

## What needs to be done

### CLI entrypoint wiring
- Install Commander.js: `npm install commander`
- Add `"bin": { "aeos": "./dist/cli/index.js" }` to `package.json`
- Update `src/cli/index.ts` as the CLI entrypoint:
  1. First line must be `#!/usr/bin/env node`
  2. Import and configure Commander.js: `const program = new Command(); program.name('aeos').version('0.1.0');`
  3. Register the `install` subcommand: `program.command('install').description('One-time global setup').action(installAction)`
  4. Build the container via `createContainer()` from `src/cli/container.ts` and pass use cases to commands
  5. Call `program.parse()`
- After `npm run build`, run `npm link` to make `aeos` available globally during development

### Install command implementation
- Implement the CLI command in `src/cli/commands/install.command.ts` — parses args, calls use case, formats output
- Implement the use case in `src/application/install.use-case.ts` — orchestrates domain logic via `ConfigStore` and `GitGateway` ports:
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

## Layer Mapping
```
CLI command:  src/cli/commands/install.command.ts    — parse args, call use case, print output
Use case:     src/application/install.use-case.ts    — orchestrate via ConfigStore + GitGateway ports
Domain:       (no new domain logic)
Adapters:     FsConfigStore (src/infrastructure/filesystem/fs-config.adapter.ts)
              SimpleGitGateway (src/infrastructure/git/simple-git-gateway.adapter.ts)
```

## Technical Notes / Hints
- The use case calls `ConfigStore.ensureHomeDir()`, `ConfigStore.writeConfigIfNotExists()`, `ConfigStore.writeRegistry()`, and `ConfigStore.ensureGlobalGitignore('.aeos/')` — all filesystem/git operations are in the adapter, not in the use case
- The CLI command calls the use case, catches errors, formats the success/error message, and sets the exit code
- Wrap all operations in try/catch. On failure, print a clear error message (e.g. `Error: Cannot write to ~/.aeos/. Check directory permissions.`). Exit with non-zero code on any failure.

## Dependencies
- M0-002 through M0-005: TypeScript + scripts configured
- M1-011: `aeosHome()` filesystem helper (implements `FsConfigStore` adapter internals)

## Definition of Done
- [ ] `aeos install` runs without error on a clean machine
- [ ] Idempotency confirmed by running twice (config not overwritten, gitignore not duplicated)
- [ ] Unit tests cover: creates dirs, writes config, respects existing `core.excludesfile`, is idempotent
- [ ] CLI binary wiring verified: `npm run build && npm link && aeos install` works from a fresh terminal
- [ ] Code reviewed and approved
