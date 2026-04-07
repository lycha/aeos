# Task: Implement `aeos project init [--name] [--key]` CLI Command

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** typescript-pro
**Method:** Manual (bootstrapping)

## Context
Creates the per-project `.aeos/` working directory at the current working directory and registers the project in `~/.aeos/registry.json`. Required before any ticket commands can function. The `--key` flag sets the project ticket prefix (e.g., `AEOS`).

## What needs to be done
Implement `src/commands/project-init.ts`:
1. Accept `--name <name>` (defaults to the directory name) and `--key <key>` (defaults to uppercase dir name truncated to 4 chars). Validate that `--key` is 2–4 uppercase letters (regex: `/^[A-Z]{2,4}$/`); reject with a clear error if invalid.
2. Derive a human-readable slug `id` from `--name` by lowercasing and replacing non-alphanumeric characters with hyphens (e.g. `"My Project"` → `"my-project"`). Also generate a `uuid` via `crypto.randomUUID()` for cross-project uniqueness.
3. Create `.aeos/` at CWD if it does not exist
4. Initialize `.aeos/.git` as a separate git repo (`git init`) for artifact versioning
5. Write `.aeos/project.json`:
   ```json
   {
     "uuid": "<crypto.randomUUID()>",
     "id": "<slug>",
     "name": "<name>",
     "key": "<KEY>",
     "path": "<cwd>",
     "created_at": "<ISO>"
   }
   ```
6. Create `.aeos/column-specs/` directory (empty — populated by column spec loader in M2)
7. Register the project in `~/.aeos/registry.json`: read the file, parse the `{ "projects": [...] }` object, push a new entry onto `.projects`, and write back. Registry entry shape:
   ```json
   {
     "uuid": "<crypto.randomUUID()>",
     "id": "<slug>",
     "name": "<name>",
     "key": "<KEY>",
     "path": "<cwd>",
     "aeos_path": "<cwd>/.aeos",
     "created_at": "<ISO>"
   }
   ```
   When re-running in an already-registered directory, match on `path` and skip the append (idempotent).
8. Print: `✓ Project '<name>' initialised. Key: <KEY>. Run 'aeos ticket create <title>' to add your first ticket.`
- Running `aeos project init` in an already-initialised directory must be idempotent

## Acceptance Criteria
- [ ] Given CWD with no `.aeos/`, when running `aeos project init --name "My Project" --key MYPR`, then `.aeos/project.json` exists with `id` = `"my-project"`, `key` = `"MYPR"`, and all `snake_case` fields
- [ ] Given the command runs, when checking `~/.aeos/registry.json`, then `.projects` contains the new entry with `path`, `aeos_path`, and `created_at` fields
- [ ] Given `.aeos/`, when running `git -C .aeos status`, then it is a valid git repo
- [ ] Given running `aeos project init` twice, when checking `.aeos/project.json`, then no duplicate or error occurs, and `registry.json` contains exactly one entry for this path
- [ ] Given a successful `aeos project init`, when checking `.aeos/column-specs/`, then the directory exists and is empty
- [ ] Given `--key TOOLONG`, when running `aeos project init`, then the command rejects with a validation error
- [ ] Given `--key AB`, when running `aeos project init`, then the command accepts (2-char key is valid)

## Out of Scope
- State database initialisation (M1-006 — SQLite schema)
- Column spec file creation (M2)

## Technical Notes / Hints
- Use `crypto.randomUUID()` (Node 19+) for the project `uuid`
- Use `child_process.execSync('git init', { cwd: aeosDir })` to initialise the git repo — `simple-git` is not needed for a one-shot `git init`. M1-014 (`gitCommit()` helper) will install `simple-git` when its richer async API is required.
- Use `aeosRegistryPath()` from M1-011 to resolve `~/.aeos/registry.json` — do not hardcode `os.homedir()` paths
- Wrap all filesystem and git operations in try/catch. On failure, print a clear error message and exit with non-zero code. Examples:
  - `Error: Cannot create .aeos/ directory. Check directory permissions.`
  - `Error: git is not installed or not in PATH.`
  - `Error: ~/.aeos/registry.json is corrupt. Run 'aeos install' to reset.`

## Dependencies
- M1-001: `aeos install` complete (global dirs exist)
- M1-011: `aeosHome()` / `aeosRegistryPath()` filesystem helpers (path resolution utilities)

## Definition of Done
- [ ] `aeos project init` creates `.aeos/` with correct structure
- [ ] Project registered in global registry
- [ ] Idempotency confirmed
- [ ] Unit tests covering happy path and idempotent re-run
- [ ] Code reviewed and approved
