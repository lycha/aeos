# Principle X — The engineer owns the blueprint

> **Principle.** The Product Engineering Architect is an engineer accountable for the specification, the contracts, the invariants and the data model, and agents build to them. The Product Manager owns the strategy, the problem and the priority. The two meet at the specification: the PM states *what problem, for whom, and why now*; the architect states *what we will build and the shape it must hold*. Everything downstream — agents, reviewers, gates — builds to that human-owned blueprint and is not permitted to redefine it.
> **Law.** Conway's Law — a system's structure mirrors the communication structure of the organisation that builds it, so AEOS's columns, reviewers, and the PM/architect split are drawn on purpose, not left to emerge.

This principle is less a CI script than an org design made executable. The deliverable is not a passing build; it is a set of ownership boundaries that a tool enforces so they cannot quietly erode. Principle III (the spec is the contract) and Principle IV (generators build the scaffold) define *what* the blueprint is; this principle fixes *who owns it* and makes that ownership mechanical.

## What it demands, operationally

1. **A single named Accountable for every blueprint artifact.** Spec, API contract, DB schema, domain invariant, pipeline definition — each path resolves to the architect role, not a committee. One Accountable per artifact (the RACI rule: exactly one "A" per row, never zero or two).
2. **The PM/architect boundary is a real seam, not a vibe.** The PM owns the problem statement, prioritisation, and acceptance of outcomes; the architect owns the technical specification and its invariants. Neither edits the other's surface unilaterally. The spec is the documented hand-off between them.
3. **Ownership is encoded where the work happens.** Not in a wiki a RACI chart nobody reads — in `CODEOWNERS`, in branch rulesets, in path-scoped review gates. A change to a blueprint path *cannot merge* without the owning role's approval.
4. **Agents build to the blueprint; they never author it.** AEOS worker agents implement against `.aeos/column-specs`, `.aeos/agents`, `.aeos/rubrics`, `.aeos/CONSTRAINTS.md`, and the `src/domain/` invariants. Those are human-owned inputs. An agent proposing a change to them is a proposal a human must accept, routed through the same gate as any other blueprint change.
5. **The org chart is designed from the target architecture, not the reverse.** AEOS's stage sequence (PM-owned `PRODUCT_SCOPING` → architect-owned `TECH_SPEC`/`TASK_BREAKDOWN` → review → gate) is a deliberate inverse-Conway maneuver: the pipeline's shape *is* the intended division of labour.

## Reference architecture

**The two roles and their homes.** Strategy and specification live in different systems on purpose, because conflating them is how priority creep rewrites contracts.

- **PM surface — the backlog.** Problem, strategy, priority, and outcome acceptance live in a product-management tool (Linear, Jira, or Productboard). This is where "what problem, for whom, why now" is argued and ranked. It is *not* under `CODEOWNERS` because it is not the blueprint; it is the demand signal that feeds the blueprint. In AEOS terms this is the `BACKLOG` and `PRODUCT_SCOPING` columns of an epic — the PM's artifact is the scoped problem, not the design.
- **Architect surface — the spec repo.** The specification, contracts, invariants and data model live in version control, reviewed as code. In AEOS this is concrete and already present in the tree:
  - `.aeos/column-specs/*.yaml` — the pipeline blueprint: which worker/reviewer agent each column uses, execution mode, validation rules. *This is the org chart as data.*
  - `.aeos/agents/*.yaml` — agent prompts and default executor/model.
  - `.aeos/rubrics/` — the reviewer rubrics (the standards a stage is held to).
  - `.aeos/CONSTRAINTS.md` — project architecture/style/security rules injected into every agent's context.
  - `src/domain/` — the invariants in code: `state-machine.ts`, `review-loop-policy.ts`, `orchestrator-policy.ts`, `verdict-parser.ts`, `output-validation.ts`, and the `model/` specs. These are the load-bearing rules the whole system builds to.
  - `templates/` — the starter blueprint `project init` scaffolds into new projects; a change here is a change to every future project's default spec.
  - `tooling/openapi-*/` and `tooling/sqlmigrations-*/` — the contract and data-model scaffolds from Principles III/IV.

