# Research: SQL-migrations-first → PHP/Laravel DB codegen tooling

Does the PHP/Laravel ecosystem already have what [`tooling/sqlmigrations-typescript`](../sqlmigrations-typescript)
implements — a **human-owned SQL schema**, a **typed DB layer generated from the real migrated
schema** (never hand-written), with **build-time enforcement** (pin the generator, no silent no-op, a
conformance gate that refuses a column whose type the project has not accounted for)?

**Short answer.** Every ingredient exists and the *pipeline* ports almost 1:1 — but two things differ
in kind, and the port has to answer them deliberately rather than paper over them:

1. **PHP has no compile-time type system.** Kysely's generated schema is enforced by `tsc`; the agent
   physically cannot write a query the types reject. The PHP equivalent of the generated artifact is
   PHPDoc `@property` / `@phpstan-type` annotations, which only *bind* if **PHPStan or Psalm runs in
   CI**. So Principle IV's "agents don't hand-write the generated types" leans on a static-analysis
   gate standing in for the compiler — it is not free the way `tsc` is.
2. **The dominant Laravel idiom runs the opposite direction.** Laravel is code-first: hand-written
   Eloquent models and PHP Schema-builder migrations, with docs generated *from* the code (Scramble).
   SQL-migrations-first, with a generated and never-hand-edited DB layer, is a **minority approach** —
   so, as with the OpenAPI scaffold, nothing off the shelf is a drop-in equal.

What *does* carry over cleanly: the throwaway-Postgres → migrate → introspect-the-real-schema → generate
pipeline, and — pleasingly — the headline discipline. Kysely-codegen's silent `unknown` fallback has a
**built-in PHP analog that is stronger**: Doctrine DBAL *throws* `Unknown database type … requested`
the moment it introspects a Postgres type it has no mapping for (an `ENUM`, `citext`, a domain, a
composite). You opt a type in explicitly with `registerDoctrineTypeMapping()`. That throw is exactly
"an unaccounted-for column type breaks the build," already in the engine.

_Researched 2026-10-13._

## The landscape

### A. Throwaway database + the introspection engine (closest to our pipeline)
- **`testcontainers/testcontainers` (PHP)** — `Testcontainers\Modules\PostgresContainer`, the direct
  analog of `@testcontainers/postgresql`: `->start()`, `getHost()`/`getFirstMappedPort()` for the DSN,
  `stop()` in a `finally`. Needs `ext-pdo_pgsql`. <https://php.testcontainers.org/modules/postgresql/>
- Two ways to introspect the migrated schema:
  - **Laravel-native `Schema::getColumns()`** — added across Laravel 10.x precisely to let 11 drop
    `doctrine/dbal`. Returns, per column, the name, `type_name`, full type definition, nullability,
    default, auto-increment and comment, across MySQL/Postgres/SQLite/SQL Server — no DBAL type-mapping
    exceptions. The natural introspector if the scaffold boots a minimal Laravel app.
    <https://github.com/laravel/framework/pull/48357>
  - **Doctrine DBAL `SchemaManager`** — the engine under most standalone generators. Its defining
    behaviour here: it **throws `Unknown database type … requested`** on an unmapped type; you register
    the mapping on the platform (`$conn->getDatabasePlatform()->registerDoctrineTypeMapping('citext',
    'string')`). A built-in, stricter version of our refuse-the-`unknown` gate. (Note: Laravel 11
    removed DBAL from core, so this is the *standalone* path, not `DB::connection()`.)
    <https://www.doctrine-project.org/projects/doctrine-orm/en/current/cookbook/mysql-enums.html>

### B. The codegen (the `kysely-codegen` analog) — what gets generated differs, because PHP is dynamic
- **`barryvdh/laravel-ide-helper` (`ide-helper:models`)** — the mainstream analog: it reads each model's
  live table and writes typed `@property` docblocks (`@property int $id`, `@property string $title`,
  relations as `@property-read`). Real-schema-derived type information consumed by the static analyser.
  But it *annotates hand-written Eloquent models* (code-first), needs a live connection, and does not
  fail on an exotic type — it just omits or widens it. <https://packagist.org/packages/barryvdh/laravel-ide-helper>
