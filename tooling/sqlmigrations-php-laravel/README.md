# Tooling: Generating PHP DB types from SQL migrations

Enforcement tooling for **Principle IV — Generators build the scaffold, agents write the logic**, for
the **database layer** of a PHP service. A human owns the SQL migrations (run with **Phinx**); this
generates the PHP types the agent is not allowed to hand-write — a `@phpstan-type` row shape per table
— from the *real migrated schema*, and fails the build the moment a column has a Postgres type the
project has not accounted for.

It is the PHP/Composer sibling of [`../sqlmigrations-typescript`](../sqlmigrations-typescript) and
[`../sqlmigrations-kotlin-spring`](../sqlmigrations-kotlin-spring), behind the same editable-policy +
reusable-verifier split as the OpenAPI scaffolds in this folder. Where the TypeScript tool uses
`node-pg-migrate` + `kysely-codegen`, this uses **Phinx** (raw-SQL migrations) +
**Doctrine DBAL** introspection, with the design researched in [`TOOLING-php-laravel.md`](TOOLING-php-laravel.md).

## What it produces

From `db/migrations/*.php` (Phinx migrations whose bodies are raw SQL), via a Phinx → Postgres →
Doctrine DBAL pipeline:

- `.generated/schema.php` — one `@phpstan-type` alias per table (the row shape), plus an aggregate
  `DB` alias mapping each table name to its shape, typed from the schema Postgres actually built
  (nullability preserved). You import these into your query code with `@phpstan-import-type`; you never
  hand-edit the file.

A committed **reference copy** lives in [`examples/generated/schema.php`](examples/generated/schema.php)
so you can read the shape without running anything. `.generated/` itself is gitignored.

## Why it is more than running a generator

Three disciplines, all in the reusable verifier ([`scripts/verify-schema.php`](scripts/verify-schema.php)) —
you do not edit it:

1. **The engine is pinned.** Doctrine DBAL resolves every column to a type and is what decides whether
   a Postgres type is known at all. The verifier reads the installed `doctrine/dbal` version and holds
   it against `pinnedEngineVersion` in the policy. A mismatch — someone bumped the engine without
   regenerating, reading the diff and moving the pin — fails. An engine's type mappings are an input to
   everything downstream and change between major versions.
2. **No silent no-op.** The generated file must exist, be non-empty, and declare at least one
   `@phpstan-type` table shape. A green build with an empty schema surfaces much later as a query layer
   with no types.
3. **An unmapped type breaks the build.** Every column's base type is checked against the policy's
   allow-list. The headline refusal is **`mixed`** — what the generator emits for a DBAL type absent
   from the policy's `typeMap` (the PHP analog of kysely-codegen's `unknown`). A green build that keeps
   a `mixed` ships a row shape that is silently untyped exactly where an exotic type is in play — the
   database equivalent of an unmodelled OpenAPI construct. Doctrine DBAL gives a second, earlier guard:
   it *throws* `Unknown database type … requested` during introspection for a Postgres type it cannot
   map at all, which the generate step turns into actionable guidance. Value-level `checks` then run
   over the parsed schema (here: the Phinx table must not leak, and every table carries a
   `created_at`/`updated_at`).

### The static-analysis gate (important)

Unlike TypeScript's `tsc`, **PHP will not reject code that ignores these types.** The generated
`@phpstan-type` map only *binds* if you run **PHPStan (or Psalm) over it in CI** — that step is the
compiler stand-in. Without it the types are advisory and Principle IV's guarantee leaks. Wire the
analyser alongside `composer generate-db` (see Install).

## Run it

```bash
composer install
composer generate-db      # generate-db-types + verify-schema
```

Expected tail:

```
verify-schema: .generated/schema.php is current - 4 tables, 23 columns, engine doctrine/dbal 4.5.0.
```

Requires **Docker running** (Docker Desktop, colima, …) for testcontainers, and the **`pdo_pgsql`**
PHP extension. If `docker` works but generation cannot find the daemon, point testcontainers at your
socket, e.g. for colima:

```bash
export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
```

## Install (into a real PHP/Laravel project)

Copy into your project:

```
db-codegen.policy.php
phinx.php
scripts/generate-db-types.php
scripts/verify-schema.php
db/migrations/           # your own Phinx SQL migrations
```

Merge [`composer.snippet.json`](composer.snippet.json) into your `composer.json` (scripts + dev deps),
point `out`/`namespace` in the policy at your paths, keep `phinx.php` pointed at your migrations dir,
then `composer generate-db`. Run `composer generate-db` **and** your static analyser over the generated
namespace in CI before build/test, so nothing ever runs against a stale or unverified schema. Commit
`.generated/` or regenerate it in CI; either way the verifier plus PHPStan are the gate.

On Laravel specifically: Eloquent is code-first, so this is a deliberate inversion — the schema is
owned as SQL and the types flow from it. If you would rather keep raw SQL inside Laravel's own
migrations (`DB::unprepared()`), swap the Phinx call in `generate-db-types.php` for `artisan migrate`;
the introspection and verification are unchanged.

## Extending it — the policy file

[`db-codegen.policy.php`](db-codegen.policy.php) is the only file you edit:

| Key | What it controls |
|---|---|
| `out`, `namespace`, `className` | Where the generated types go and the class/namespace that carries them. |
| `dbSchema`, `excludePattern` | Which Postgres schema to introspect, and the Phinx table to exclude. |
| `postgresVersion` | The throwaway Postgres image tag migrations run against. |
| `pinnedEngineVersion` | The `doctrine/dbal` version this policy is verified against. |
| `typeMap` | Doctrine DBAL type → PHP type for the row shapes. A type not here is emitted as `mixed`. |
| `allow.phpTypes` | Generated PHP types the schema may contain. A type not here is refused or breaks the build. |
| `refuse` | PHP types you have decided not to carry (keyed by type, value is the reason); `mixed` is the headline. |
| `checks` | Value-level callables over the parsed schema that throw to fail the build. |

When you decide to serve something currently refused, the move is always: map it (add the DBAL type to
`typeMap`, registering a Postgres type mapping in `generate-db-types.php` first if DBAL itself could
not map it), then add its PHP type to `allow.phpTypes` in the same change.

## Notes

- **Verifier not executed in this repo's authoring environment** (no PHP runtime here, as with the
  sibling `../openapi-php-laravel`). The committed reference under `examples/generated/schema.php` is
  what the pipeline deterministically emits for the example migrations — our generator, not a
  third-party tool, controls the output format, so it is faithful by construction. The DBAL type
  resolutions it reflects: `uuid → guid → string`, `text → string`, `bigint → int`, `timestamptz →
  datetimetz → string`, `jsonb → json → array`. Run `composer generate-db` in any PHP 8.2+/Composer
  environment with Docker to exercise the generator and verifier end to end.
- Doctrine DBAL infers types from the Postgres column type, not from `CHECK (… IN (…))` constraints, so
  the example's `status`/`entry_type` land as `string` (same as the TypeScript scaffold). To get a
  narrower type there, use a real Postgres `ENUM` — DBAL will then throw `Unknown database type` until
  you register it (`registerDoctrineTypeMapping`) and add it to `typeMap`, which is exactly the
  accounted-for-or-it-breaks discipline doing its job.
- `bigint → int` assumes 64-bit PHP; map it to `string` in `typeMap` if you target 32-bit. Timestamps
  surface as `string` because that is how the PDO Postgres driver returns them in a row.
