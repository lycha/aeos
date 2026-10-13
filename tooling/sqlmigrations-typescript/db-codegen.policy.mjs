// SQL migrations -> TypeScript DB types generation policy.
//
// THIS IS THE FILE YOU EDIT. The verifier (scripts/verify-schema.mjs) is the reusable core and
// should not need changing; this file is where a project says what its schema is allowed to contain.
//
// It encodes Principle IV ("Generators build the scaffold, agents write the logic") for the database
// layer: the migrations are the source of truth, the TypeScript types are generated from the *real
// migrated schema* (never hand-written), and a column whose Postgres type the pipeline has not
// accounted for BREAKS THE BUILD rather than silently landing as `unknown` in the generated types.
//
// A column typed `unknown` in the generated schema is the database equivalent of an unmodelled
// OpenAPI construct: the generator met something it could not map, and a green build that keeps it
// ships a query layer that is silently untyped exactly where a custom/exotic type is in play.

export default {

  // Where the migrations are, and where the generated types go. Paths are relative to the package root.
  migrationsDir: 'db/migrations',
  out: '.generated/schema.ts',

  // The Postgres schema to introspect, and the migrations bookkeeping table to exclude from the types.
  dbSchema: 'public',
  excludePattern: 'pgmigrations',

  // A throwaway Postgres image; migrations run against it, the types are introspected from it, it is
  // then discarded. Matches edugo-payments-service's testcontainers approach.
  postgresImage: 'postgres:16-alpine',

  // The kysely-codegen version this policy was verified against. The verifier reads the installed
  // version and refuses to pass unless it equals this (kysely-codegen does not stamp its output, so
  // the pin is checked against node_modules). A generator's output is an input to everything
  // downstream; bumping it without re-verifying the generated diff and moving this pin is what fails.
  pinnedCodegenVersion: '0.17.0',

  // Extra kysely-codegen flags (besides --dialect/--url/--out-file/--exclude-pattern).
  codegenFlags: ['--no-domains'],

  // Generated member types the schema is allowed to contain. A base type here is allowed; anything
  // else is refused (if listed in `refuse`) or breaks the build with the generic message. The base
  // type is the type with `Generated<...>`, `| null`, and `ColumnType<...>` wrappers peeled away.
  allow: {
    columnTypes: ['string', 'number', 'boolean', 'Int8', 'Numeric', 'Timestamp', 'Json', 'Buffer'],
  },

  // Base types you have met and decided not to carry untyped. The value is the reason, phrased as the
  // constraint. The headline refusal is `unknown` — kysely-codegen's fallback for a type it cannot map.
  refuse: {
    unknown:
      'A column mapped to `unknown`: kysely-codegen met a Postgres type it could not map (a custom ' +
      'enum, domain, citext, a composite, an extension type). The query layer would be silently ' +
      'untyped there. Account for it (add a kysely-codegen type override, or change the column to a ' +
      'mapped type), then this passes - or add it to `allow.columnTypes` once you have decided the ' +
      '`unknown` is acceptable.',
    any:
      'A column mapped to `any` erases type safety for that column. Give it a concrete type via a ' +
      'kysely-codegen override, or decide to allow it explicitly.',
  },

  // Value-level checks the type lists cannot catch. Each takes the parsed schema
  // ({ tables: [{ name, columns: [{ name, type, raw }] }] }) and throws (with a clear message) to
  // fail the build. Edit, remove, or add your own.
  checks: [

    // The migrations bookkeeping table must not leak into the typed schema (proves the exclude worked).
    (schema) => {
      const leaked = schema.tables.find((t) => t.name.toLowerCase() === 'pgmigrations');
      if (leaked) {
        throw new Error("the migrations table `pgmigrations` leaked into the generated types - the exclude pattern did not apply. Check `excludePattern`.");
      }
    },

    // Every table should carry a created_at audit column (a house convention the ledger relies on).
    // This is an example project-specific check; delete it if it does not fit your schema.
    (schema) => {
      const missing = schema.tables
        .filter((t) => !t.columns.some((c) => c.name === 'created_at' || c.name === 'updated_at'))
        .map((t) => t.name);
      if (missing.length) {
        throw new Error(`these tables have neither created_at nor updated_at: ${missing.join(', ')}. The convention is that every table is timestamped; add the column or remove this check.`);
      }
    },
  ],
};