- **`rkrx/php-phpstan-sql-generator`** — closest *in spirit* to "generate a type map nobody hand-edits":
  introspects via PDO (MySQL/Postgres) and emits one class whose docblock carries `@phpstan-type` /
  `@psalm-type` definitions per table. Pure types for the analyser, no ORM, no model files to drift.
  <https://github.com/rkrx/php-phpstan-sql-generator>
- **`krlove/eloquent-model-generator`** (and forks) — generates a model plus `@property` tags from an
  existing table, and ships the mechanism our policy needs: a **`db_types` config map**, and it
  **errors on an unknown database type** until you add it. A direct analog of `allow.columnTypes` +
  the `unknown`-breaks-the-build refusal. Caveat: latest v2.0.2 (2023), targets Laravel 9/10.
  <https://packagist.org/packages/krlove/eloquent-model-generator>
- **`psx/sql`** — the nearest thing to a *typed query layer*: generates a typed row class and repository
  per table from a DBAL connection, and tells you to regenerate when the schema changes. Row classes +
  repositories rather than a query-builder type map. <https://packagist.org/packages/psx/sql>
- Also-rans (model generators from a live DB): `pepijnolivier/eloquent-model-generator` (PHP 8.4 /
  Laravel 12, actively maintained), `reliese/laravel`, `axn/laravel-models-generator` (DBAL ^4),
  `zuqongtech/laravel-db-introspection`.

### C. The migration runner (so a human owns the SQL, not an ORM)
- **Laravel migrations** are PHP Schema-builder classes — code-first by default. You keep the schema
  SQL-owned by running raw `.sql` through `DB::unprepared()` inside thin migrations (the Laravel-native
  path if the scaffold already boots Laravel for introspection).
- **Phinx** — framework-independent, standalone, and **supports raw SQL** migrations directly: the
  closest PHP equivalent of `node-pg-migrate`'s `.sql` Up/Down files, and of what the kotlin-spring
  sibling gets from Flyway (which is JVM-only). Caveat: PDO does not throw on batched statements, so
  error handling on multi-statement SQL is weaker. <https://book.cakephp.org/phinx/0/en/migrations.html>
- **Doctrine Migrations** — only a natural fit if the project already runs Doctrine ORM; its
  generate-from-entities workflow pulls back toward code-first.

### D. The enforcement half, as runtime/test checks (not codegen)
No build-time conformance walk exists as a package, but the adjacent art, for completeness: `league/…`
and Laravel wrappers validate *requests* against a schema at runtime — the DB-layer counterpart would be
asserting the live schema matches the migrations, which `Schema::getColumns()` lets you write by hand.

## The gap

Same shape as the OpenAPI finding: **no package combines emitter-pinning + no-silent-no-op + a
build-failing conformance walk** over the introspected schema. The nearest built-in guard is DBAL's
`Unknown database type` throw; the nearest *configurable* allow-list is krlove's `db_types` map. Neither
pins the generator's version (so a generator bump silently reshapes the output), neither guards against
a generator that exits `0` having written nothing, and the generated artifact is only as binding as the
PHPStan/Psalm level you run — none of them make that gate for you.

## What we built

[`sqlmigrations-php-laravel/`](.) — the DB-layer sibling of [`../openapi-php-laravel`](../openapi-php-laravel),
same editable-policy + reusable-verifier split, run via a Composer script (`composer generate-db`); see
the [README](README.md). The pipeline is the TypeScript tool's, port-for-port:

1. **`db-codegen.policy.php`** (the only file you edit) — mirrors the `.mjs` policy: `migrationsDir`,
   `out`, `dbSchema`, `excludePattern`, `postgresImage`, `pinnedGeneratorVersion`, `allow.columnTypes`
   (here a **Postgres-type → PHP-type map**, e.g. `bigint → int`, `jsonb → array`, `timestamptz →
   \DateTimeImmutable`), `refuse` (keyed by unmapped Postgres type, value the constraint), and
   value-level `checks`.
