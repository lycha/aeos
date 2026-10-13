# Code Review: M1-002 — `aeos project init [--name] [--key]` CLI Command

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Task specification document — `docs/tasks/M1-002-cli-project-init.md`

---

## Overall Assessment

The task is correctly scoped for the second bootstrapping command — it creates the per-project `.aeos/` directory, seeds `project.json`, initialises a separate git repo for artifacts, and registers the project in the global registry. The acceptance criteria cover the happy path, registry update, git validity, and idempotency. The dependency on M1-001 is correct.

However, there are three Major issues: the `project.json` schema diverges from the system design doc's registry schema in a way that will cause confusion downstream; the `registry.json` append logic doesn't account for the shape already specified in the system design doc; and the task uses `simple-git` for `git init` without establishing the dependency or considering that `child_process.execSync` (already used in M1-001) is simpler for a one-shot command. Four Minor issues cover missing error handling guidance, a missing filesystem helper dependency, an inconsistency in the ticket ID prefix spec, and a missing acceptance criterion for the `column-specs/` directory.

**Verdict:** Approve with changes

---

## Major Issues

### M1. `project.json` schema missing `aeos_path` — diverges from registry schema in system design doc

**File:** `docs/tasks/M1-002-cli-project-init.md` — Step 4 and Step 6

**Problem:**
Step 4 specifies `project.json` as: `{ "id": "<uuid>", "name": "<name>", "key": "<KEY>", "createdAt": "<ISO>" }`.
Step 6 specifies the registry entry as: `{ "id": "<uuid>", "name": "<name>", "key": "<KEY>", "path": "<cwd>" }`.

The system design doc (03-system-design.md, Section 3.5) specifies the registry entry shape as:
```json
{
  "id": "startup-a",
  "name": "Startup A",
  "path": "/Users/kris/projects/startup-a",
  "aeos_path": "/Users/kris/projects/startup-a/.aeos",
  "created_at": "2026-03-01T09:00:00Z"
}
```

Three discrepancies:
1. **`id` semantics:** The task uses `crypto.randomUUID()` for `id`, but the system design doc uses a human-readable slug (`"startup-a"`). Downstream consumers like `aeos project list`, `aeos cost --project startup-a`, and the dashboard all reference projects by human-readable id. A UUID is not usable in CLI commands.
2. **`aeos_path` missing:** The registry entry in the system design doc includes `aeos_path` — the absolute path to `.aeos/`. The task omits it.
3. **`key` missing from system design registry:** The system design doc's registry doesn't include `key`, but the task adds it. This is actually a *good* addition (needed for ticket ID construction in M1-003), but the divergence should be acknowledged.
4. **`created_at` vs `createdAt`:** The system design doc uses `snake_case` (`created_at`), the task uses `camelCase` (`createdAt`). Pick one convention and stick to it.

**Impact:**
M1-003 reads `project.json` to get the project `key`. M1-004/M1-005 will need `id` for display. If `id` is a UUID, `aeos cost --project <uuid>` is unusable. The registry shape mismatch will cause confusion when implementing `aeos project list` or `aeos dashboard`.

**Recommendation:**
1. Use a human-readable slug for `id` (derive from `--name` by lowercasing and hyphenating, e.g. `"My Project"` → `"my-project"`). Keep the UUID as a separate `uuid` field if needed for cross-project uniqueness.
2. Add `aeos_path` to the registry entry: `path.join(cwd, '.aeos')`.
3. Settle on `snake_case` for JSON fields to match the system design doc convention.
4. Update `project.json` to include `path` (the project root absolute path) — this makes it self-describing when read in isolation.

---

### M2. Registry append assumes flat array — system design doc uses `{ "projects": [...] }`

**File:** `docs/tasks/M1-002-cli-project-init.md` — Step 6

**Problem:**
Step 6 says "append `{ ... }` to `~/.aeos/registry.json`". M1-001 seeds `registry.json` as an empty array `[]`. But the system design doc (Section 3.5) shows the registry as:
```json
{
  "projects": [
    { "id": "startup-a", ... }
  ]
}
```

This is a `{ projects: [] }` wrapper, not a bare array. One of these must be wrong. If M1-001 writes `[]` and M1-002 pushes onto it, but the system design doc expects `{ projects: [] }`, then every downstream reader (`aeos project list`, `aeos dashboard`) will break depending on which convention they follow.

**Impact:**
Downstream consumers of `registry.json` will not know whether to `JSON.parse(file)` and iterate directly (array) or access `.projects` first (object). This is a data contract issue that affects every command that reads the registry.

**Recommendation:**
Decide on one shape. The `{ "projects": [] }` wrapper is more extensible (can add `version`, `lastUpdated`, etc. later). Update M1-001 to seed `{ "projects": [] }` and update M1-002 to read `.projects`, push, and write back. Document this decision explicitly.

---

### M3. `simple-git` dependency introduced without justification — `child_process.execSync` is simpler for `git init`

**File:** `docs/tasks/M1-002-cli-project-init.md` — Technical Notes

**Problem:**
The Technical Notes say "Use `simple-git` (install: `npm install simple-git`) to run `git init` programmatically." However:
1. M1-001 already uses `child_process.execSync` for git operations (reading `core.excludesfile`). Adding `simple-git` here introduces a new dependency for a single `git init` call.
2. M1-014 (`gitCommit()` helper) is the task that *actually* needs `simple-git` for its richer async API (staging, committing, error handling). M1-014 lists its own install step.
3. `execSync('git init', { cwd: aeosDir })` is a one-liner with no async complexity.

Installing `simple-git` in M1-002 is premature — it couples a dependency installation to a task that doesn't need the library's capabilities.

