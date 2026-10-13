<?php

declare(strict_types=1);

// Generate PHP DB types from the SQL migrations.
//
// Pipeline: start a throwaway Postgres (Docker/testcontainers) -> run the Phinx migrations against it
// -> introspect the LIVE migrated schema with Doctrine DBAL -> write the @phpstan-type map -> discard
// the container. Introspecting the real migrated database (rather than parsing the SQL) is the point:
// the types then reflect exactly what Postgres built, defaults, constraints and all.
//
// This is engine-agnostic orchestration; all project decisions live in db-codegen.policy.php, and
// verify-schema.php is what actually enforces the contract. Requires Docker (e.g. colima) running.

require __DIR__ . '/../vendor/autoload.php';

use Doctrine\DBAL\DriverManager;
use Doctrine\DBAL\Tools\DsnParser;
use Doctrine\DBAL\Types\Type;
use Testcontainers\Modules\PostgresContainer;

$policy = require __DIR__ . '/../db-codegen.policy.php';
$root = dirname(__DIR__);

$outFile = $root . '/' . $policy['out'];
@mkdir(dirname($outFile), 0777, true);

fwrite(STDOUT, "generate-db-types: starting postgres:{$policy['postgresVersion']} ...\n");

// User/password/database are set via the constructor so the pg_isready wait strategy uses them too.
$container = (new PostgresContainer($policy['postgresVersion'], 'app', 'app', 'app'))->start();

try {
    $host = $container->getHost();
    $port = (int) $container->getFirstMappedPort();
    $env = [
        'PGHOST'     => $host,
        'PGPORT'     => (string) $port,
        'PGDATABASE' => 'app',
        'PGUSER'     => 'app',
        'PGPASSWORD' => 'app',
    ];

    // 1. Migrate the throwaway database to head with Phinx (the human-owned SQL).
    fwrite(STDOUT, "generate-db-types: applying Phinx migrations ...\n");
    runPhinx($root, $env);

    // 2. Introspect the migrated schema into a table -> columns map via Doctrine DBAL.
    fwrite(STDOUT, "generate-db-types: introspecting schema ...\n");
    $tables = introspect($host, $port, $policy);

    if ($tables === []) {
        fwrite(STDERR, "\ngenerate-db-types: no tables found after migrating - nothing to emit.\n\n");
        exit(1);
    }

    // 3. Emit the @phpstan-type schema file.
    file_put_contents($outFile, renderSchema($tables, $policy));
    fwrite(STDOUT, "generate-db-types: wrote {$policy['out']}\n");
} finally {
    $container->stop();
}

/** Run `phinx migrate` against the throwaway DB, inheriting stdio, with the PG* env pointed at it. */
function runPhinx(string $root, array $env): void
{
    $cmd = [PHP_BINARY, $root . '/vendor/bin/phinx', 'migrate', '-e', 'throwaway', '-c', $root . '/phinx.php'];
    $descriptors = [
        0 => ['file', 'php://stdin', 'r'],
        1 => ['file', 'php://stdout', 'w'],
        2 => ['file', 'php://stderr', 'w'],
    ];
    $process = proc_open($cmd, $descriptors, $pipes, $root, array_merge(getenv(), $env));
    if (!is_resource($process)) {
        throw new RuntimeException('could not start phinx.');
    }
    $code = proc_close($process);
    if ($code !== 0) {
        throw new RuntimeException("phinx migrate failed (exit $code).");
    }
}

/**
 * Introspect the live schema. Returns ['table_name' => ['col' => 'php_type', ...], ...] in the order
 * DBAL lists them. DBAL throws on a Postgres type it cannot map; we turn that into actionable guidance.
 *
 * @return array<string, array<string, string>>
 */
function introspect(string $host, int $port, array $policy): array
{
    $dsn = sprintf('pgsql://app:app@%s:%d/app', $host, $port);
    $params = (new DsnParser([
        'pgsql'      => 'pdo_pgsql',
        'postgres'   => 'pdo_pgsql',
        'postgresql' => 'pdo_pgsql',
    ]))->parse($dsn);
    $conn = DriverManager::getConnection($params);
    $schemaManager = $conn->createSchemaManager();

    $tables = [];
    try {
        foreach ($schemaManager->listTables() as $table) {
            $name = $table->getName();
            if ($name === $policy['excludePattern']) {
                continue;
            }
            $columns = [];
            foreach ($table->getColumns() as $column) {
                $dbalType = Type::lookupName($column->getType());
                $phpType = $policy['typeMap'][$dbalType] ?? 'mixed';
                if (!$column->getNotnull()) {
                    $phpType .= '|null';
                }
                $columns[$column->getName()] = $phpType;
            }
            $tables[$name] = $columns;
        }
    } catch (\Doctrine\DBAL\Exception $e) {
        if (str_contains($e->getMessage(), 'Unknown database type')) {
            fwrite(STDERR,
                "\ngenerate-db-types: {$e->getMessage()}\n" .
                "  Doctrine DBAL met a Postgres type it has no mapping for (a custom enum, domain, citext,\n" .
                "  a composite, an extension type). Account for it: register the mapping in this script, e.g.\n" .
                "    \$conn->getDatabasePlatform()->registerDoctrineTypeMapping('citext', 'string');\n" .
                "  then add the resulting DBAL type to `typeMap` in db-codegen.policy.php - or change the\n" .
                "  column to a mapped type. An unaccounted-for column type breaks generation rather than\n" .
                "  landing silently untyped.\n\n");
            exit(1);
        }
        throw $e;
    }

    return $tables;
}

/** Render the table map as a PHP class whose docblock carries one @phpstan-type alias per table. */
function renderSchema(array $tables, array $policy): string
{
    $lines = [];
    $lines[] = '<?php';
    $lines[] = '';
    $lines[] = '// This file was generated from the SQL migrations by scripts/generate-db-types.php.';
    $lines[] = '// Do not edit it by hand. Regenerate with `composer generate-db`.';
    $lines[] = '';
    $lines[] = "namespace {$policy['namespace']};";
    $lines[] = '';
    $lines[] = '/**';
    foreach ($tables as $name => $columns) {
        $lines[] = ' * @phpstan-type ' . typeAlias($name) . ' array{';
        foreach ($columns as $col => $type) {
            $lines[] = " *   {$col}: {$type},";
        }
        $lines[] = ' * }';
    }
    // The aggregate map of table-name -> shape, the analog of kysely-codegen's `DB` interface.
    $lines[] = ' * @phpstan-type DB array{';
    foreach ($tables as $name => $columns) {
        $lines[] = " *   {$name}: " . typeAlias($name) . ',';
    }
    $lines[] = ' * }';
    $lines[] = ' */';
    $lines[] = "final class {$policy['className']} {}";
    $lines[] = '';

    return implode("\n", $lines);
}

/** table_name -> TableName (StudlyCase), the phpstan-type alias. */
function typeAlias(string $table): string
{
    return str_replace(' ', '', ucwords(str_replace('_', ' ', $table)));
}
