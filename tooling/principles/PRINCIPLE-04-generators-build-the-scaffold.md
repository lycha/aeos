# Principle IV — Generators build the scaffold, agents write the logic

> **Principle.** Everything derivable from the specification is generated deterministically — types and
> interfaces from the OpenAPI contract, repository code from a human-owned schema, the end-to-end suite
> from Gherkin scenarios. Invariants are enforced by database constraints and property tests, and the
> agent fills in only the business logic the specification cannot produce by itself.
>
> **Law.** *The Law of the Instrument* — a team holding a capable model is tempted to use it for
> everything, including work a deterministic generator does the same way every time; don't. *Kernighan's
> Law* — debugging is twice as hard as writing, so keep the generated code plain and predictable and the
> hand-written part a human has to understand small.

This is the **keystone** principle, and this folder is its worked proof. Five scaffolds under `tooling/`
already implement it end to end across three ecosystems; this document generalises their shared
discipline and maps the landscape of tools that fit the same shape. Read the scaffold READMEs for the
runnable detail — this is the pattern they instantiate.

## What it demands, operationally

Draw one line through the system: on the **derivable** side sit DTOs, API interfaces, serialisers,
request/response validators, the database access layer, and the executable scenario harness — all a
mechanical function of a specification a human owns. On the **non-derivable** side sits business logic:
the body of a handler, a domain decision, a query's intent. Principle IV says the first side is never
hand-written (by a human *or* an agent) and never produced by the model, because a generator produces it
identically every time and an LLM does not. The agent's hand is allowed only on the second side, and the
generated code is the contract it must satisfy.

Three things have to be true for that line to hold, and they are exactly the three disciplines every
scaffold here enforces:

1. **Pin the generator.** A generator's output is an input to everything downstream, and its output shape
   changes between releases. Hold the installed version against a value in the policy and refuse to run
   against a different one until a human regenerates, reads the diff, and moves the pin *in the same
   change*. Bumping the dependency must not silently retype the application.
2. **No silent no-op.** Generators exit `0` while writing nothing useful when misconfigured. A green build
   with no generated code surfaces much later as a wall of "module not found" / "unresolved reference"
   errors pointing nowhere near the cause. Assert the output exists, is non-empty, and contains what it
   should (at least one interface, at least one table).
3. **A conformance gate fails the build on anything unmodelled.** Walk every construct of the spec/schema
   against an explicit allow-list. A construct on neither the allow-list nor an explicit *refusal* list
   breaks the build with a message offering the two deliberate exits: **model it** or **refuse it**. A
   green build for a construct nothing serves (a response header the server can never send, a Postgres
   type the query layer cannot map) ships the gap hidden — strictly worse than a red build.

The refusal list is a record of deliberate decisions with the reason phrased as the *constraint*, not a
backlog. When you decide to serve something refused, the move is always: honour it in your code, then
move it from `refuse` to `allow` in the same commit.

## Reference architecture

Every scaffold is the same pipeline with the ecosystem swapped:

```
human-owned spec  ─▶  pinned deterministic generator  ─▶  generated artefact  ─▶  conformance gate  ─▶  agent writes logic against it
(OpenAPI / SQL /       (version held in policy)           (gitignored or             (pin + no-op +         (handler bodies,
 Gherkin)                                                   committed reference)       allow/refuse walk)     domain, queries)
```

Each scaffold splits into a **reusable verifier** (the core — you never edit it) and an **editable
policy** (the one file a project owns: where the spec is, the pinned version, the allow/refuse lists, the
value-level `checks`). The gate is wired into the build graph so no workflow ever compiles against a
stale or unverified artefact — `prebuild`/`pretest` hooks in the TS scaffolds, `compileKotlin.dependsOn`
in the Gradle ones, a `composer` script step in PHP — which means **a single CI job (`typecheck`, `build`,
or `generate-db`) enforces the whole principle**.

The contract-first half (spec → server/types):

