# Principle III — Humans write the specification

> **Principle.** Gherkin scenarios, EARS requirements, actors, UML and ERD diagrams, the OpenAPI
> contract and the domain invariants are the most important engineering artefacts. A human drafts
> them; an agent reviews the draft (never the inverse), and an agent may draft only from decisions
> already in the decision log.
> **Law.** Tesler's Law (conservation of complexity) — total complexity is conserved: you can move
> it but not delete it, so the irreducible part belongs in the specification, owned by someone who
> understands the business.

The specification is the one artefact in the pipeline that a generator cannot produce and a reviewer
cannot recover once lost. Everything downstream — the scaffolds under [`../`](../) that turn an
OpenAPI contract and a SQL schema into code ([Principle IV](./PRINCIPLE-04-generators-build-the-scaffold.md)) —
is a *function of this input*. Garbage contract, garbage scaffold, at machine speed. This document is
about keeping the input human-owned, version-controlled, machine-lintable, and reviewed.

## What it demands, operationally

1. **The spec is source, not documentation.** It lives in the repo (`/spec`, or AEOS's `.aeos/`),
   changes only through a reviewed PR, and is the thing CI gates on — not a wiki, not a Confluence
   page, not a Figma comment thread that drifts from the code by Friday.
2. **Requirements are structured, not prose.** EARS templates for requirements; Gherkin
   `Given/When/Then` for behavioural scenarios. Both are readable by a domain owner *and* parseable
   by a tool, which is the whole point — they close the gap between "what the business meant" and
   "what the test asserts".
3. **Design-first for every contract.** The OpenAPI (sync) and AsyncAPI (events) documents are
   authored and linted *before* a line of handler code exists, and a breaking-change gate compares
   each PR against the shipped contract.
4. **Diagrams and ERDs are code.** Actors, context, containers, sequences and the data model are
   committed as text (DSL), rendered in CI, and reviewed as diffs — not exported as stale PNGs.
5. **Domain invariants are an explicit artefact.** The rules that must always hold ("an epic cannot
   leave `TASK_BREAKDOWN` until every child is `DONE`") are written down once, in one place, and
   referenced — not rediscovered from reading code.
6. **The decision log is the agent's only well.** An agent drafting any spec fragment draws solely
   from accepted ADRs. No ADR, no draft. This is what makes [Principle V](./PRINCIPLE-05-every-decision-is-traceable.md)
   (traceability) enforceable rather than aspirational.
7. **Invert the default loop.** The industry reflex is *agent drafts, human edits*. Here it is
   **human drafts, agent reviews** — because review catches what is wrong on the page, never what is
   missing from it (see Anti-patterns).

In AEOS terms, this principle owns the epic columns `PRODUCT_SCOPING` and `TECH_SPEC`. The worker in
those columns is the human; the AEOS reviewer agent and its rubric are the critic. The artefacts that
land are the Gherkin, EARS, OpenAPI/AsyncAPI, diagrams and `INVARIANTS.md` that every later column —
and every generator scaffold — consumes.

## Reference architecture

```
spec/
  requirements/
    *.feature              # Gherkin scenarios (Cucumber/Reqnroll/pytest-bdd syntax)
    *.ears.md              # EARS requirements, one id per SHALL
  contracts/
    openapi.yaml           # the HTTP contract — upstream input to the Principle IV generators
    asyncapi.yaml          # the event contract (if event-driven)
  model/
    context.dsl            # Structurizr DSL: C4 system context + containers + actors
    sequences/*.puml       # PlantUML / Mermaid sequence diagrams
    schema.dbml            # DBML: the ERD as code -> SQL for the sqlmigrations scaffolds
  INVARIANTS.md            # domain rules that must always hold, numbered and referenced
  decisions/
    NNNN-*.md              # MADR-format ADRs — the only source an agent may draft from
```

The dependency arrow runs **spec → generators → code**, never backward. `openapi.yaml` here is the
same file the [`openapi-typescript`](../openapi-typescript/README.md),
[`openapi-kotlin-spring`](../openapi-kotlin-spring/README.md) and
[`openapi-php-laravel`](../openapi-php-laravel/README.md) scaffolds treat as their human-owned input;
`schema.dbml` compiles to the SQL that [`sqlmigrations-typescript`](../sqlmigrations-typescript/README.md)
and [`sqlmigrations-kotlin-spring`](../sqlmigrations-kotlin-spring/README.md) turn into typed DB code.
Keep one canonical copy of each contract; a generator that reads a *second* copy is a drift bug
waiting to happen.

Authoring surfaces are a free choice per team — Stoplight Studio or Redocly for OpenAPI, AsyncAPI
Studio for events, dbdiagram.io for the ERD — but the committed artefact is always the plain-text DSL,
and the editor is disposable. The human-drafts/agent-reviews loop maps onto AEOS directly: the human
commits the draft, the reviewer agent runs its rubric against it, `decideNextAttempt` returns
advance / retry / escalate, and an unresolved gap escalates to a second human rather than being
coerced into a pass.

## CI / automation

Everything below runs in CI on the spec PR, *before* any generator or implementation job. This is the
gate that makes "humans write the spec" more than a slogan.

- **Lint the contracts.** Run [Spectral](https://github.com/stoplightio/spectral) (or the faster Go
  linter [`vacuum`](https://quobix.com/vacuum/)) against `openapi.yaml` with a project ruleset —
  naming, required descriptions, error-model consistency, no unversioned paths. Spectral also lints
  AsyncAPI; [Redocly CLI](https://redocly.com/docs/cli/guides/lint-asyncapi) validates AsyncAPI 3.0
  including protocol bindings.
- **Gate breaking changes.** Diff each PR's contract against `main` and fail on a breaking change
  with [`oasdiff`](https://github.com/oasdiff/oasdiff) (`--fail-on BREAKING`) or
  [Optic](https://github.com/opticdev/optic) (`optic diff --check`, which resolves versions from Git
  tags/branches and exits non-zero on a break). A breaking contract change must be a deliberate,
  reviewed act — never a silent side effect of an edit.
- **Validate Gherkin.** A dry run of the BDD runner (`cucumber --dry-run`, `reqnroll`/`pytest-bdd
  --collect-only`) proves every `.feature` parses and every step has a binding — catching a scenario
  that references a step nobody implemented.
- **Render diagrams-as-code.** Render `.puml` / `.mmd` / `.d2` / Structurizr `.dsl` to SVG in CI
  (`mmdc`, `plantuml`, `d2`, the Structurizr CLI `export`). A diagram that no longer renders is a
  broken artefact; failing the job keeps the committed model honest.
- **Compile the ERD.** `dbml2sql schema.dbml` must succeed and its output must match the SQL the
  migration scaffolds consume; optionally run [SchemaSpy](https://schemaspy.org/) against a throwaway
  DB built from that SQL to confirm the model is coherent.
- **Check ADR hygiene.** Assert that any PR touching a contract or invariant links an accepted ADR
  (status check over `spec/decisions/`), and lint ADR files with `adr-log` or `markdownlint`. This is
  the mechanical half of "agents draft only from the decision log".
- **Fail closed, escalate up.** In the AEOS pipeline this is an agentic review column: a missing or
  ambiguous requirement escalates (`SubState.ESCALATED`) to a human rather than being auto-resolved.
  A green spec gate is the precondition for the `TASK_BREAKDOWN` and implementation columns to run.

Run order mirrors the repo's own CI discipline (typecheck → lint → build → test): **lint contracts →
diff for breaks → validate scenarios → render model → compile ERD → ADR check**, then the
generators.

## Tooling options

| Tool | What it does | When to pick it |
|---|---|---|
| [EARS](https://alistairmavin.com/ears/) (Easy Approach to Requirements Syntax) | Five keyword templates (`WHILE/WHEN … the <system> SHALL …`) for unambiguous NL requirements; no tool needed | Default for requirements in any stack; lightweight, trains in an hour, parseable by a custom Spectral/regex check |
| [Cucumber](https://cucumber.io/) | Reference Gherkin runner; polyglot (JVM, Node, Ruby, Go, Python) | BDD scenarios on JVM/Node/Ruby/Go/Python teams |
| [Reqnroll](https://reqnroll.net/) | Open-source Gherkin runner for .NET; the maintained successor to SpecFlow (retired, EOL 2024-12-31) | .NET teams — do not start new work on SpecFlow |
| [pytest-bdd](https://pytest-bdd.readthedocs.io/) / [behave](https://behave.readthedocs.io/) | Gherkin for Python, over pytest or standalone | Python-first teams; pytest-bdd when you already live in pytest |
| [Spectral](https://github.com/stoplightio/spectral) | YAML/JSON rulesets (`given`/`then`) for OpenAPI 2/3, AsyncAPI, Arazzo | Programmable API governance you own and version; the de-facto standard |
| [`vacuum`](https://quobix.com/vacuum/) | Very fast Go OpenAPI/AsyncAPI linter, Spectral-ruleset compatible | Large specs or monorepos where Spectral's Node runtime is the bottleneck |
| [Redocly CLI](https://redocly.com/docs/cli/) | Lint + bundle + preview for OpenAPI and AsyncAPI 3.0 (bindings) | One CLI for both contract families, docs preview included |
| [Stoplight Studio](https://stoplight.io/) | Design-first visual OpenAPI editor backed by Spectral | Authors who want a form/visual surface but a plain-YAML artefact |
| [Optic](https://github.com/opticdev/optic) | Semantic contract diff + breaking-change `--check` from Git refs | PR-time breaking-change gate wired to branches/tags |
| [`oasdiff`](https://github.com/oasdiff/oasdiff) | OpenAPI diff + changelog + `--fail-on BREAKING` | CLI breaking-change gate with zero service dependency |
| [AsyncAPI CLI / Studio](https://www.asyncapi.com/tools) | Validate, lint and model event-driven contracts (3.0) | Any system where events are first-class, not an afterthought |
| [Structurizr DSL](https://docs.structurizr.com/dsl) | C4 model as code; one model, many consistent views | Architecture at scale where diagrams must not drift from each other |
| [PlantUML](https://plantuml.com/) | Text UML — sequence, class, state, component | Rich UML diagram types; one file per diagram |
| [Mermaid](https://mermaid.js.org/) | Markdown-embeddable diagrams; renders in GitHub/GitLab natively | Lowest-friction diagrams reviewers see inline in the PR |
| [D2](https://d2lang.com/) | Modern declarative diagram language, clean auto-layout | Broad diagram needs with simpler syntax than PlantUML |
| [DBML](https://dbml.dbdiagram.io/) / [dbdiagram.io](https://dbdiagram.io/) | Database-as-code markup; `dbml2sql` to DDL, round-trips with SQL | Authoring the ERD that feeds the `sqlmigrations-*` scaffolds |
| [SchemaSpy](https://schemaspy.org/) | Reverse-engineers an ERD + HTML docs from a live DB (JDBC) | Verifying the generated schema, or documenting a DB you inherited |
| [MADR](https://adr.github.io/madr/) | Markdown ADR template with a status lifecycle | The decision-log format; the source an agent may draft from |
| [Log4brains](https://github.com/thomvaill/log4brains) | ADR knowledge base + static site, MADR-based | Teams that want browsable, published ADRs from the repo |

## Anti-patterns

- **Agent drafts, human rubber-stamps.** The default everywhere, and backwards. An agent is a strong
  critic of a draft and a weak author of one, because *Cunningham's Law* — "the best way to get the
  right answer is to post the wrong one" — does not apply to absence. A reviewer, human or model,
  reacts to what is on the page; it cannot react to the requirement nobody wrote. The hardest,
  Tesler-irreducible complexity shows up precisely as a *missing* scenario, and only the business
  owner reliably notices it is missing. Keep the human on the keyboard for the first draft.
- **The spec as after-the-fact documentation.** An OpenAPI file generated *from* annotated handlers
  is a description of the code, not a contract the code must satisfy. Design-first or it is not a
  spec.
- **Diagrams as exported images.** A PNG in a wiki is stale the moment it is pasted. Commit the DSL,
  render in CI.
- **Invariants that live only in code.** A rule enforced by a scattered `if` in three services is
  not an artefact; it is three bugs waiting to disagree. Name it in `INVARIANTS.md`.
- **ADR-free drafting.** An agent that invents a decision instead of citing one breaks traceability
  silently. No ADR, no draft.
- **Breaking changes smuggled in.** Shipping a contract change with no diff gate turns every consumer
  into a surprised downstream failure. Gate it.
- **Spec drift across copies.** Two `openapi.yaml` files (one for docs, one for generation) will
  diverge. One canonical copy, referenced everywhere.

## Signals it's working

- A new engineer can read `spec/` and correctly predict the system's behaviour before reading code.
- The OpenAPI/AsyncAPI, ERD and diagrams in the repo are provably current — CI fails if they are not.
- Every breaking contract change in the Git history is paired with an accepted ADR explaining it.
- Reviewers comment on *missing* scenarios, not typos — the structure handles the typos.
- The Principle IV generators run clean off the committed contract, with no hand-patched output.
- When the business logic is hard, the hard part is visible in a Gherkin scenario or an invariant,
  not buried in a method nobody can find.

## Related

- [Principle IV — Generators build the scaffold](./PRINCIPLE-04-generators-build-the-scaffold.md): the
  scaffolds that consume `openapi.yaml` and `schema.dbml` from this spec.
- [Principle V — Every decision is traceable](./PRINCIPLE-05-every-decision-is-traceable.md): the ADR
  log this principle treats as the agent's only source.
- Scaffolds that take this spec as input:
  [`openapi-typescript`](../openapi-typescript/README.md),
  [`openapi-kotlin-spring`](../openapi-kotlin-spring/README.md),
  [`openapi-php-laravel`](../openapi-php-laravel/README.md),
  [`sqlmigrations-typescript`](../sqlmigrations-typescript/README.md),
  [`sqlmigrations-kotlin-spring`](../sqlmigrations-kotlin-spring/README.md).
- AEOS pipeline: `PRODUCT_SCOPING` and `TECH_SPEC` columns, `.aeos/CONSTRAINTS.md`, and the
  reviewer-rubric loop (`README.md`).

## Sources

- EARS — [Alistair Mavin, EARS](https://alistairmavin.com/ears/) ·
  [Wikipedia: Easy Approach to Requirements Syntax](https://en.wikipedia.org/wiki/Easy_Approach_to_Requirements_Syntax) ·
  [Jama Software: adopting EARS](https://www.jamasoftware.com/blog/webinar-recap-adopting-ears-notation-to-improve-requirements-engineering)
- Gherkin / BDD — [Cucumber](https://cucumber.io/) · [Reqnroll](https://reqnroll.net/) ·
  [Reqnroll on NuGet](https://www.nuget.org/packages/Reqnroll/) ·
  [pytest-bdd](https://pytest-bdd.readthedocs.io/) · [behave](https://behave.readthedocs.io/)
- OpenAPI governance — [Spectral](https://github.com/stoplightio/spectral) ·
  [vacuum](https://quobix.com/vacuum/) · [Redocly CLI](https://redocly.com/docs/cli/) ·
  [Stoplight](https://stoplight.io/) ·
  [API Evangelist: properties of Spectral governance rules](https://apievangelist.com/2025/01/21/the-properties-of-spectral-api-governance-rules/)
- Breaking-change diff — [Optic](https://github.com/opticdev/optic) ·
  [oasdiff](https://github.com/oasdiff/oasdiff) ·
  [Detecting breaking changes in OpenAPI specs](https://reuvenharrison.medium.com/detecting-breaking-changes-in-openapi-specifications-df19971321c8)
- AsyncAPI — [AsyncAPI tools](https://www.asyncapi.com/tools) ·
  [AsyncAPI validate guide](https://www.asyncapi.com/docs/guides/validate) ·
  [Redocly: lint AsyncAPI](https://redocly.com/docs/cli/guides/lint-asyncapi) ·
  [AsyncAPI + Spectral](https://www.asyncapi.com/blog/creating-consistency-announcing-asyncapi-spectral-together)
- Diagrams-as-code — [Structurizr DSL](https://docs.structurizr.com/dsl) ·
  [C4 model](https://c4model.com/) · [PlantUML](https://plantuml.com/) ·
  [Mermaid](https://mermaid.js.org/) · [D2](https://d2lang.com/)
- ERD-as-code — [DBML](https://dbml.dbdiagram.io/) · [dbdiagram.io](https://dbdiagram.io/) ·
  [SchemaSpy](https://schemaspy.org/)
- ADRs — [MADR](https://adr.github.io/madr/) · [adr.github.io](https://adr.github.io/) ·
  [Log4brains](https://github.com/thomvaill/log4brains) ·
  [TechTarget: ADR best practices](https://www.techtarget.com/it-infrastructure/tip/8-best-practices-for-creating-architecture-decision-records)
- Laws — [Tesler's Law / conservation of complexity](https://lawsofux.com/teslers-law/) ·
  [Cunningham's Law](https://en.wikipedia.org/wiki/Ward_Cunningham#Cunningham's_Law)
