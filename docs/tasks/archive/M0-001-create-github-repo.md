# Task: Create Private GitHub Repository `aeos`

**Milestone:** M0 — Repo & Toolchain Setup
**Agent:** —
**Method:** Manual

## Context
Bootstrap step zero. No AEOS tooling exists yet. The repo must exist before any other M0 task can proceed.

## What needs to be done
- Create a new **private** GitHub repository named `aeos` under the correct owner/org
- Initialize with no README (the repo will be configured manually in subsequent tasks)
- Clone the repo locally to the development machine
- Confirm the default branch is `main`

## Acceptance Criteria
- [ ] Given the GitHub org/account, when visiting `https://github.com/<owner>/aeos`, then the repo exists and is set to **private**
- [ ] Given a fresh clone, when running `git status`, then the working tree is clean and on branch `main`
- [ ] Given the cloned directory, when running `ls -la`, then `.git/` and `LICENSE` are the only entries present

## Out of Scope
- Branch protection rules (configured after CI is set up in M0-007)
- Repo description, topics, or social preview

## Dependencies
- GitHub account / org access with repo creation permissions

## Definition of Done
- [ ] Repo exists at `github.com/<owner>/aeos`, visibility: private
- [ ] Local clone confirmed clean on `main`
- [ ] Shared with all team members who need access
