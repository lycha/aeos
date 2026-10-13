<?php

// SQL migrations -> PHP DB types generation policy.
//
// THIS IS THE FILE YOU EDIT. The verifier (scripts/verify-schema.php) is the reusable core and should
// not need changing; this file is where a project says what its schema is allowed to contain.
//
// It encodes Principle IV ("Generators build the scaffold, agents write the logic") for the database
// layer: the Phinx migrations are the source of truth, the PHP types are generated from the *real
// migrated schema* (never hand-written), and a column whose Postgres type the pipeline has not
// accounted for BREAKS THE BUILD rather than silently landing as `mixed` in the generated types.
//
// `mixed` in the generated schema is the PHP equivalent of kysely-codegen's `unknown`: the generator
// met a type it had no PHP mapping for, and a green build that keeps it ships a DB layer that is
// silently untyped exactly where a custom/exotic type is in play.
//
// Note on enforcement: unlike TypeScript's `tsc`, PHP will not reject code that ignores these types on
// its own. The generated `@phpstan-type` map only binds if you run PHPStan (or Psalm) over it in CI.
// Treat that static-analysis step as the compiler stand-in - see the README.

return [

    // Where the generated types go (relative to the package root), and the namespace + class that
    // carries the @phpstan-type aliases. The Phinx migrations live under db/migrations (see phinx.php).
    'out'       => '.generated/schema.php',
    'namespace' => 'App\\Generated',
    'className' => 'DbSchema',

    // The Postgres schema to introspect, and the Phinx bookkeeping table to exclude from the types.
    'dbSchema'       => 'public',
    'excludePattern' => 'phinxlog',

    // A throwaway Postgres version (the `:` tag of the postgres image); migrations run against it, the
    // types are introspected from it, it is then discarded.
    'postgresVersion' => '16-alpine',

    // The introspection engine this policy is verified against. Doctrine DBAL resolves every column to
    // a type and THROWS `Unknown database type ... requested` on one it cannot map - the discipline is
    // in the engine. The verifier reads the installed doctrine/dbal version and refuses to pass unless
    // it equals this. A generator/engine's output is an input to everything downstream and its type
    // mappings change between major versions; bumping it without regenerating, reading the diff and
    // moving this pin is what fails.
    'pinnedEngineVersion' => '4.5.0',

    // Postgres/DBAL type -> PHP type for the generated row shapes. The key is the name Doctrine DBAL
    // resolves a column to (e.g. Postgres `uuid` -> `guid`, `timestamptz` -> `datetimetz`, `jsonb` ->
    // `json`). A DBAL type not listed here is emitted as `mixed` and then refused by the verifier.
    // Timestamps map to `string` because that is how the PDO Postgres driver surfaces them in a row;
    // `bigint` -> `int` assumes 64-bit PHP (map it to `string` instead if you target 32-bit).
    'typeMap' => [
        'guid'       => 'string',
        'string'     => 'string',
        'text'       => 'string',
        'integer'    => 'int',
        'smallint'   => 'int',
        'bigint'     => 'int',
        'boolean'    => 'bool',
        'decimal'    => 'string',
        'float'      => 'float',
        'datetime'   => 'string',
        'datetimetz' => 'string',
        'date'       => 'string',
        'time'       => 'string',
        'json'       => 'array',
    ],

    // Generated PHP types the schema is allowed to contain (the value side of `typeMap`, plus whatever
    // you deliberately allow). A base type here passes; anything else is refused (if listed in `refuse`)
    // or breaks the build with the generic message. Bases are read with `| null` peeled away.
    'allow' => [
        'phpTypes' => ['string', 'int', 'bool', 'float', 'array'],
    ],

    // Base types you have met and decided not to carry untyped. The value is the reason, phrased as the
    // constraint. The headline refusal is `mixed` - what the generator emits for a DBAL type absent from
    // `typeMap` (the PHP analog of kysely-codegen's `unknown`).
    'refuse' => [
        'mixed' =>
            'A column was emitted as `mixed`: the generator met a Doctrine DBAL type with no entry in ' .
            '`typeMap`, so the row shape is untyped exactly there. Account for it (add the DBAL type to ' .
            '`typeMap` with the PHP type it should carry, registering a Postgres type mapping in ' .
            'generate-db-types.php first if DBAL itself could not map it), then this passes - or add ' .
            '`mixed` to `allow.phpTypes` once you have decided an untyped column is acceptable.',
    ],

    // Value-level checks the type lists cannot catch. Each receives the parsed schema
    // (['tables' => [['name' => ..., 'columns' => [['name' => , 'type' => , 'bases' => [...]], ...]]]])
    // and throws (with a clear message) to fail the build. Edit, remove, or add your own.
    'checks' => [

        // The Phinx bookkeeping table must not leak into the typed schema (proves the exclude worked).
        static function (array $schema): void {
            foreach ($schema['tables'] as $table) {
                if (strtolower($table['name']) === 'phinxlog') {
                    throw new RuntimeException(
                        'the migrations table `phinxlog` leaked into the generated types - the exclude ' .
                        'did not apply. Check `excludePattern`.'
                    );
                }
            }
        },

        // Every table should carry a created_at or updated_at audit column (a house convention the
        // ledger relies on). Example project-specific check; delete it if it does not fit your schema.
        static function (array $schema): void {
            $missing = [];
            foreach ($schema['tables'] as $table) {
                $names = array_column($table['columns'], 'name');
                if (!in_array('created_at', $names, true) && !in_array('updated_at', $names, true)) {
                    $missing[] = $table['name'];
                }
            }
            if ($missing !== []) {
                throw new RuntimeException(
                    'these tables have neither created_at nor updated_at: ' . implode(', ', $missing) .
                    '. The convention is that every table is timestamped; add the column or remove this check.'
                );
            }
        },
    ],
];
