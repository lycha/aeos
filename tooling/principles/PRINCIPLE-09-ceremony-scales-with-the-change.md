# Principle IX — Ceremony scales with the change

> **Principle.** The full pipeline is for changes people would otherwise argue about later. A
> wording fix, a behaviour tweak or a bug starts further down the pipeline, not at the top. Every
> track still goes through a pull request with green checks, and contract and schema changes always
> get an engineer review — regardless of which lane the change took to get there.
>
> **Law.** *Gall's Law* — a complex working system grew from a simple working one, so specs are
> sliced small and each slice is released and measured before the next builds on it. *All Models
> Are Wrong (Box)* — a spec is a model of what users need, useful but never finished, amended as
> often as the team learns something new.

This is an **enforcement-tooling** note, not a scaffold to copy. It describes how AEOS and its host
repo route a change to a ceremony tier, and the concrete CI that keeps the two non-negotiables
intact: a PR-with-green-checks floor under *every* lane, and an engineer review on *every*
contract or schema change no matter how small the diff looks.

## What it demands, operationally

1. **Classify before you route.** Every change lands in exactly one tier. The classifier is a pure
   function of observable facts — changed paths, PR labels, diff of the OpenAPI spec, diff of the
   migrations directory — never a vibe. In AEOS terms this is the ticket `kind`: an **epic** takes
   the full sequence (`PRODUCT_SCOPING → TECH_SPEC → TASK_BREAKDOWN → INTEGRATION_REVIEW →
   DOD_GATE`), a **task** takes the short one (`IMPLEMENTATION → CODE_REVIEW → QA`). The tier is
   the entry column, not a discount on quality.
2. **Fast lane for low-risk.** Docs, copy, a one-line behaviour tweak, a contained bugfix: these
   run a reduced check set and are eligible for automated merge once green. They skip scoping and
   tech-spec ceremony — they do not skip the PR or the checks.
3. **Full ceremony for risky.** A new capability, or anything touching a contract or schema, runs
   the whole panel (engineering, product, invariants, architecture, security — see VI) and the
   human gates (VII).
4. **Two floors that no tier lowers.** (a) A PR with required checks green is mandatory on every
   lane. (b) A contract (`openapi.yaml`) or schema (migrations) change always pulls in a human
   engineer reviewer, even on a PR a human never would have thought to flag. These are the
   always-on rails; tiering only varies what sits *above* them.
5. **Slice small, measure each slice (Gall + Box).** The spec is decomposed into vertical slices,
   each shippable and measurable on its own. `TASK_BREAKDOWN` is exactly this: the architect slices
   an epic into child `T-NNN` tasks, each of which is released and measured before the next is
   argued about. A slice that teaches the team something amends the spec rather than the code.

## Reference architecture

```
                       ┌──────────────────────────┐
  PR opened  ─────────►│  classify (pure)         │   changed paths + labels + spec/migration diff
                       └────────────┬─────────────┘
                                    │  tier = { fast | standard | full }
            ┌───────────────────────┼─────────────────────────┐
            ▼                       ▼                           ▼
     FAST LANE                STANDARD LANE                FULL LANE
   docs / copy /           behaviour change /          new capability /
   trivial bugfix          bounded task                 contract / schema
            │                       │                           │
   lint + unit             lint + unit + integ          full panel + e2e +
   (reduced required)      (task required set)          contract/migration gates
            │                       │                           │
            ▼                       ▼                           ▼
   auto-merge queue ◄──── PR + green checks (FLOOR, all lanes) ────► human gate (VII)
                                    │
                        contract/schema touched?  ──yes──►  engineer review REQUIRED
                                    │ no                      (CODEOWNERS, cannot be skipped)
                                    ▼
                               merge queue → trunk
```

The classifier emits a tier; the tier selects a required-check set and a merge policy; two rules
(`pr-floor`, `contract-schema-gate`) are injected into *every* tier unconditionally. The merge queue
is the single serialization point so trunk stays green (trunk-based development, small PRs).

