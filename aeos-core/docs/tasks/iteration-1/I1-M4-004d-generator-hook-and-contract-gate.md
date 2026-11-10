# Task: The Generator Hook and the Contract Gate

**Milestone:** I1-M4 — Prove
**Plan package:** 4.4 (part 4 of 4)
**Agent:** typescript-pro
**Method:** Agentic implementation, test-first
**Size:** M
**Human-owned inputs:** none

## Context
Two rules from the manifesto are still unenforced after 004a–c:

- "Everything that can be derived from the specification is generated deterministically." The CLI generator exists but only a person or CI runs it. The pipeline should run generators itself, before an agent starts, so the agent fills a scaffold that already matches the contract.
- "Every change to the API contract or the database schema gets an engineer's review." This is one of the three gates that always has a human. Nothing detects such a change today.

Both are project-level mechanisms, not AEOS-specific ones: any project with an OpenAPI file or a migrations directory needs the same two things.

## What needs to be done
**A. Generators.**
1. Add to `.aeos/project.json`:
   ```json
   "generators": [
     { "name": "cli", "command": "npm run generate:cli",
       "inputs": ["cli-contract.yaml"], "outputs": ["src/cli/generated/**"] }
   ]
   ```
2. Before the worker in a column with `executorMode: agentic`, for each generator: hash its inputs; if the hash differs from the one stored for this project (a small JSON file under `.aeos/tmp/`), run the command through the checks runner. A failing generator fails the attempt with its output. Commit the regenerated outputs as `[<ticket>][GENERATED] <name>` before the worker starts.
3. Every generator's `outputs` are added to the protected paths for the run. The agent builds on generated code and may not edit it.
4. One run record per generator invocation: `role: generator`, `executor: shell`, `cost_basis: none`.

**B. The contract gate.**
1. Add to `.aeos/project.json`:
   ```json
   "contracts": ["cli-contract.yaml", "src/infrastructure/persistence/database.ts", ".aeos/schemas/**"]
   ```
   The list is the project's declaration of its hard contracts. Generator `inputs` are contracts implicitly.
2. A contract path is **not** a protected path: a ticket may legitimately change a contract. Instead, after the worker runs, compare the diff against the globs. If any contract path changed, mark the ticket `contractChange: true` with the list of paths (migration: nullable `contract_change` text on `tickets`).
3. **Who may change it.** By principle III a contract is written or approved by a person. When an agentic worker changed a contract path, the attempt is still allowed to proceed to review — the diff is the proposal — but:
   - `ticket approve` on a ticket with `contractChange` is refused without `--contract`
   - the refusal prints the changed paths and the diff of each
   - with `--contract`, a `contract` gate record is written citing those paths, then the approval proceeds
   - the orchestrator never passes `--contract`. A column with `advanceMode: auto` halts with `needs_human` on such a ticket.
4. **Bugs.** A bug task (I1-M4-003) whose fix touches a contract path halts with: "this fix changes a contract; it is a behaviour change, not a bug fix". The person decides whether to approve with `--contract` or re-file it.
5. Show `contractChange` in `ticket show` and in the pull request body.

**C. This repository.** Add the `generators` and `contracts` entries above to AEOS's own `.aeos/project.json` (a human-made change; note it in the pull request).

## Acceptance Criteria
- [ ] Given a changed `cli-contract.yaml` and an agentic column, when the run starts, then the generator runs before the worker and its output is committed
- [ ] Given unchanged generator inputs, when a run starts, then the generator does not run
- [ ] Given a worker that edits a generator output, when the attempt ends, then it is a protected-path violation
- [ ] Given a worker whose diff touches a path in `contracts`, when the attempt ends, then the ticket is marked with the changed paths
- [ ] Given such a ticket, when `ticket approve` runs without `--contract`, then it is refused and prints the paths
- [ ] Given `--contract`, when approve runs, then a `contract` gate record naming the paths is committed before the ticket advances
- [ ] Given the orchestrator and an auto-advancing column, when the ticket carries a contract change, then it halts needing a human
- [ ] Given a bug task that touches a contract path, when the attempt ends, then it halts with the behaviour-change message
- [ ] Given a generator command that fails, when the run starts, then the attempt fails with the generator's output and the worker never runs

## Out of Scope
- Generators for other projects' stacks. The `tooling/` scaffolds (OpenAPI, SQL migrations) plug into this mechanism later with no engine change.
- Deciding which paths are contracts for a project. That list is the operator's.

## Technical Notes / Hints
- `--contract` is in the proposed CLI contract as an option on `ticket approve`.
- The verifier (004a) and the freshness check (004b) already fail a run where code and contract disagree. This task adds the *human* decision on top; do not weaken either check to make a contract change "pass".
- Changing the CLI contract through AEOS itself is the proving feature for the iteration (`aeos dashboard`). Walk that path by hand once before calling this done.

## Layer Mapping
```
Model:       src/domain/model/project-executor-config.ts, ticket.ts
Application: src/application/ticket-run.use-case.ts, ticket-approve.use-case.ts, orchestrator.use-case.ts, services/gate-recorder.ts
Domain svc:  src/domain/services/orchestrator-policy.ts (halt on contract change), path-guard.ts (reuse the matcher)
Persistence: src/infrastructure/persistence/database.ts, sqlite-ticket.repository.ts
CLI:         src/cli/commands/ticket-approve.handler.ts, ticket-show.handler.ts
```

## Dependencies
- I1-M4-004b (a generator to run), I1-M2-002 (protected paths and the matcher), I1-M3-004 (gate records)

## Definition of Done
- [ ] Common Definition of Done in `README.md`