**The who-owns-what matrix, encoded.** A RACI expressed in prose rots; expressed in `CODEOWNERS` it is enforced on every PR. The intent behind the file is this matrix — one Accountable per row, and the backlog kept deliberately outside the spec repo:

| Artifact | PM | Architect | Agents | Reviewer agent / human gate |
|---|---|---|---|---|
| Problem statement, priority (backlog) | **A/R** | C | — | I |
| `PRODUCT_SCOPING` artifact | **A/R** | C | R (drafts) | human gate approves |
| `TECH_SPEC` artifact, contracts | C | **A/R** | R (drafts to the blueprint) | reviewer rubric + human gate |
| `src/domain/` invariants | I | **A** | — (may propose only) | required code-owner review |
| `.aeos/column-specs`, `agents`, `rubrics`, `CONSTRAINTS.md` | C | **A** | — (may propose only) | required code-owner review |
| Data model / migrations | I | **A** | R (writes to the model) | required code-owner review |
| Implementation under a `TASK` | I | C | **R** | reviewer agent + human gate |

(R = Responsible, A = Accountable, C = Consulted, I = Informed.) The architect is Accountable for every blueprint row; agents are Responsible only for building to it, never Accountable for the row they build against.

**The meeting point.** The spec is the interface between the two roles, and it is bidirectional. The PM cannot merge a priority change that silently alters an invariant; the architect cannot merge a spec change that redefines the accepted problem. When they conflict, the resolution is an explicit decision record (below), not a quiet edit by whoever touched the file last. In AEOS the `TECH_SPEC` artifact is literally that meeting point: it is authored against a PM-accepted scope and is itself gated.

**Conway-aware pipeline design.** AEOS makes the inverse-Conway maneuver literal: the architecture you want is drawn first (the column sequence and its invariants), then the "teams" (agents and reviewers) are assigned to match. Each column is a bounded context with one worker, one reviewer, and one human gate — a fracture plane, in Team Topologies terms. Because the scheduler is a pure function and not an LLM (`orchestrator-policy.ts`), "why did this advance?" is answerable from the transition log; the communication structure is explicit and auditable rather than emergent. Fowler's caution applies: the maneuver is not all-powerful, so the split is revisited when a stage repeatedly escalates — that is a signal the fracture plane is in the wrong place.

**Decision records as the change protocol.** A blueprint change is a decision, and decisions get recorded, not just diffed. Two complementary artifacts:

- **RFC / RFD before the change** — a Request for Comments / Request for Discussion proposes a non-trivial change to a contract or invariant and collects review *before* implementation (the model Rust's RFC repo and Oxide's RFD process use: iterate in a branch, discuss on the PR, publish once accepted).
- **ADR after the change** — an Architecture Decision Record (Nygard/MADR format: context, decision, consequences, status) captures the committed decision for the long term, so a future reader learns *why* an invariant exists before an agent is tempted to "simplify" it away.

In this repo, the existing `tooling/*/` research notes and scaffolds already play the RFC/ADR role for the contract-generation decisions; this principle generalises that habit to every blueprint seam.

## CI / automation

Ownership is worthless if it is advisory. Encode it so the merge is blocked, not merely annotated.

**`CODEOWNERS` — the machine-readable RACI.** Map every blueprint path to the architect role. Order matters (last match wins), so put the broad rule first and the protected specifics last, and make the architect own `CODEOWNERS` itself so the mapping cannot be edited around.

```CODEOWNERS
# Default: anything not otherwise owned
*                                   @aeos/maintainers

# The blueprint — architect is Accountable
/src/domain/                        @aeos/architect
/.aeos/column-specs/                @aeos/architect
/.aeos/agents/                      @aeos/architect
/.aeos/rubrics/                     @aeos/architect
/.aeos/CONSTRAINTS.md               @aeos/architect
/templates/                         @aeos/architect
/tooling/openapi-**/openapi.yaml    @aeos/architect
/tooling/sqlmigrations-**/          @aeos/architect
/src/infrastructure/persistence/**/migrations*  @aeos/architect

# The ownership map itself is owned
/.github/CODEOWNERS                 @aeos/architect

# PM-owned surfaces (if any live in-repo, e.g. scoping templates)
/docs/product/                      @aeos/product
```

