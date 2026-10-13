# Task: Implement `aeos install` First-Run Wizard

**Milestone:** M7 — Polish & Distribution
**Agent:** typescript-pro
**Method:** Manual

## Context
Upgrades the existing `aeos install` command (M1-001) from a silent setup to an interactive first-run wizard. A new user should understand what AEOS is doing and have working defaults configured within 5 minutes. Requires M1-001 to exist (this is an enhancement, not a replacement).

## What needs to be done
Extend `src/commands/install.ts` with an interactive prompt flow (run only when `~/.aeos/` does not already exist):

```
Welcome to AEOS — AI-Engineered Operating System

Configuring your environment...

? Default model (claude-opus-4-5): [default: claude-opus-4-5]
? Currency for cost tracking (USD/GBP/EUR): [default: USD]
? Advance mode (manual/auto): [default: manual]

✓ Created ~/.aeos/config.json
✓ Configured global gitignore (.aeos/ excluded)
✓ AEOS installed successfully!

Next step: cd into your project and run 'aeos project init'
```

Use `readline` from `node:readline/promises` for async prompts. If running non-interactively (stdin is not a TTY — e.g., in CI or scripts), skip prompts and use defaults silently.

## Acceptance Criteria
- [ ] Given a fresh machine (no `~/.aeos/`), when running `aeos install`, then the wizard prompts for model, currency, and advance mode with defaults shown
- [ ] Given the user accepts all defaults (presses Enter), when wizard completes, then `config.json` contains default values
- [ ] Given a non-TTY environment (`aeos install < /dev/null`), when running, then no prompts appear and defaults are applied silently
- [ ] Given `~/.aeos/` already exists, when running `aeos install`, then wizard is skipped and idempotent setup runs silently
- [ ] Given the completion message, when reading, then "Next step" guidance is shown

## Out of Scope
- Model validation against a live API (v2)
- Plugin or extension installation

## Technical Notes / Hints
- Detect TTY: `process.stdin.isTTY === true`
- `node:readline/promises` provides `createInterface` with async `question()` method
- Validate currency input against an allowlist: `['USD', 'GBP', 'EUR']`

## Dependencies
- M1-001: `aeos install` base implementation
- M7-001: Binary packaging (wizard must work in the packaged binary)

## Definition of Done
- [ ] Wizard runs interactively on first install
- [ ] Non-TTY falls back to silent defaults
- [ ] Idempotency preserved (second install skips wizard)
- [ ] Unit tests: TTY mode (mocked readline), non-TTY mode, existing install
- [ ] Code reviewed and approved