In AEOS this maps onto data, not code: `kind` chooses the column sequence, and each
`.aeos/column-specs/*.yaml` sets its own `reviewLoop.maxIterations` (default 5, column overrides
global), its reviewer agent and rubric, and validation rules. A fast-lane column is a spec with a
lighter reviewer and a smaller rubric — the ceremony is tuned in YAML, per the repo's "specs are
data, not code" rule, not forked in TypeScript.

## CI / automation

**Change-type detection (the classifier).**
- `dorny/paths-filter` (<https://github.com/dorny/paths-filter>) computes per-path booleans
  (`docs`, `src`, `openapi`, `migrations`) at the *job* level so a job can be skipped without
  wedging a required check. Deciding at the workflow level breaks required checks — a skipped
  required workflow stays `pending` and blocks merge forever (GitHub community discussion #44490,
  <https://github.com/orgs/community/discussions/44490>). Always gate at job level, or use a final
  aggregator job that succeeds only when every job that *ran* passed.
- `actions/labeler` (<https://github.com/actions/labeler>) applies `tier:*` / `area:*` labels from
  `.github/labeler.yml` globs, so humans and policy bots can read the classification on the PR.

**Conditional required checks (the floor).**
- GitHub **repository rulesets** carry "require status checks" and "require a pull request before
  merging" (<https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets>).
  Keep a tiny set of *always-required* checks (the PR floor) that run on every PR, and make the
  heavy jobs self-skip-to-success in the fast lane via the paths-filter outputs — not by removing
  them from the required list per-PR, which GitHub cannot do.
- An **aggregator / gatekeeper** job (e.g. `poseidon/wait-for-status-checks`,
  <https://github.com/poseidon/wait-for-status-checks>, or a hand-rolled "all-green" job) is the
  single required check. It resolves to success when skipped jobs are legitimately skipped and to
  failure otherwise — the clean fix for the path-filter / required-check conflict.

**The always-on contract & schema gate.**
- `oasdiff` (<https://github.com/oasdiff/oasdiff>) via `oasdiff-action`
  (<https://github.com/oasdiff/oasdiff-action>): run `oasdiff breaking` base-spec vs PR-spec and
  fail on `ERR`. The *presence* of any `openapi.yaml` diff (from paths-filter) forces an engineer
  into the review regardless of tier; `oasdiff` then classifies whether it is breaking.
- Migrations: `squawk` (<https://squawkhq.com>, <https://github.com/sbdchd/squawk>) lints Postgres
  migrations for locking / downtime-prone patterns; Atlas `migrate lint`
  (<https://atlasgo.io/versioned/lint>) with `--git-base origin/main` checks only the migrations new
  to the branch and blocks risky patterns (dropping a column/table that breaks older app versions).
  Liquibase Quality Checks (<https://docs.liquibase.com/quality-checks>) cover the changelog world.
  Any migration-path diff is a contract change for Hyrum's-Law reasons (VII) and routes to the full
  lane — detection is path-based, the verdict is the linter's.
- `CODEOWNERS` (<https://docs.github.com/en/repositories/managing-your-repositories-settings-and-features/customizing-your-repository/about-code-owners>)
  with "require review from Code Owners" makes the engineer review on `openapi.yaml` / `migrations/`
  structurally unskippable: ownership of those paths *is* the gate.

**Policy bots (rules humans would otherwise repeat in review).**
- Danger JS (<https://danger.systems/js/>) runs a `dangerfile.ts` after CI to enforce conventions:
  "a `src/` change with no test fails", "a `tier:fast` label on a PR that touches `openapi.yaml` is
  a contradiction — relabel to full", "PR over N lines must be sliced". This is VI's "when an agent
  keeps catching the same problem, that finding becomes a rule" applied to the routing itself.

**Merge automation (fast lane throughput).**
- GitHub native **merge queue** (ruleset rule above) serializes merges and re-tests against the
  latest base so the fast lane never breaks trunk. Build-concurrency caps bound CI spend.
- Third-party queues add risk-aware routing: Mergify (<https://mergify.com>) merges on
  rule/label/path conditions and batches PRs; Graphite merge queue
  (<https://graphite.dev/docs/merge-queue-faq>) is stack-aware with hot-fix prioritization; Kodiak
  (<https://github.com/chdsbd/kodiak>) and Trunk (<https://docs.trunk.io/merge-queue>) auto-merge
  when a configured label + green checks are present. Scope auto-merge to the fast lane via the
  `tier:fast` label; the full lane never auto-merges — it waits on a human gate.

## Tooling options

| Tool | What it does | When to pick it |
| --- | --- | --- |
| [dorny/paths-filter](https://github.com/dorny/paths-filter) | Per-path change booleans at job level (GH Actions) | The classifier; any monorepo routing where skipped jobs must not wedge required checks |
| [actions/labeler](https://github.com/actions/labeler) | Auto-applies labels from path globs | Make the tier/area visible to humans, policy bots, and merge queues |
| GitHub [rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) | Required checks, required PR, merge-queue, deploy gating | The PR-floor and merge-queue backbone; GitHub-hosted repos |
| [poseidon/wait-for-status-checks](https://github.com/poseidon/wait-for-status-checks) | Aggregator that resolves skipped-vs-failed correctly | The single always-required "all-green" check that fixes path-filter conflicts |
| [oasdiff](https://github.com/oasdiff/oasdiff) + [oasdiff-action](https://github.com/oasdiff/oasdiff-action) | OpenAPI diff, `breaking --fail-on ERR` | Always-on contract gate; pairs with the repo's `tooling/openapi-*` scaffolds (IV) |
| [Squawk](https://squawkhq.com) | Postgres migration linter (locks/downtime) | Schema gate for raw-SQL migrations; GitHub App for PR comments |
| [Atlas `migrate lint`](https://atlasgo.io/versioned/lint) | Static lint of new migrations vs base | Schema gate for Atlas-managed dirs; pairs with `tooling/sqlmigrations-*` |
| [Liquibase Quality Checks](https://docs.liquibase.com/quality-checks) | Policy checks over changelogs | Schema gate in Liquibase/JVM shops |
| [CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositories-settings-and-features/customizing-your-repository/about-code-owners) | Path-scoped mandatory reviewers | Make the engineer review on contract/schema paths structurally unskippable |
| [Danger JS](https://danger.systems/js/) | Rule engine over PR metadata/diff after CI | Encode routing/convention rules humans repeat in review |
| GitHub merge queue / [Mergify](https://mergify.com) / [Graphite](https://graphite.dev/docs/merge-queue-faq) / [Kodiak](https://github.com/chdsbd/kodiak) / [Trunk](https://docs.trunk.io/merge-queue) | Serialized, optionally label/risk-aware auto-merge | Fast-lane throughput without breaking trunk; scope auto-merge to `tier:fast` |

## Anti-patterns

- **Model in the control path.** Letting an LLM decide the tier makes "why did this merge on the
  fast lane?" unanswerable. Classification is a pure function of paths/labels/spec-diff — mirror the
  repo's rule that the orchestrator scheduler is pure, not an LLM.
- **Fast lane that skips the PR or the checks.** Tiering removes *ceremony above the floor*, never
  the floor. A docs PR still gets a PR and green checks.
- **Required-check whack-a-mole.** Removing a heavy check from the required list "just for this PR"
  silently drops coverage. Keep the required set constant; make skipped jobs resolve to success
  through an aggregator instead.
- **Contract/schema change smuggled into the fast lane.** The most dangerous diffs look like
  one-liners. Detection must be path-based (`openapi.yaml`, `migrations/`), not reviewer judgment,
  and must *override* any tier label.
- **Big-bang spec (violates Gall + Box).** A 40-task epic merged as one PR cannot be released or
  measured incrementally. Slice it; `TASK_BREAKDOWN` exists for this, and each child ships on its
  own.
- **Auto-merge with no revert path.** Fast-lane velocity is only safe behind VIII's automated
  rollback + flags. Auto-merge without a one-click revert is a liability.
- **Tier that never promotes.** A PR that grows past its tier (new endpoint appears mid-review)
  must re-classify up, not coast on its original label. Danger JS should fail the contradiction.

## Signals it's working

- **Lead-time bimodality.** Fast-lane PRs merge in minutes; full-lane changes take the panel + gate
  time. One flat distribution means tiers aren't actually routing.
- **Zero contract/schema changes merged without an engineer review** — audited from CODEOWNERS /
  `oasdiff` / migration-lint logs, not asserted.
- **Fast-lane escaped-defect rate stays at the floor's level.** If trivial changes start causing
  incidents, the fast lane is too wide — tighten the classifier (ties to XII and VII's "a gate
  loses autonomy after an escaped defect").
- **Trunk green on main** despite high merge frequency — the merge queue is doing its job.
- **Average PR size trends down** and slices-per-epic trends up (Gall): small, measured increments.
- **Spec-amendment rate is healthy, not zero** (Box): a spec that is never amended is being
  worshipped, not used.
- **Required-check false-block rate ≈ 0** — no PRs stuck `pending` on skipped required checks.

## Related

- **VI — Checks run first, review agents second.** The per-tier check set *is* VI's deterministic
  layer; tiering decides how much of the panel runs, never whether checks run. See the host repo's
  `review-loop-policy.ts` guards and `.aeos/rubrics/`.
- **VII — Humans hold three gates.** The always-on contract/schema gate here is VII's second gate
  made mechanical; the release gate is VII's third. Tiering tunes autonomy *above* the three-gate
  floor, exactly as VII allows ("above that floor, engineering leadership decides where humans sign
  off").
- **IV — Generators build the scaffold.** The contract/schema detectors reuse the repo's
  `tooling/openapi-*` (oasdiff over a generated client) and `tooling/sqlmigrations-*` (migration
  lint) scaffolds.
- **VIII — Deploy continuously, release deliberately.** Fast-lane auto-merge is only safe behind
  VIII's flags + rollback.
- **XII — The system learns from measurement.** Lead-time, escaped-defect-by-tier, and override
  rate are the data that re-tunes the classifier.

## Sources

- GitHub rulesets — available rules (status checks, required PR, merge queue, deploy gates):
  <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets>
- GitHub CODEOWNERS: <https://docs.github.com/en/repositories/managing-your-repositories-settings-and-features/customizing-your-repository/about-code-owners>
- `dorny/paths-filter`: <https://github.com/dorny/paths-filter>
- Path-filter vs required-checks conflict (community discussion #44490):
  <https://github.com/orgs/community/discussions/44490>
- `actions/labeler`: <https://github.com/actions/labeler>
- `poseidon/wait-for-status-checks`: <https://github.com/poseidon/wait-for-status-checks>
- oasdiff: <https://github.com/oasdiff/oasdiff> · oasdiff-action: <https://github.com/oasdiff/oasdiff-action>
- Squawk: <https://squawkhq.com> · <https://github.com/sbdchd/squawk>
- Atlas `migrate lint`: <https://atlasgo.io/versioned/lint>
- Liquibase Quality Checks: <https://docs.liquibase.com/quality-checks>
- Danger JS: <https://danger.systems/js/>
- Mergify: <https://mergify.com> · Graphite merge queue: <https://graphite.dev/docs/merge-queue-faq>
  · Kodiak: <https://github.com/chdsbd/kodiak> · Trunk merge queue: <https://docs.trunk.io/merge-queue>
- Gall's Law & All Models Are Wrong (definitions): <https://github.com/dwmkerr/hacker-laws#galls-law>
  · <https://github.com/dwmkerr/hacker-laws#all-models-are-wrong-george-boxs-law>
