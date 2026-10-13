# Principle VII — Humans hold three gates

> **Principle.** The specification, any change to the API contract or database schema, and the release
> always have a human. Above that floor, engineering leadership decides where humans sign off, and a
> gate earns autonomy from evaluation data and loses it with an escaped defect.
>
> **Law.** Hyrum's Law — every observable behaviour of a contract or schema will be depended on by
> someone, so it outlives the change that introduced it and a human signs each such change.
> Amdahl's Law — human gates are the serial fraction of the pipeline and set its pace, so every gate
> that safely earns autonomy shortens the whole critical path.

AEOS already has the mechanism this principle needs. Pipeline columns are explicit human approval gates
(`WORKING → IN_REVIEW → SIGNED_OFF`), and a gate can "earn autonomy from evaluation data."

This document maps that principle onto the Git-host, CI, and codegen tooling of the repositories AEOS
drives. The point: make the three mandatory gates a merge-blocking control, not a convention an agent can
talk its way past. Each gate is keyed to the exact paths that carry contract and schema risk.

## What it demands, operationally

1. **Three gates are non-negotiable and path-defined.** A human must approve (a) the specification,
   (b) any change to the API contract or DB schema, and (c) the release. Each maps to concrete repo
   paths or events: spec docs (`docs/spec/**`, `*.prd.md`); the contract (`openapi/**`, `**/*.proto`,
   `schema.graphql`); the schema (`migrations/**`, `db/schema.sql`, `atlas.hcl`); the release (a tag
   push or a deploy job).
2. **The host enforces the gate, not the agent.** CODEOWNERS plus a required-review rule plus a branch
   ruleset make approval a merge precondition. An AEOS agent on a bot token cannot self-approve a diff
   that touches a gated path. The ruleset rejects the merge.
3. **Risk is *detected*, not declared.** A gate fires on one of two signals: the PR touches a gated path
   (a cheap glob trigger), or a diff tool flags a breaking contract/schema change (`oasdiff`,
   `buf breaking`, `atlas migrate lint`). Neither relies on the author remembering to ask.
4. **Everything else flows.** Amdahl's Law: the serial human fraction caps throughput. So gates are
   *scoped*. A PR that touches only non-gated paths and passes checks may auto-merge. Humans spend their
   serial time only on diffs that carry irreversible, depended-upon risk.
5. **Autonomy is earned and revocable.** A gate's required-approval count is a function of its evaluation
   record. Sustained clean passes can downgrade a gate from "human required" to "auto-merge on green". An
   escaped defect traced to that gate immediately restores the human requirement. This is AEOS's own
   gate-earns-autonomy model, applied to the downstream repo.

## Reference architecture

```
                          ┌─────────────────────────────────────────────┐
  PR opened by human      │  PATH + DIFF CLASSIFIER (CI, required check)  │
  or AEOS agent  ───────▶ │  • changed-files globs → gated? (spec/        │
                          │    contract/schema/release paths)             │
                          │  • oasdiff / buf breaking / atlas lint        │
                          │    → breaking change?                         │
                          └───────────────┬───────────────────────────────┘
                                          │
                 ┌────────────────────────┴───────────────────────┐
                 │ gated path OR breaking change                   │ neither
                 ▼                                                 ▼
   ┌──────────────────────────────┐              ┌──────────────────────────────┐
   │ GATE 1/2: spec or             │              │ Non-gated change              │
   │ contract/schema               │              │ • checks + evals green        │
   │ • CODEOWNERS owns the path    │              │ • auto-merge / merge queue    │
   │ • required review from        │              │   (no human in the loop)      │
   │   @spec-owners / @api-stewards │              └──────────────────────────────┘
   │ • ruleset blocks merge        │
   └───────────────┬──────────────┘
                   │ merged to main
                   ▼
   ┌──────────────────────────────────────────────┐
   │ GATE 3: release                               │
   │ • deploy job → protected environment          │
   │ • required reviewer approves the deployment    │
   │   (manual approval), OR auto-deploy if the     │
   │   release gate has earned autonomy            │
   └──────────────────────────────────────────────┘
```

The three gates are three distinct controls: two are **merge-time** (CODEOWNERS + required reviews +
ruleset, scoped to spec and contract/schema paths), one is **deploy-time** (a protected environment
with required reviewers). The classifier that routes a PR to a gate is itself a required status check,
so a PR cannot merge while classification is pending or failing.

## CI / automation

- **Path + diff classifier (required check).** One job runs on every PR. It computes changed files and
  sets a `gated` output when any path matches the gated globs. In parallel it runs the contract/schema
  diff tools against the merge base; a breaking result also sets `gated`. It posts a sticky PR comment
  explaining *why* a gate fired — which path, which breaking rule — so the human review has the diff in
  front of it. This is the Amdahl lever: it keeps the serial human step off the 90%+ of PRs that touch
  nothing gated.