2. **`scripts/generate-db-types.php`** — generator-agnostic orchestration: `testcontainers/testcontainers`
   starts a throwaway `postgres:16-alpine` → run the **human-owned SQL migrations** against it (Phinx
   raw-SQL, or Laravel raw-SQL migrations) → introspect the **real migrated schema** (`Schema::getColumns()`
   if Laravel is booted, else DBAL `SchemaManager`) → emit the typed artifact the agent may not
   hand-write — a `@phpstan-type` map (`rkrx`-style, nothing to drift) and/or `@property` model
   docblocks (`ide-helper`) — into `.generated/` → stop the container.
3. **`scripts/verify-schema.php`** (the reusable core, not edited) — the three disciplines:
   **(a)** pin the emitter — read the generator's installed version, refuse unless it equals
   `pinnedGeneratorVersion`; **(b)** no silent no-op — the output exists, is non-empty, declares ≥1
   table; **(c)** every column's Postgres type is on `allow.columnTypes` or it fails, with the two
   deliberate ways out — **map it** (register the DBAL mapping / add it to the allow-list in the same
   change) or **refuse it** — plus the value-level `checks` (migrations table excluded; the
   `created_at`/`updated_at` convention). Catching DBAL's `Unknown database type` throw is the natural
   way to implement (c).
4. **The binding gate.** Because PHP won't enforce the annotations itself, the scaffold ships a
   **PHPStan (max level) / Psalm** config over the generated types, and the install note wires
   `composer generate-db` **and** the analyser ahead of build/test in CI. That static-analysis gate is
   the PHP stand-in for `tsc` — without it the generated `@property`/`@phpstan-type` layer is advisory,
   and Principle IV's guarantee leaks.

What we chose, and why it differs from the first-cut sketch: **Phinx** (SQL-first, standalone, raw SQL
in `$this->execute()`) for migrations; **Doctrine DBAL** as the *pinned engine* for introspection —
its `SchemaManager` resolves every column and its unknown-type throw *is* discipline (c), and unlike
`rkrx/php-phpstan-sql-generator` (the obvious off-the-shelf emitter) it is cleanly versioned, so the
version pin is honest. Our generator emits the `@phpstan-type` map itself (rkrx's output shape, under
our control, so the committed reference is faithful by construction); **PHPStan** is the gate that
makes those annotations binding. Documented swaps: `rkrx` as the emitter if you prefer an external
generator, or `Schema::getColumns()` + `barryvdh/laravel-ide-helper` if the target is a booted Laravel
app that wants the types on real Eloquent models.

## Sources

- testcontainers-php PostgreSQL module — <https://php.testcontainers.org/modules/postgresql/>
- Laravel native `Schema::getColumns()` (PR #48357, the DBAL-removal series) — <https://github.com/laravel/framework/pull/48357>
- Doctrine DBAL unknown-type / `registerDoctrineTypeMapping` — <https://www.doctrine-project.org/projects/doctrine-orm/en/current/cookbook/mysql-enums.html>
- barryvdh/laravel-ide-helper (`ide-helper:models`) — <https://packagist.org/packages/barryvdh/laravel-ide-helper>
- rkrx/php-phpstan-sql-generator — <https://github.com/rkrx/php-phpstan-sql-generator>
- krlove/eloquent-model-generator (`db_types`, unknown-type error) — <https://packagist.org/packages/krlove/eloquent-model-generator>
- psx/sql (typed row + repository codegen) — <https://packagist.org/packages/psx/sql>
- pepijnolivier/eloquent-model-generator — <https://packagist.org/packages/pepijnolivier/eloquent-model-generator>
- Phinx — writing migrations (raw SQL) — <https://book.cakephp.org/phinx/0/en/migrations.html>
- Scramble (dedoc), the code-first Laravel norm — <https://scramble.dedoc.co/how-it-works>
