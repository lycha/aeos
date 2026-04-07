# Task: Implement `aeos project init [--name] [--key]` CLI Command

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** typescript-pro
**Method:** Manual (bootstrapping)

## Context
Creates the per-project `.aeos/` working directory at the current working directory and registers the project in `~/.aeos/registry.json`. Required before any ticket commands can function. The `--key` flag sets the project ticket prefix (e.g., `AEOS`).

## What needs to be done
Implement `src/commands/project-init.ts`:
1. Accept `--name <name>` (defaults to the directory name) and `--key <key>` (defaults to uppercase dir name, max 6 chars)
2. Create `.aeos/` at CWD if it does not exist
3. Initialize `.aeos/.git` as a separate git repo (`git init`) for artifact versioning
4. Write `.aeos/project.json`: `{ "id": "<uuid>", "name": "<name>", "key": "<KEY>", "createdAt": "<ISO>" }`
5. Create `.aeos/column-specs/` directory (empty — populated by column spec loader in M2)
6. Register the project in `~/.aeos/registry.json`: append `{ "id": "<uuid>", "name": "<name>", "key": "<KEY>", "path": "<cwd>" }`
7. Print: `✓ Project '<name>' initialised. Key: <KEY>. Run 'aeos ticket create <title>' to add your first ticket.`
- Running `aeos project init` in an already-initialised directory must be idempotent

## Acceptance Criteria
- [ ] Given CWD with no `.aeos/`, when running `aeos project init --name "My Project" --key MYPRJ`, then `.aeos/project.json` exists with the correct name and key
- [ ] Given the command runs, when checking `~/.aeos/registry.json`, then the new project entry is present
- [ ] Given `.aeos/`, when running `git -C .aeos status`, then it is a valid git repo
- [ ] Given running `aeos project init` twice, when checking `.aeos/project.json`, then no duplicate or error occurs

## Out of Scope
- State database initialisation (M1-006 — SQLite schema)
- Column spec file creation (M2)

## Technical Notes / Hints
- Use `crypto.randomUUID()` (Node 19+) for the project `id`
- Use `simple-git` (install: `npm install simple-git`) to run `git init` programmatically

## Dependencies
- M1-001: `aeos install` complete (global dirs exist)

## Definition of Done
- [ ] `aeos project init` creates `.aeos/` with correct structure
- [ ] Project registered in global registry
- [ ] Idempotency confirmed
- [ ] Unit tests covering happy path and idempotent re-run
- [ ] Code reviewed and approved