**Branch rulesets make it blocking.** A `CODEOWNERS` file without an enforcing rule *requests* reviewers but does not block merges. Pair it with a repository ruleset (or classic branch protection) that turns on **Require review from Code Owners** on the default branch. Rulesets are preferable to classic protection here: multiple can layer on one branch, they are visible to anyone with read access (the policy is transparent), they can be toggled without deletion, and the most-restrictive rule wins when they overlap. Add required status checks so the Principle III/IV contract-conformance jobs (`typecheck`, the openapi/sqlmigrations generators) must be green — a spec change that breaks a generated contract cannot merge even with owner approval.

**Guard the invariants in test, not just in review.** Human review catches intent; tests catch regressions. `review-loop-policy.ts` is "the most heavily tested logic in the repo" for exactly this reason. Keep the rule: a change to a domain invariant must come with the test that pins its new behaviour, and `template-source.test.ts` must still prove every scaffolded column spec loads and resolves its agents and rubrics — so a blueprint edit that would break a fresh project fails CI, not a user's first `ticket run`.

**Keep the layering boundary a gate.** The hexagonal direction (`cli → application → domain ← infrastructure`) is itself a Conway seam. An ESLint rule that forbids Node/npm imports in `domain/` is the automated owner of that boundary; it is part of the blueprint's enforcement, not a style preference.

**Agent proposals route through the gate.** Because `TASK_BREAKDOWN` is agentic and agents can create tickets, keep the invariant that agents may *propose* blueprint changes (a PR, an RFC) but the merge requires the code-owner approval above. The human approval gate at each column (Principle VII) is the runtime half of this; `CODEOWNERS` is the source-control half.

## Tooling options

