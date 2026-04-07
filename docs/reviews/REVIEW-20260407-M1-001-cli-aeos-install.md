# Code Review: M1-001 — `aeos install` CLI Command

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Task specification document — `docs/tasks/M1-001-cli-aeos-install.md`

---

## Overall Assessment

The task is well-scoped for a first CLI command — it addresses the global home directory, default config, project registry seed, and global gitignore in a single idempotent operation. The description is clear enough for an implementer to execute without ambiguity in most areas.

However, there are two Major issues that will cause implementation problems or runtime bugs if not addressed: the task ignores the M0 review finding about respecting an existing `core.excludesfile` (which was already fixed in M0-006 itself), and the task doesn't wire up the CLI entrypoint (`src/cli.ts` + `package.json` `bin` field) with enough specificity to produce a working `aeos` command. Three Minor issues relate to missing error handling guidance, a config value that doesn't match the system design doc, and a missing dependency on the `aeosHome()` helper.

**Verdict:** Approve with changes

---

## Major Issues

### M1. Global gitignore: hardcodes `~/.gitignore_global` without checking existing `core.excludesfile`

**File:** `docs/tasks/M1-001-cli-aeos-install.md` — Step 4–5

**Problem:**
Steps 4 and 5 unconditionally append to `~/.gitignore_global` and set `core.excludesfile` to that path. The M0 review (REVIEW-20260407-M0-toolchain.md, finding m5) already identified that some systems have `core.excludesfile` pointing to a different path (e.g. `~/.config/git/ignore`). M0-006 was updated to include the pre-check. This task — the *programmatic equivalent* of M0-006 for end users — must replicate the same logic, otherwise `aeos install` will silently create a second competing global ignore file on machines that already have one configured.

**Impact:**
On any machine where the operator (or their OS/tooling) already set `core.excludesfile` to a non-default path, `.aeos/` will NOT be ignored by git because git only reads the file at the configured path, not `~/.gitignore_global`.

**Recommendation:**
Replace steps 4–5 with:
1. Read `git config --global core.excludesfile`
2. If a value exists, use that file as the target
3. If no value exists, use `~/.gitignore_global` and set `git config --global core.excludesfile ~/.gitignore_global`
4. Append `.aeos/` to the target file if not already present

This matches the logic already specified in M0-006 after its review update.

---

### M2. CLI entrypoint wiring is under-specified

**File:** `docs/tasks/M1-001-cli-aeos-install.md` — "What needs to be done" section

**Problem:**
The task says "Create `src/cli.ts` as the CLI entrypoint wired to `bin` in `package.json`" but does not specify:
1. The `bin` field value in `package.json` (e.g. `"bin": { "aeos": "./dist/cli.js" }`)
2. The shebang line required in `src/cli.ts` (`#!/usr/bin/env node`)
3. Whether `npm link` or equivalent is needed for local dev testing
4. The Commander.js program setup (name, version, description)

Without these, an implementer (human or agent) may produce a `cli.ts` that compiles but cannot be invoked as `aeos` from the terminal. Since this is the *first* CLI command and sets the pattern for all subsequent commands, the wiring must be explicit.

**Impact:**
The acceptance criterion "when running `aeos install`" will fail if the binary isn't properly linked. The implementer will waste cycles debugging Node module resolution and bin linking rather than the actual install logic.

**Recommendation:**
Add explicit steps:
1. Add `"bin": { "aeos": "./dist/cli.js" }` to `package.json`
2. `src/cli.ts` must start with `#!/usr/bin/env node`
3. Wire Commander.js: `const program = new Command(); program.name('aeos').version('0.1.0');`
4. Register `install` as a subcommand: `program.command('install').description('...').action(installAction)`
5. Add a dev setup note: run `npm link` after `npm run build` to make `aeos` available globally during development

---

## Minor Issues

### m1. Config default `model` value doesn't match system design doc

**File:** `docs/tasks/M1-001-cli-aeos-install.md` — Step 2

**Problem:**
The task specifies `"model": "claude-opus-4-5"` in the default config. The system design doc (03-system-design.md, sections 4.2, 5.1, 5.2) consistently uses `"claude-opus-4-6"` as the model identifier. This is likely a stale reference.

