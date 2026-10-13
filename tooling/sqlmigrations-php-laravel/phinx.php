<?php

// Phinx configuration. The migrations under db/migrations are the human-owned source of truth; the
// generate step (scripts/generate-db-types.php) sets the PG* environment variables to point Phinx at
// the throwaway Postgres testcontainers started, then runs `phinx migrate -e throwaway`.
//
// You generally do not edit this for codegen decisions — those live in db-codegen.policy.php. You edit
// it only to change where the migrations are or how the environment connects.

return [
    'paths' => [
        'migrations' => __DIR__ . '/db/migrations',
    ],
    'migration_base_class' => 'Phinx\Migration\AbstractMigration',
    'version_order' => 'creation',
    'environments' => [
        'default_migration_table' => 'phinxlog',
        'default_environment' => 'throwaway',

        // The throwaway database. Values come from the environment so the same config works against the
        // testcontainers Postgres in CI and against a local Postgres if you run Phinx by hand.
        'throwaway' => [
            'adapter' => 'pgsql',
            'host'    => getenv('PGHOST') ?: '127.0.0.1',
            'port'    => (int) (getenv('PGPORT') ?: 5432),
            'name'    => getenv('PGDATABASE') ?: 'app',
            'user'    => getenv('PGUSER') ?: 'app',
            'pass'    => getenv('PGPASSWORD') ?: 'app',
        ],
    ],
];