| Tool | What it does | When to pick it |
|---|---|---|
| [GitHub `CODEOWNERS`](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners) | Maps path globs to owning users/teams; auto-requests their review on matching PRs | Always — this is the canonical encoding of the RACI for blueprint paths |
| [GitHub repository rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets) | Layered, transparent branch rules: require code-owner review, required checks, signed commits, block force-push | When you want enforcement that is visible, stackable, and toggleable (preferred over classic branch protection) |
| [Linear](https://linear.app/) / [Jira](https://www.atlassian.com/software/jira) | Backlog, prioritisation, cycle planning | PM surface for strategy/problem/priority — the demand signal, kept *out* of the spec repo |
| [Productboard](https://www.productboard.com/) | Opportunity/feature prioritisation, outcome tracking | When the PM needs to tie priority to customer insight before it becomes a scoped problem |
| [Backstage](https://backstage.io/docs/features/software-catalog/descriptor-format) software catalog (`spec.owner`) / [Roadie](https://roadie.io/docs/details/ownership) | Service/entity ownership registry; can derive from `CODEOWNERS` | When ownership must be queryable across many services, not just enforced per-repo |
| [MADR](https://adr.github.io/madr/) / [ADR](https://adr.github.io/) | Lightweight, versioned decision records (context, decision, consequences) | To record *why* an invariant or contract exists, so it survives agent "simplification" |
| [Rust RFC](https://github.com/rust-lang/rfcs) / [Oxide RFD](https://oxide.computer/blog/rfd-1-requests-for-discussion) process | Structured proposal-before-change, discussed on a PR, published once accepted | For non-trivial blueprint changes where review must precede implementation |

Keep the tool list deliberately light. The weight is in the boundaries and who owns them, not in the number of products; a single `CODEOWNERS` file plus one ruleset enforces more than any dashboard.

## Anti-patterns

- **The architect title without the accountability.** A person called "architect" who does not actually own (and gate) the spec paths. Ownership is the `CODEOWNERS` entry, not the business card.
- **PM editing the spec, or the architect reprioritising the backlog.** Each stepping over the seam collapses the meeting point and reintroduces the ambiguity the split existed to remove.
- **`CODEOWNERS` without an enforcing ruleset.** Reviewers get requested; nothing is blocked. The ownership is theatre.
- **Agents treated as authors of the blueprint.** Letting a worker agent silently rewrite a rubric, an invariant, or a column spec because it was "in the diff." Blueprint edits are human decisions routed through the gate, full stop.
- **Committee-owned invariants.** `@aeos/everyone` on `src/domain/`. Diffused accountability means no accountability; reviews stall and the invariant rots.
- **Emergent pipeline shape.** Adding a column or reviewer ad hoc without asking what organisational boundary it encodes. That is Conway's Law operating *against* you — the architecture drifts to mirror whoever happened to touch it.
- **Stale ownership map.** A `CODEOWNERS` that points at a disbanded team or a renamed path produces *no error* and silently stops requesting review. Treat the map as code: test that owned paths exist.
- **Blueprint changes with no decision record.** A one-line commit that flips an invariant. Six months later nobody — human or agent — knows why it was that way, so someone "fixes" it.

## Signals it's working

- Every file under `src/domain/`, `.aeos/column-specs`, `.aeos/agents`, `.aeos/rubrics`, `CONSTRAINTS.md`, and the contract/migration paths resolves to exactly one owning role in `CODEOWNERS`.
- A PR touching a blueprint path *cannot* merge without the architect role's approval, and a PR touching only PM surfaces does not spuriously request architect review.
- "Why does this invariant exist?" is answerable from an ADR/RFC, not folklore.
- Agents open PRs proposing spec changes; humans accept or reject them at the gate. No agent commit has ever silently redefined a contract or rubric.
- When a stage repeatedly escalates, the team asks "is this fracture plane wrong?" and moves the boundary deliberately — the org design is treated as revisable, not sacred.
- A new engineer can read `CODEOWNERS` plus the column specs and correctly state who owns what, with no tribal knowledge.

## Related

- **Principle III — The spec is the contract.** Defines *what* the blueprint is; this principle fixes *who owns it*.
- **Principle IV — Generators build the scaffold, agents write the logic.** The generated contracts (OpenAPI → types, SQL → migrations) are owned at the spec, enforced here via code-owner review on the source `openapi.yaml` and migration paths.
- **Principle VII — Human gates.** The runtime half of ownership: the per-column approval gate is where a human accepts an agent's work; `CODEOWNERS` is the source-control half of the same discipline.
- `README.md` — the state-machine table and executor matrix the blueprint is drawn on.
- `CLAUDE.md` — the hexagonal layering and the "specs/rubrics/agents are data, not code" rule this principle encodes as ownership.

## Sources

- Melvin Conway, *How Do Committees Invent?* — the original statement of Conway's Law: <https://www.melconway.com/Home/Committees_Paper.html>
- Martin Fowler, *Conway's Law* (bliki) — the law and the Inverse Conway Maneuver, with its limits: <https://martinfowler.com/bliki/ConwaysLaw.html>
- Skelton & Pais, *Team Topologies* — team-as-unit-of-delivery, bounded contexts, fracture planes, inverse Conway: <https://teamtopologies.com/>
- GitHub Docs — *About code owners* (`CODEOWNERS`, resolution order, owning the file itself): <https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners>
- GitHub Docs — *About rulesets* (layered, transparent, require code-owner review): <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets>
- Architecture Decision Records — index and template collection: <https://adr.github.io/> ; MADR format: <https://adr.github.io/madr/>
- Rust RFC process: <https://github.com/rust-lang/rfcs> — proposal-before-change discussed as a PR.
- Oxide — *RFD 1: Requests for Discussion*: <https://oxide.computer/blog/rfd-1-requests-for-discussion> ; live process: <https://rfd.shared.oxide.computer/rfd/0001>
- Backstage software catalog `spec.owner`: <https://backstage.io/docs/features/software-catalog/descriptor-format> ; Roadie, *Ownership in Backstage Entities* (CODEOWNERS as a fallback owner source): <https://roadie.io/docs/details/ownership>
- Product/backlog tools: Linear <https://linear.app/>, Jira <https://www.atlassian.com/software/jira>, Productboard <https://www.productboard.com/>
