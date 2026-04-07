# Task: Implement `aeos install` CLI Command

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** typescript-pro
**Method:** Manual (bootstrapping)

## Context
First CLI command a user ever runs. Creates `~/.aeos/` global home directory, configures the global gitignore (programmatic equivalent of M0-006), and writes default `config.json`. Requires the CLI shell (Commander.js) to be wired up.

## What needs to be done
- Install Commander.js: `npm install commander`
- Create `src/cli.ts` as the CLI entrypoint wired to `bin` in `package.json`
- Implement `aeos install` command in `src/commands/install.ts`:
  1. Create `~/.aeos/` directory if it does not exist
  2. Write `~/.aeos/config.json` with defaults: `{ "model": "claude-opus-4-5", "currency": "USD", "advanceMode": "manual" }`
  3. Create `~/.aeos/registry.json` as an empty array `[]` if it does not exist
  4. Append `.aeos/` to `~/.gitignore_global` if not already present
  5. Run `git config --global core.excludesfile ~/.gitignore_global`
  6. Print success message: `✓ AEOS installed. Run 'aeos project init' in your project.`
- Running `aeos install` a second time must be idempotent (no duplicate entries, no errors)

## Acceptance Criteria
- [ ] Given a fresh environment, when running `aeos install`, then `~/.aeos/` exists with `config.json` and `registry.json`
- [ ] Given `~/.aeos/config.json`, when inspecting it, then `advanceMode` is `"manual"`
- [ ] Given running `aeos install` twice, when checking `~/.gitignore_global`, then `.aeos/` appears exactly once
- [ ] Given `git config --global core.excludesfile`, when checked after install, then it resolves to `~/.gitignore_global`

## Out of Scope
- First-run wizard / interactive prompts (M7-002)
- Project-level init (M1-002)

## Technical Notes / Hints
- Use `os.homedir()` from Node's `os` module to resolve `~`
- Use `fs.existsSync` + `fs.mkdirSync({ recursive: true })` for directory creation
- Use `fs.readFileSync` / `fs.writeFileSync` with JSON parse/stringify for config files

## Dependencies
- M0-002 through M0-005: TypeScript + scripts configured

## Definition of Done
- [ ] `aeos install` runs without error on a clean machine
- [ ] Idempotency confirmed by running twice
- [ ] Unit tests cover: creates dirs, writes config, is idempotent
- [ ] Code reviewed and approved