**Impact:**
Low runtime impact, but it creates a confusing dependency chain. M1-014 says "Install if not already present: `npm install simple-git`" — if M1-002 already installed it, the conditional is silently true. If M1-002 is ever refactored to not use `simple-git`, M1-014's assumption breaks.

**Recommendation:**
Replace `simple-git` usage in M1-002 with `execSync('git init', { cwd: path.join(cwd, '.aeos') })`. Let M1-014 own the `simple-git` installation. Update the Technical Notes accordingly.

---

## Minor Issues

### m1. No error handling guidance for filesystem or git operations

**File:** `docs/tasks/M1-002-cli-project-init.md`

**Problem:**
Same gap identified in M1-001 review (m2). The task specifies directory creation, file writes, and `git init` but provides no guidance on failure scenarios:
- CWD is not writable
- `git` is not installed
- `~/.aeos/registry.json` is corrupt or not valid JSON
- `project.json` already exists with different content (idempotency edge case)

M1-001's task was updated with explicit error handling guidance after its review. M1-002 should follow the same pattern.

**Recommendation:**
Add to Technical Notes: "Wrap all filesystem and git operations in try/catch. On failure, print a clear error message and exit with non-zero code. For registry.json parse failures, print: `Error: ~/.aeos/registry.json is corrupt. Run 'aeos install' to reset.`"

---

### m2. Missing dependency on M1-011 (`aeosHome()` / `aeosRegistryPath()`)

**File:** `docs/tasks/M1-002-cli-project-init.md` — Dependencies

**Problem:**
Step 6 reads and writes `~/.aeos/registry.json`. The canonical path resolution for this file is `aeosRegistryPath()` from M1-011. The task lists only M1-001 as a dependency. Without M1-011, the implementer will hardcode `path.join(os.homedir(), '.aeos', 'registry.json')` — exactly the pattern M1-011 exists to prevent.

M1-001's review (m3) identified this same gap and the task was updated to depend on M1-011.

**Recommendation:**
Add M1-011 to the Dependencies section. Update Step 6 to use `aeosRegistryPath()` instead of a raw path.

---

### m3. `--key` max length (6 chars) not in the system design doc — needs cross-reference

**File:** `docs/tasks/M1-002-cli-project-init.md` — Step 1

**Problem:**
The task says `--key` "defaults to uppercase dir name, max 6 chars". The system design doc (Section 4, Ticket ID format) says "A 2–4 letter project key". The PRD doesn't specify a length. The task says 6, the system design says 2–4. These are contradictory.

The downstream impact is in ticket ID display width. `MYPROJ-1` is wider than `MYPR-1`. The dashboard layout (Section 8.2) is designed around compact ticket IDs.

**Recommendation:**
Align with the system design doc: max 4 chars, validate that `--key` is 2–4 uppercase letters (regex: `/^[A-Z]{2,4}$/`). If the directory name is longer than 4 chars, truncate to 4. Document this validation in the Acceptance Criteria.

---

### m4. Missing acceptance criterion for `column-specs/` directory

**File:** `docs/tasks/M1-002-cli-project-init.md` — Acceptance Criteria

**Problem:**
Step 5 says "Create `.aeos/column-specs/` directory (empty)". There is no acceptance criterion verifying this directory exists. If an implementer skips it (or a test doesn't check for it), M2-008 (column spec loader) will fail at runtime when it tries to `readdirSync('.aeos/column-specs/')`.

**Recommendation:**
Add AC: "Given a successful `aeos project init`, when checking `.aeos/column-specs/`, then the directory exists and is empty."

---

## Positive Observations

1. **Idempotency is explicitly required** — "Running `aeos project init` in an already-initialised directory must be idempotent." This is called out both in the requirements and in the acceptance criteria. Correct instinct for a setup command.
2. **`column-specs/` seeded empty** with a clear note that it's populated by M2. Good separation of concerns.
3. **Success message includes the next command** (`Run 'aeos ticket create <title>'`) — consistent with M1-001's pattern and good bootstrapping UX.
4. **Out of Scope section** correctly defers SQLite schema (M1-006) and column spec creation (M2).
5. **`crypto.randomUUID()` hint** — practical, avoids a dependency for UUID generation.

---

## Verification Notes

- After M1/M2/m3 fixes: verify that `aeos project init --name "My Big Project" --key MYBP` produces a registry entry with a human-readable slug id, `aeos_path`, and `snake_case` fields matching the system design doc.
- Idempotency test: run `aeos project init` twice, confirm `project.json` is unchanged, registry has exactly one entry (not duplicated), and `.aeos/.git` is still valid.
- Key validation test: run `aeos project init --key TOOLONG` and confirm it rejects with a clear error. Run `aeos project init --key AB` and confirm it accepts.
- Cross-reference: after implementation, verify M1-003 can read `project.json` and extract the `key` field to construct `MYBP-1`.

---

## Draft PR Summary

**Scope:** M1-002 task specification document
**Changes needed before implementation:**

- **Step 4 + Step 6:** Align `project.json` and registry entry schemas with system design doc — use human-readable slug for `id`, add `aeos_path`, use `snake_case` fields, add `path` to `project.json`.
- **Step 6:** Decide on registry shape (`[]` vs `{ "projects": [] }`) and align with M1-001. Recommend `{ "projects": [] }` for extensibility.
- **Technical Notes:** Replace `simple-git` with `execSync('git init')`. Let M1-014 own the `simple-git` installation.
- **Step 1:** Align `--key` max length with system design doc (2–4 uppercase letters). Add validation.
- **Dependencies:** Add M1-011 (`aeosRegistryPath()`).
- **Technical Notes:** Add error handling guidance (matching M1-001 pattern).
- **Acceptance Criteria:** Add criterion for `column-specs/` directory existence.

Please review this summary and confirm it matches the intended changes before updating the task document.
