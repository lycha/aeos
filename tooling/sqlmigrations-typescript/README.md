# Tooling: Generating TypeScript DB types from SQL migrations

Enforcement tooling for **Principle IV — Generators build the scaffold, agents write the logic**, for
the **database layer** of a TypeScript service. A human owns the SQL migrations; this generates the
TypeScript types the agent is not allowed to hand-write (the Kysely schema interfaces), from the
*real migrated schema*, and fails the build the moment a column has a Postgres type the project has
not accounted for.

It is modelled on how [`edugo-payments-service`](https://github.com/lycha/edugo-payments-service)
already does DB codegen — `node-pg-migrate` SQL migrations, a throwaway Postgres via testcontainers,
and `kysely-codegen` introspection — behind the same editable-policy + reusable-verifier split as the
OpenAPI scaffolds in this folder.

## What it produces

From `db/migrations/*.sql`, via a `node-pg-migrate` → Postgres → `kysely-codegen` pipeline:

- `.generated/schema.ts` — one `export interface` per table plus the aggregate `DB` map, typed from
  the schema Postgres actually built (defaults become `Generated<…>`, nullability preserved). You
  import it into your Kysely instance; you never hand-edit it.

A committed **reference copy** lives in [`examples/generated/schema.ts`](examples/generated/schema.ts)
so you can read the shape without running anything. `.generated/` itself is gitignored.

## Why it is more than running kysely-codegen

Three disciplines, all in the reusable verifier ([`scripts/verify-schema.mjs`](scripts/verify-schema.mjs)) —
you do not edit it:

1. **The emitter is pinned.** kysely-codegen does not stamp a version into its output, so the installed
   version is read from `node_modules` and held against `pinnedCodegenVersion` in the policy. A
   mismatch — someone bumped the generator without regenerating, reading the diff and moving the pin —
   fails. A generator's output is an input to everything downstream and its output changes between
   releases.
2. **No silent no-op.** The generated file must exist, be non-empty, and declare at least one table
   interface. A green build with an empty schema surfaces much later as a query layer with no types.
3. **An unmapped type breaks the build.** Every column's base type is checked against the policy's
   allow-list. The headline refusal is **`unknown`** — kysely-codegen's fallback for a Postgres type
   it could not map (a custom enum, domain, `citext`, a composite, an extension type). A green build
   that keeps an `unknown` ships a query layer that is silently untyped exactly where an exotic type
   is in play — the database equivalent of an unmodelled OpenAPI construct. Value-level `checks` then
   run over the parsed schema (here: the migrations table must not leak, and every table carries a
   `created_at`/`updated_at`).

## Run it

```bash
npm install
npm run generate-db      # generate-db-types + verify-schema
```

Expected tail:

```
verify-schema: .generated/schema.ts is current - 4 tables, 23 columns, generator kysely-codegen 0.17.0.
```

Requires **Docker running** (Docker Desktop, colima, …). Testcontainers must find the daemon: if
`docker` works but generation reports "Could not find a working container runtime strategy", point it
at your socket, e.g. for colima:

```bash
export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
# optional, if you do not want the reaper container: export TESTCONTAINERS_RYUK_DISABLED=true
```

## Install (into a real TypeScript project)

Copy into your project:

```
db-codegen.policy.mjs
scripts/generate-db-types.mjs
scripts/verify-schema.mjs
```

Merge [`package.snippet.json`](package.snippet.json) into your `package.json` (scripts + deps), point
`migrationsDir`/`out` in the policy at your paths, then `npm run generate-db`. The `pre*` hooks make
`build`/`test` verify first, so no workflow runs against a stale schema — a CI job that runs
`generate-db` (which needs Docker) is enough to enforce the whole thing. Commit `.generated/` or
regenerate it in CI; either way the verifier is the gate.

## Extending it — the policy file

[`db-codegen.policy.mjs`](db-codegen.policy.mjs) is the only file you edit:

| Key | What it controls |
|---|---|
| `migrationsDir`, `out` | Where the migrations are and where the types go. |
| `dbSchema`, `excludePattern` | Which Postgres schema to introspect, and the migrations table to exclude. |
| `postgresImage` | The throwaway Postgres image migrations run against. |
| `pinnedCodegenVersion` | The kysely-codegen version this policy is verified against. |
| `codegenFlags` | Extra kysely-codegen flags. |
| `allow.columnTypes` | Generated base types the schema may contain. A type not here is refused or breaks the build. |
| `refuse` | Base types you have decided not to carry untyped (keyed by type, value is the reason). |
| `checks` | Value-level callables over the parsed schema that throw to fail the build. |

When you decide to serve something currently refused, the move is always: map it (a kysely-codegen
type override, or a schema change), then move the type to `allow.columnTypes` in the same change.

## Notes

- The reference output was generated by the pinned `kysely-codegen 0.17.0` against a real migrated
  `postgres:16-alpine`, and the verifier was exercised end to end (happy path plus all three guards:
  `unknown` column, version-pin mismatch, missing-timestamp convention).
- `kysely-codegen` infers column types from Postgres types, not from `CHECK (… IN (…))` constraints, so
  the example's `status`/`entry_type` land as `string`. To get a TS union there, use a real Postgres
  `ENUM` (and add its generated type to `allow.columnTypes`) or a kysely-codegen override.
