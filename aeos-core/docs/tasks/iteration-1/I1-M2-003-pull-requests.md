# Task: Pull Requests and Commit Trailers

**Milestone:** I1-M2 — Guard
**Plan package:** 2.3
**Agent:** typescript-pro
**Method:** Agentic implementation, test-first
**Size:** M
**Human-owned inputs:** none (decision D4)

## Context
"Every change goes through a pull request … nothing goes straight to `main`." The orchestrator already isolates an epic on `aeos/<epicId>` with a base tag `aeos-base/<epicId>` (`orchestrator.use-case.ts`), and `ticket-approve.use-case.ts` commits each finished task there. Then nothing: `git-gateway.port.ts` has no push and no pull request is opened. A standalone task run with `ticket run` gets no branch at all and commits on whatever is checked out.

Decision D4: open pull requests with the `gh` command behind a port. No GitHub API client dependency.

## What needs to be done
1. **Git gateway.** Add `push(dir, branch)`, `currentBranch(dir)`, `defaultBranch(dir)` and `hasRemote(dir)`.
2. **Port.** `pull-request-gateway.port.ts`: `isAvailable(cwd) → { ok, reason? }` and `create({ cwd, base, head, title, body }) → { url }`.
3. **Adapter.** A `gh` adapter that spawns `gh pr create --base … --head … --title … --body-file …`. `isAvailable` checks `gh` is on PATH, authenticated (`gh auth status`) and that the repository has a remote. A stub adapter returns a fake URL; the container selects it when `AEOS_EXECUTOR=stub`.
4. **Standalone tasks get a branch.** When a task with no parent first leaves `BACKLOG`, put it on `aeos/<taskId>` and tag `aeos-base/<taskId>`, mirroring the epic logic. Refuse to run a task while `HEAD` is the default branch.
5. **Open the pull request.**
   - Epic: when it is approved out of `INTEGRATION_REVIEW`, push `aeos/<epicId>` and open the pull request against the default branch.
   - Standalone task: when it is approved to `DONE`, after the task commit.
6. **Body.** Build it from what exists: title and ticket id; links or paths for the integration review (or code review), the checks table, and total cost from the cost records. Leave a marked placeholder for the spec pin and conformance summary; I1-M3-002a and I1-M4-002b fill them.
7. **Remember the URL.** Add a nullable `pr_url` column to `tickets` (migration) and show it in `ticket show`.
8. **When a pull request cannot be opened.** Do not skip silently. The approve command stops with a needs-human error naming the cause (`gh` missing, not authenticated, no remote) and the fix. The ticket stays `SIGNED_OFF`, so re-running approve retries.
9. **Opt-out for local projects.** `"pullRequests": { "enabled": false }` in `project.json` disables steps 5 and 8. Default is enabled.
10. **Trailers.** The task commit message in `ticket-approve.use-case.ts` becomes:
    ```
    [AEOS-12] Title

    Ticket: AEOS-12
    Epic: AEOS-10
    ```
    Build it through one function that accepts extra trailers; `Spec:` and `Implements:` are added by I1-M3-002a and I1-M4-001.
11. Update the root README claim that the orchestrator "never merges a PR" only if needed: it stays true.

## Acceptance Criteria
- [ ] Given an epic approved out of `INTEGRATION_REVIEW` with the stub gateway, when approve runs, then the branch is pushed, a pull request URL is stored, and `ticket show` displays it
- [ ] Given a standalone task, when it first runs, then it is on `aeos/<taskId>` and never commits on the default branch
- [ ] Given `HEAD` on the default branch and a standalone task, when `ticket run` is called, then the engine switches to the task branch before any executor runs
- [ ] Given `gh` not on PATH, when approve would open a pull request, then it stops with a message naming `gh` and the ticket remains `SIGNED_OFF`
- [ ] Given `pullRequests.enabled: false`, when an epic is approved, then no push and no pull request happen and approval succeeds
- [ ] Given a finished task, when its commit is read, then it carries `Ticket:` and, for a child task, `Epic:` trailers
- [ ] Given the end-to-end test, when it ends, then the default branch has no commit made by the engine

## Out of Scope
- Merging. It stays a human action (D6).
- GitLab, Bitbucket. The port allows another adapter later.
- Updating an existing pull request after further commits. Pushing again is enough.

## Technical Notes / Hints
- `gh pr create` fails if a pull request already exists for the head branch. Detect it (`gh pr view --json url`) and store that URL instead.
- The `.aeos` repository has no remote, so the body cannot link into it. Use paths plus a short inline summary.
- `gh` becomes a required resource for `ticket approve` in the CLI contract. It is listed there as proposed.

## Layer Mapping
```
Domain ports: src/domain/ports/driven/git-gateway.port.ts, pull-request-gateway.port.ts (new)
Adapters:     src/infrastructure/git/simple-git-gateway.adapter.ts
              src/infrastructure/pull-request/gh-pull-request.adapter.ts, stub-pull-request.adapter.ts
Application:  src/application/ticket-approve.use-case.ts, orchestrator.use-case.ts, ticket-run.use-case.ts, ticket-show.use-case.ts
Persistence:  src/infrastructure/persistence/database.ts, sqlite-ticket.repository.ts
Wiring:       src/cli/container.ts
```

## Dependencies
- I1-M0-001: end-to-end harness

## Definition of Done
- [ ] Common Definition of Done in `README.md`
- [ ] One real pull request opened by the engine against this repository, linked in the task's own pull request