**Recommendation:**
Change to `"model": "claude-opus-4-6"` to match the system design doc, or add a note that the default model should be confirmed before implementation.

---

### m2. No error handling guidance for filesystem or git operations

**File:** `docs/tasks/M1-001-cli-aeos-install.md`

**Problem:**
The task specifies `fs.mkdirSync`, `fs.writeFileSync`, and `git config --global` but provides no guidance on what to do when:
- The home directory is not writable (permissions)
- `git` is not installed or not in PATH
- The global gitignore file exists but is not writable

The system design doc (Section 7, sub-state FAILED) describes explicit error surface expectations. For a bootstrapping command that runs before any pipeline exists, clear error messages are especially important since the operator has no fallback.

**Recommendation:**
Add a Technical Note: "Wrap all filesystem and git operations in try/catch. On failure, print a clear error message indicating what failed and what the operator should check (e.g. `Error: Cannot write to ~/.aeos/. Check directory permissions.`). Exit with non-zero code on any failure."

---

### m3. Missing cross-reference to M1-011 (`aeosHome()` helper)

**File:** `docs/tasks/M1-001-cli-aeos-install.md` — Dependencies and Technical Notes

**Problem:**
The task says to use `os.homedir()` directly, but M1-011 defines `aeosHome()`, `aeosConfigPath()`, and `aeosRegistryPath()` as the canonical path resolution utilities. If M1-001 is implemented before M1-011, it will hardcode `path.join(os.homedir(), '.aeos')` throughout, which M1-011 is specifically designed to prevent. If M1-011 is implemented first, M1-001 should consume it.

**Recommendation:**
Either:
(a) Add M1-011 as a dependency and update the Technical Notes to use `aeosHome()`, `aeosConfigPath()`, `aeosRegistryPath()` instead of raw `os.homedir()` calls, or
(b) Explicitly note that M1-001 is implemented first with inline paths, and M1-011 will refactor them later — and add a refactoring note to M1-011's task.

Option (a) is cleaner. M1-011 has zero side effects and no dependencies beyond M0-002, so it can be implemented first.

---

## Positive Observations

1. **Idempotency is explicitly called out** as a requirement and as an acceptance criterion. This is the right instinct for a global setup command that operators will inevitably run multiple times.
2. **registry.json seeded as empty array** — simple, correct, and avoids the need for null-checking in downstream code (M1-002 can always `JSON.parse` + `.push()`).
3. **Out of Scope section** correctly defers the install wizard (M7-002) and project-level init (M1-002), keeping this task focused.
4. **Success message includes the next command** (`Run 'aeos project init'`) — good UX pattern for a sequential bootstrapping flow.

---

## Verification Notes

- After M1 fix is applied: verify the global gitignore pre-check by testing on a machine where `core.excludesfile` is already set to `~/.config/git/ignore` — confirm `.aeos/` is appended to that file, not to a new `~/.gitignore_global`.
- The `bin` wiring should be verified by running `npm run build && npm link && aeos install` from a clean terminal session.
- Idempotency test: run `aeos install` twice, then `cat ~/.gitignore_global` (or the configured excludes file) and confirm `.aeos/` appears exactly once. Also confirm `~/.aeos/config.json` is not overwritten on second run (preserving any operator customisations).

---

## Draft PR Summary

**Scope:** M1-001 task specification document
**Changes needed before implementation:**

- **Steps 4–5:** Replace hardcoded `~/.gitignore_global` with pre-check for existing `core.excludesfile` — match the logic already specified in the updated M0-006.
- **CLI wiring:** Add explicit `bin` field, shebang, Commander.js setup, and `npm link` dev note.
- **Step 2:** Change default model from `claude-opus-4-5` to `claude-opus-4-6` to match system design doc.
- **Technical Notes:** Add error handling guidance for filesystem and git failures.
- **Dependencies:** Add M1-011 as a dependency or document the refactoring path.

Please review this summary and confirm it matches the intended changes before updating the task document.