- **`tooling/openapi-typescript`** — `openapi.yaml` → TS DTOs + Zod runtime validators via
  [`@hey-api/openapi-ts`](https://heyapi.dev), plus a framework-agnostic operations registry with Next.js
  App Router and Fastify adapters. The policy (`scripts/openapi.policy.mjs`) pins `verifiedHeyApi`, carries
  `allow`/`refuse` per object type, and runs value-level `checks` (usable `operationId`, a 2xx present,
  no `in: cookie` — which hey-api silently emits nothing for). The purest expression of the pattern.
- **`tooling/openapi-kotlin-spring`** — the same `openapi.yaml` → interface-only `@RestController` API
  interfaces + DTO models via [`openapi-generator`](https://openapi-generator.tech)'s `kotlin-spring`
  generator, Gradle-native. The verifier reads the version the generator stamps into
  `.openapi-generator/VERSION` and holds it against `pinnedGeneratorVersion`.
- **`tooling/openapi-php-laravel`** — the same engine (`openapi-generator`'s `php-laravel` generator) →
  `*ApiInterface` per tag + `Model/` DTOs + native backed enums, Composer-native. Same verifier contract,
  different host language — proof the discipline is not framework-specific.

The schema-first half (human-owned schema → repository code):

- **`tooling/sqlmigrations-typescript`** — `node-pg-migrate` SQL migrations → a throwaway Postgres (via
  testcontainers) → [`kysely-codegen`](https://github.com/RobinBlomberg/kysely-codegen) introspection →
  `.generated/schema.ts`. The headline refusal is the generated **`unknown`** type (kysely-codegen's
  fallback for a Postgres type it could not map — a custom enum, `citext`, a composite): a green build that
  keeps an `unknown` ships a query layer silently untyped exactly where the exotic type is in play, the
  database equivalent of an unmodelled OpenAPI construct.
- **`tooling/sqlmigrations-kotlin-spring`** — Flyway migrations → dockerised Postgres →
  [jOOQ](https://www.jooq.org) typed table/record DSL via the
  [`dev.monosoul.jooq-docker`](https://github.com/monosoul/jooq-gradle-plugin) plugin. The headline refusal
  is the generated **`Object`** type (jOOQ's unmapped fallback). jOOQ stamps its version into every
  `@Generated` annotation; the verifier pins against it.

Note the invariant: generation runs against the **real migrated schema** (a disposable Postgres built from
the actual migrations), never a hand-maintained model of it, so the types cannot drift from the database.
Both DB scaffolds also carry a value-level convention check (every table has `created_at`/`updated_at`) —
the point where DB-constraint invariants meet the gate.

**Where the agent's hand goes.** The generator emits the interface; the agent writes the `@Component` /
controller / handler body that implements it. The generator emits the `DB`/jOOQ types; the agent writes the
query *using* them. The generator never emits business logic, and the agent never edits generated output
(it is `.gitignore`d or held as a read-only reference). Invariants that are not expressible as a type live
in two places the agent also cannot weaken: **database constraints** (`NOT NULL`, `CHECK`, `UNIQUE`, foreign
keys, enums) and **property-based tests** that assert the invariant holds for generated inputs rather than a
handful of examples. The third derivation — **Gherkin → executable suite** — binds the human-written
scenarios (Principle III) to step definitions the agent fills, so the acceptance criteria run as code.

## CI / automation

- **The gate is a build dependency, not a lint suggestion.** Wire generation + verification *ahead of*
  compile/test so a stale contract cannot be compiled against: `pre*` npm hooks, `compileKotlin.dependsOn
  verifyContract`, a `composer generate-api` step before build. The agent cannot route around a step the
  compiler depends on.
- **Determinism is the testable property.** Regenerating from an unchanged spec must produce byte-identical
  output (or, where a generator embeds a per-run hash like jOOQ's config hash, the pin/no-op/type checks are
  the gate rather than output parity — see the kotlin-spring DB scaffold's note). A `generate && git diff
  --exit-code` step in CI catches a committed artefact that drifted from its spec.
- **Pin bumps are reviewed diffs.** The version pin is the single knob. A dependency-update bot that bumps
  the generator without regenerating *fails the gate by design* — the human reviews the regenerated diff
  and moves the pin in the same PR. This is Principle VII (a human on every contract change) meeting
  Principle IV.
- **Generated code is excluded from the agent's writable surface and from hand-review**, but **is**
  type-checked/compiled — it is the proof the hand-written side conforms.
- **Property and contract tests run in CI as checks, not agent reviews** (Principle VI): `fast-check` /
  `jqwik` / `Hypothesis` for invariants; [Schemathesis](https://schemathesis.readthedocs.io) to drive the
  running service from its own OpenAPI spec and surface 500s and schema-violating responses.
- **Commit-or-regenerate is a choice, not a gap.** Either commit the generated artefact (with the
  `git diff` guard) or regenerate it in CI (DB scaffolds need Docker for the throwaway Postgres); either
  way the verifier is the gate, so a missing or stale artefact is impossible to ship green.

## Tooling options

| Tool | What it does | When to pick it |
|---|---|---|
| [`@hey-api/openapi-ts`](https://heyapi.dev) | OpenAPI → TS types, Zod/Valibot validators, typed client/SDK, plugin pipeline | TypeScript full-stack; you want runtime validators at the boundary, not just compile-time types (the `openapi-typescript` scaffold). |
| [`openapi-generator`](https://openapi-generator.tech) | One engine, 50+ server/client generators (kotlin-spring, php-laravel, spring, go, python, …) | Polyglot shops; a JVM/PHP/other backend needing interface-only server stubs (the two `openapi-*-spring`/`-laravel` scaffolds). |
| [`orval`](https://orval.dev) | OpenAPI → TS client + models + MSW mocks, framework-aware (React Query, Vue, Angular, SWR) | Frontend-heavy TS where you also want generated data-fetching hooks and mocks. |
| [`oapi-codegen`](https://github.com/oapi-codegen/oapi-codegen) | OpenAPI 3 → Go server + client boilerplate and models (moved off the `deepmap` org at v2.3.0) | Go services wanting contract-first server stubs for chi/echo/gin. |
| [`kysely-codegen`](https://github.com/RobinBlomberg/kysely-codegen) | Introspects a live/migrated DB → Kysely TS schema interfaces | TS services using the Kysely query builder; brownfield DBs (the `sqlmigrations-typescript` scaffold). |
| [jOOQ](https://www.jooq.org) | Generates a typed SQL DSL (tables, records, keys) from the real schema | JVM services wanting type-safe SQL rather than an ORM (the `sqlmigrations-kotlin-spring` scaffold). |
| [`sqlc`](https://sqlc.dev) | Hand-written SQL queries → type-safe Go/Kotlin/Python/TS code | You write SQL by hand and want the *result types* generated from it, not an ORM. |
| [Prisma](https://www.prisma.io) | `schema.prisma` → generated client + migrations; types to `.d.ts` | Greenfield TS wanting a schema DSL as the source of truth with a generated client. |
| [Drizzle](https://orm.drizzle.team) | Schema-in-TS; types inferred by the compiler, migrations generated | TS teams wanting SQL-like queries with inference and *no* separate codegen step. |
| [Flyway](https://documentation.red-gate.com/flyway) / [`node-pg-migrate`](https://github.com/salsita/node-pg-migrate) | Versioned, human-owned SQL migrations — the schema source of truth | Any stack; the migrations are the human-owned input the DB generators read from. |
| [`fast-check`](https://fast-check.dev) · [`jqwik`](https://jqwik.net) · [Hypothesis](https://hypothesis.works) | Property-based testing: assert invariants over generated inputs (TS · JVM · Python) | Enforcing domain invariants the type system can't express — the agent's logic must hold for *all* inputs, not examples. |
| [Schemathesis](https://schemathesis.readthedocs.io) | Property-based API testing: drives a running service from its OpenAPI spec | Verifying the implementation conforms to the contract (stateful flows, 500s, schema-violating responses). |
| [Cucumber](https://cucumber.io) · [Reqnroll](https://reqnroll.net) · [behave](https://behave.readthedocs.io) · [godog](https://github.com/cucumber/godog) | Gherkin scenarios → executable step-bound suite (JS/JVM · .NET · Python · Go) | Turning human-written acceptance scenarios (Principle III) into the end-to-end suite the agent must pass. |

## Anti-patterns

- **The model writes the DTOs.** An agent hand-typing what the OpenAPI contract already determines — slower,
  non-deterministic, and drifts from the spec on the next edit. The Law of the Instrument, exactly.
- **Hand-editing generated output.** Edits vanish on the next regeneration, or the file is quietly removed
  from the build graph so they survive — now the generated layer lies. Generated code is read-only; change
  the spec.
- **Unpinned generators.** A transitive bump silently retypes the app; a diff nobody read ships. Without a
  pin, "we generate types" is not a control.
- **Swallowing the unmodelled.** `additionalProperties`, a cookie param, an `unknown`/`Object` column, a
  `links`/`callbacks` block — silently ignored, each is a gap that compiles green and fails in production.
  The gate's whole job is to refuse to ignore them.
- **Example-based tests standing in for invariants.** Three happy-path cases do not establish a property;
  use property-based testing and DB constraints for anything that must hold universally.
- **Invariants as agent-reviewable prose instead of executable checks.** If a rule can be a `CHECK`
  constraint or a property test, it belongs there, not in a rubric the agent reads (and Goodhart's-Laws its
  way around — see Principle VI).
- **A model in the generation path.** Asking an LLM to "generate the repository layer" reintroduces
  non-determinism into the derivable side. Deterministic input → deterministic output, always.

## Signals it's working

- Regenerating from an unchanged spec is a no-op diff; CI's `git diff --exit-code` after generate stays
  green.
- A contract or schema change is a one-line human edit to the spec/migration, then everything downstream
  regenerates — the agent never touches the generated layer.
- A new, unaccounted-for construct turns the build **red with a message that names the two exits**, not
  green-with-a-gap.
- The `refuse` list reads as a short, reasoned record of deliberate decisions, and shrinks (entries move to
  `allow`) as capabilities are built — it is not a growing backlog.
- A dependency-bot generator bump fails the gate until a human regenerates, reviews the diff, and moves the
  pin in the same PR.
- The hand-written surface a reviewer must understand is small (Kernighan's Law): handler bodies and domain
  logic, sitting on top of a thick generated base nobody has to re-read.
- Property tests and Schemathesis runs, not spot checks, are what certify the agent's logic against the
  invariants and the contract.

## Related

- **Worked examples (this folder):**
  [`tooling/openapi-typescript`](../openapi-typescript/README.md) ·
  [`tooling/openapi-kotlin-spring`](../openapi-kotlin-spring/README.md) ·
  [`tooling/openapi-php-laravel`](../openapi-php-laravel/README.md) ·
  [`tooling/sqlmigrations-typescript`](../sqlmigrations-typescript/README.md) ·
  [`tooling/sqlmigrations-kotlin-spring`](../sqlmigrations-kotlin-spring/README.md)
- **Principle III — Humans write the specification** ([`12_PRINCIPLES.md`](../../12_PRINCIPLES.md)): IV
  generates *from* the artefacts III produces. The OpenAPI contract, the schema, and the Gherkin scenarios
  are the human-owned inputs this principle derives everything from; Tesler's Law moves the irreducible
  complexity into that spec.
- **Principle VI — Checks run first, review agents second** ([`12_PRINCIPLES.md`](../../12_PRINCIPLES.md)):
  the conformance gate, DB constraints, property tests, and Schemathesis are exactly the deterministic
  checks that run *before* a review agent. A finding an agent keeps making becomes a `check` in the policy
  or a constraint in the schema.
- **Laws behind the principles** ([`LAWS_BEHIND.md`](../../LAWS_BEHIND.md)): the Law of the Instrument and
  Kernighan's Law for IV.

## Sources

- [@hey-api/openapi-ts](https://heyapi.dev) — OpenAPI → TS types, validators, client.
- [OpenAPI Generator](https://openapi-generator.tech) — multi-language server/client generators ([GitHub](https://github.com/OpenAPITools/openapi-generator)).
- [Orval](https://orval.dev/overview) — TS clients, models, and MSW mocks from OpenAPI.
- [oapi-codegen](https://github.com/oapi-codegen/oapi-codegen) — Go server/client from OpenAPI 3.
- [kysely-codegen](https://github.com/RobinBlomberg/kysely-codegen) — Kysely TS types from a live DB.
- [jOOQ](https://www.jooq.org) and the [`dev.monosoul.jooq-docker`](https://github.com/monosoul/jooq-gradle-plugin) Gradle plugin.
- [sqlc](https://sqlc.dev) — type-safe code from hand-written SQL.
- [Prisma](https://www.prisma.io) and [Drizzle ORM](https://orm.drizzle.team) — schema-first TS data layers.
- [Flyway](https://documentation.red-gate.com/flyway) and [node-pg-migrate](https://github.com/salsita/node-pg-migrate) — versioned SQL migrations.
- [fast-check](https://fast-check.dev), [jqwik](https://jqwik.net), [Hypothesis](https://hypothesis.works) — property-based testing (TS / JVM / Python).
- [Schemathesis](https://schemathesis.readthedocs.io) — property-based API conformance testing from OpenAPI ([GitHub](https://github.com/schemathesis/schemathesis)).
- [Cucumber](https://cucumber.io), [Reqnroll](https://reqnroll.net), [behave](https://behave.readthedocs.io), [godog](https://github.com/cucumber/godog) — Gherkin → executable suites.
- [Testcontainers](https://testcontainers.com) — throwaway Postgres for schema-first codegen.
- [hacker-laws](https://github.com/dwmkerr/hacker-laws) — the Law of the Instrument and Kernighan's Law.
