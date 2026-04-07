# Task: Configure Global Gitignore to Exclude `.aeos/`

**Milestone:** M0 — Repo & Toolchain Setup
**Agent:** —
**Method:** Manual (shell configuration)

## Context
Prevents `.aeos/` from ever appearing in `git status` of any project. This is a dev-environment safety net that must be in place before M1's `aeos install` command is written — which will replicate this step programmatically for end users. This task is for the developer's own machine only.

## What needs to be done
1. Check whether a global gitignore is already configured:
   ```bash
   git config --global core.excludesfile
   ```
   - If a path is returned, use **that file** in steps 2–3 instead of `~/.gitignore_global` to avoid
     creating a second, competing global ignore file.
   - If nothing is returned, proceed with `~/.gitignore_global`.
2. Open or create the target file (default: `~/.gitignore_global`) and append the following lines if
   not already present:
   ```
   # AEOS pipeline working directory
   .aeos/
   ```
3. If the file was newly created, register it with git globally:
   ```bash
   git config --global core.excludesfile ~/.gitignore_global
   ```
   Skip this step if `core.excludesfile` was already set in step 1.
4. In the `aeos` dev repo, confirm `.aeos/` does not appear in `git status` output: create a temporary
   `.aeos/` directory, run `git status`, confirm it is not listed, then **remove the directory**.

## Acceptance Criteria
- [x] Given the active global gitignore file (determined in step 1), when inspecting the file, then `.aeos/` is listed as an entry
- [x] Given `git config --global core.excludesfile`, when running this command, then it returns a valid path to an existing file
- [x] Given a temporary `.aeos/` directory created inside the `aeos` dev repo, when running `git status`, then `.aeos/` does not appear in the output
- [x] Given the verification above, when it passes, then the temporary `.aeos/` directory has been removed

## Out of Scope
- Per-repo `.gitignore` entries for `.aeos/` (the global rule is intentional — users should not need per-repo config)
- The `aeos install` command that automates this for end users (M1-001)

## Technical Notes / Hints
- On macOS, `~` resolves to `/Users/<username>`
- The git global config is stored at `~/.gitconfig`; verify with `cat ~/.gitconfig | grep excludesfile`

## Dependencies
- M0-001: Repo cloned locally

## Definition of Done
- [x] Active global gitignore file contains `.aeos/`
- [x] `git config --global core.excludesfile` confirms the file is registered (no duplicate config)
- [x] Verification test (temp `.aeos/` + `git status`) passes and temp directory removed