- **Contract gate detectors.** For REST/OpenAPI: `oasdiff breaking --fail-on ERR` (optionally
  `--format githubactions`) exits non-zero on any of its 100+ breaking-change classes. `openapi-changes`
  runs a comparable diff across Git revisions in-PR and emits a visual changelog alongside the verdict. `Spectral`
  (`extends: spectral:oas`) enforces style/governance rules that are not strictly breaking. For
  gRPC/protobuf: `bufbuild/buf-action` runs `buf breaking` against a baseline Git ref and comments inline
  on offending `.proto` lines.
- **Schema gate detector.** `ariga/atlas-action/migrate/lint` runs on any PR that touches the migration
  directory. It simulates the migration against a dev database, then fails and comments on destructive or
  lock-inducing changes. The cheaper floor is a plain path trigger on `migrations/**` that forces the DBA
  gate regardless of lint verdict — a migration is a schema change by definition.
- **Release gate.** The deploy job declares `environment: production`. GitHub Actions blocks the job
  until the environment's **required reviewers** approve — a manual-approval gate, with secrets sealed
  until approval. GitLab's equivalent is a manual job plus a protected environment with deployment
  approvals. `prevent self review` stops the deploy's triggerer from approving it.
- **Earned autonomy, mechanically.** Gate state lives in config, not habit. A gate's required-approval
  count is driven by its eval record (pass/escape history). When a gate is autonomous, a passing PR goes
  through **auto-merge** / the **merge queue** (`gh pr merge --auto`, or GitHub's native merge queue) the
  moment required checks are green — no reviewer. An escaped-defect postmortem flips the ruleset back to
  `required_approving_review_count: 1+` and re-adds the CODEOWNERS entry. Because rulesets are
  API-managed, that toggle is a reviewable config PR, not a console click.

## Tooling options

| Tool | What it does | When to pick it |
| --- | --- | --- |
| [GitHub repository rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets) + [required reviewer rule](https://github.blog/changelog/2026-02-17-required-reviewer-rule-is-now-generally-available/) | Branch/tag protection as code; the required-reviewer rule targets specific files/folders by pattern (with `!` negation) and demands N approvals from named teams | GitHub host; you want path-scoped gates layered over CODEOWNERS and managed via API |
| [GitHub CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners) | Maps path globs to owning teams; "require review from Code Owners" makes their approval a merge precondition | Every GitHub repo — the baseline ownership map; put the spec/contract/schema paths here and give CODEOWNERS itself an owner |
| [GitLab Code Owners](https://docs.gitlab.com/ee/user/project/codeowners/) + protected branches | Path-scoped required approvals; `[section][n]` syntax requires n approvals; approval rules cover non-path reviewer groups | GitLab Premium/Ultimate host; target branch must be protected and Code Owner approval enabled |
| [oasdiff](https://github.com/Tufin/oasdiff) | OpenAPI breaking-change detection; `--fail-on ERR`, `--format githubactions`/`junit`/`json` | REST APIs; a fast CLI gate that forces the contract review only on a real breaking diff |
| [`openapi-changes`](https://pb33f.io/openapi-changes/) | OpenAPI diff across Git revisions; breaking-change detection with an HTML/markdown/JSON changelog | REST APIs; a PR gate that also shows reviewers a visual changelog of what changed |
| [Spectral](https://github.com/stoplightio/spectral) | Rule-based OpenAPI/AsyncAPI/Arazzo linter (`given`/`then` JSONPath rules; `extends: spectral:oas`) | Enforcing API style/governance (naming, versioning, security) beyond strict breakage |
| [buf breaking](https://buf.build/docs/breaking/usage/) via [buf-action](https://github.com/bufbuild/buf-action) | Protobuf breaking-change detection against a baseline ref; inline `.proto` comments | gRPC/protobuf contracts; set the baseline with `breaking_against` / a remote repo URL |
| [Atlas `migrate lint`](https://atlasgo.io/versioned/lint) via [atlas-action](https://github.com/ariga/atlas-action) | Simulates migrations on a dev DB; flags destructive ops, table rewrites, locks; PR comment | SQL schema gate; pairs with a `migrations/**` path trigger as the floor |
| [GitHub Actions environments](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) | Protected environment with required reviewers / wait timer; secrets sealed until approval | Release gate on GitHub; the manual-approval deploy step |
| [GitLab protected environments + deploy approvals](https://docs.gitlab.com/ee/ci/environments/) | Manual deploy job gated by environment approvals | Release gate on GitLab |
| [GitHub merge queue](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/merging-a-pull-request-with-a-merge-queue) / `gh pr merge --auto` | Auto-merges a PR once required checks + approvals are met | The autonomy path for non-gated or autonomy-earned PRs — the Amdahl speedup |

## Anti-patterns

- **Reviewing everything.** A blanket "two approvals on every PR" rule makes the human fraction ~100%
  serial (Amdahl) and trains reviewers to rubber-stamp. Scope the gate to gated paths; let the rest
  auto-merge on green.
- **Gate by convention.** A CONTRIBUTING note saying "ping the DBA for migrations" is not a gate. If a
  bot token can merge `migrations/**` without a required review, there is no gate. Enforce it in the
  ruleset.
- **CODEOWNERS with no required-review rule.** CODEOWNERS alone only *requests* review; without "require
  review from Code Owners" (or a required-reviewer ruleset) on a protected branch, approval is optional.
- **Unowned CODEOWNERS file.** If the CODEOWNERS/ruleset config is itself not gated, an agent can delete
  the gate in the same PR that makes the risky change. Own the gate's own files.
- **Declared-not-detected risk.** Relying on a PR label or title keyword to mark "contract change" lets
  a rephrase slip a breaking diff through. Run `oasdiff`/`buf`/`atlas` and key the gate off the tool.
- **Treating a release as a merge.** Merging to `main` is not shipping. The release gate is a separate
  deploy-time control (protected environment), or an escaped defect reaches production ungated.
- **Autonomy that never revokes.** Earning autonomy without an escaped-defect trigger that restores the
  gate turns "progressive autonomy" into "no gate." The loss condition is the safety property, per the
  principle.
- **Hyrum's Law blind spot.** Treating an "internal-only" or "undocumented" field as free to change.
  Every observable behaviour is depended on; if it's on the wire or in the schema, it's gated.

## Signals it's working

- Merge-blocking gates fire on 100% of PRs that touch gated paths, and on 0% of PRs that don't — the
  classifier's false-negative rate on contract/schema diffs is zero in audits.
- Median time-to-merge for non-gated PRs is dominated by CI, not by waiting for a human (Amdahl: the
  serial fraction is small and shrinking).
- Every production incident traced to a contract/schema change maps back to a specific gate, and the
  postmortem can show the gate either fired (human approved a bad change — a review-quality problem) or
  failed to fire (a classifier gap — a tooling bug). "It merged with no gate at all" never appears.
- The set of autonomous gates grows over quarters and contracts after an escape — the autonomy ledger
  moves in both directions, driven by eval data.
- No `main`-branch bypass merges by bot tokens on gated paths in the audit log.

## Related

- **Principle IV (generated code is generated, not hand-written)** — the `tooling/openapi-*` and
  `tooling/sqlmigrations-*` scaffolds in this repo. Those enforce that the contract and schema are the
  single human-owned source and the typed layers are generated; this principle puts the *human gate* on
  changes to exactly those source artifacts. The two compose: Principle IV says "humans own the
  contract/schema, agents own the generated types"; Principle VII says "and a human signs every change
  to what they own."
- **AEOS pipeline gates** — the repo's own `WORKING → IN_REVIEW → SIGNED_OFF` approval gates and the
  "gate earns autonomy from evaluation data" model (`README.md`, state-machine table). This document is
  that model projected onto the Git host of the repository under development.
- Breaking-change diff tools double as AEOS reviewer-rubric inputs: a `CODE_REVIEW` column reviewing a
  PR that touches `openapi/**` should run `oasdiff` and escalate (not auto-pass) on a breaking verdict.

## Sources

- GitHub — About Code Owners (CODEOWNERS): <https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners>
- GitHub Changelog — Required reviewer rule now GA (path-scoped, `!` negation): <https://github.blog/changelog/2026-02-17-required-reviewer-rule-is-now-generally-available/>
- GitHub — Using environments for deployment (required reviewers, sealed secrets): <https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment>
- GitHub — Merging a pull request with a merge queue: <https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/merging-a-pull-request-with-a-merge-queue>
- GitLab — Code Owners (path-scoped approvals, protected branches, `[section][n]`): <https://docs.gitlab.com/ee/user/project/codeowners/>
- oasdiff (OpenAPI breaking-change detection, `--fail-on`, output formats): <https://github.com/Tufin/oasdiff>
- openapi-changes (in-PR OpenAPI breaking-change detection + visual changelog): <https://pb33f.io/openapi-changes/>
- Spectral (OpenAPI/AsyncAPI governance linter): <https://github.com/stoplightio/spectral>
- buf breaking — usage: <https://buf.build/docs/breaking/usage/> ; buf-action: <https://github.com/bufbuild/buf-action>
- Atlas — Verifying migration safety (`migrate lint`): <https://atlasgo.io/versioned/lint> ; atlas-action: <https://github.com/ariga/atlas-action>
- Atlas — Preventing breaking changes (rename/destructive examples): <https://atlasgo.io/blog/2023/03/31/preventing-breaking-changes>
