<?php

declare(strict_types=1);

// Schema verifier - the REUSABLE CORE. It should not need editing; project decisions live in
// db-codegen.policy.php. It implements the enforcement half of Principle IV for the DB layer:
//
//   1. Pin the engine. Doctrine DBAL does the type resolution; its installed version is read from
//      Composer and held against policy.pinnedEngineVersion. A mismatch (someone bumped it without
//      re-verifying the generated diff) fails.
//   2. No silent no-op. The generated file must exist, be non-empty, and declare at least one
//      @phpstan-type table shape - otherwise a green build ships a DB layer with no types.
//   3. An unmapped type breaks the build. Every column's base type is checked against the policy's
//      allow-list; a type on neither the allow-list nor the refusal list fails. The headline refusal
//      is `mixed` - what the generator emits for a DBAL type absent from `typeMap` (the PHP analog of
//      kysely-codegen's `unknown`). Value-level `checks` then run over the parsed schema.
//
// Run it after generation (see the `generate-db` script). Exit 0 = verified, 1 = any violation.

require __DIR__ . '/../vendor/autoload.php';

use Composer\InstalledVersions;

final class ConformanceError extends RuntimeException {}

$policy = require __DIR__ . '/../db-codegen.policy.php';
$root = dirname(__DIR__);

/** Peel `| null` and unions to the list of base type names. */
function baseTypes(string $raw): array
{
    $t = trim(rtrim(trim($raw), ','));
    $parts = array_map('trim', explode('|', $t));
    return array_values(array_filter($parts, static fn (string $s): bool => $s !== '' && $s !== 'null'));
}

/** Parse the generated file into ['tables' => [['name', 'columns' => [['name','type','bases']]]]]. */
function parseSchema(string $src): array
{
    $tables = [];
    if (preg_match_all('/@phpstan-type\s+(\w+)\s+array\{(.*?)\}/s', $src, $matches, PREG_SET_ORDER)) {
        foreach ($matches as $match) {
            $name = $match[1];
            if ($name === 'DB') {
                continue; // the aggregate map of table-name -> shape, not a table
            }
            $columns = [];
            foreach (preg_split('/\r?\n/', $match[2]) as $line) {
                $line = preg_replace('/^\s*\*?\s*/', '', (string) $line);
                $line = rtrim($line, ", \t");
                if ($line === '' || !preg_match('/^(\w+):\s*(.+)$/', $line, $col)) {
                    continue;
                }
                $type = trim($col[2]);
                $columns[] = ['name' => $col[1], 'type' => $type, 'bases' => baseTypes($type)];
            }
            $tables[] = ['name' => $name, 'columns' => $columns];
        }
    }
    return ['tables' => $tables];
}

function fail(string $msg): never
{
    throw new ConformanceError($msg);
}

function main(array $policy, string $root): void
{
    $outFile = $root . '/' . $policy['out'];

    // 1. Pin the engine.
    $installed = InstalledVersions::isInstalled('doctrine/dbal')
        ? InstalledVersions::getPrettyVersion('doctrine/dbal')
        : null;
    if ($installed === null) {
        fail('could not read the installed doctrine/dbal version. Is it installed? Run `composer install` first.');
    }
    if ($installed !== $policy['pinnedEngineVersion']) {
        fail(
            "doctrine/dbal {$installed} is installed; this policy is verified against {$policy['pinnedEngineVersion']}.\n" .
            "  The engine's type mappings are an input to everything downstream and change between releases.\n" .
            "  Re-verify the new version (regenerate, read the diff), then set pinnedEngineVersion in\n" .
            "  db-codegen.policy.php in the same change. Bumping the dependency alone is what this refuses."
        );
    }

    // 2. No silent no-op.
    if (!is_file($outFile)) {
        fail("{$policy['out']} not found - generation did not run. Run the generate step first (needs Docker).");
    }
    $src = file_get_contents($outFile);
    if (trim((string) $src) === '') {
        fail("{$policy['out']} is empty.");
    }
    $schema = parseSchema((string) $src);
    if ($schema['tables'] === []) {
        fail("{$policy['out']} declares no @phpstan-type table shapes - a silent no-op, not a passing build. Did the migrations create any tables?");
    }

    // 3. An unmapped (or unaccounted-for) column type breaks the build.
    $allowed = array_flip($policy['allow']['phpTypes']);
    $refuse = $policy['refuse'] ?? [];
    foreach ($schema['tables'] as $table) {
        foreach ($table['columns'] as $col) {
            foreach ($col['bases'] as $base) {
                if (isset($allowed[$base])) {
                    continue;
                }
                if (isset($refuse[$base])) {
                    fail("{$table['name']}.{$col['name']} is typed `{$base}`. {$refuse[$base]}");
                }
                $allowList = implode(', ', array_keys($allowed));
                fail(
                    "{$table['name']}.{$col['name']} is typed `{$base}`, which this pipeline does not account for.\n" .
                    "  Allowed today: {$allowList}.\n" .
                    "  An unaccounted-for column type breaks the build rather than being ignored. Two deliberate\n" .
                    "  ways out: map it (add the DBAL type to `typeMap` and its PHP type to `allow.phpTypes`) or\n" .
                    "  refuse it (add it to `refuse` with the constraint that makes it unusable)."
                );
            }
        }
    }

    // Value-level checks.
    foreach ($policy['checks'] ?? [] as $check) {
        $check($schema);
    }

    $cols = array_sum(array_map(static fn (array $t): int => count($t['columns']), $schema['tables']));
    $n = count($schema['tables']);
    fwrite(STDOUT, "verify-schema: {$policy['out']} is current - {$n} tables, {$cols} columns, engine doctrine/dbal {$installed}.\n");
}

try {
    main($policy, $root);
} catch (Throwable $e) {
    fwrite(STDERR, "\nverify-schema: {$e->getMessage()}\n\n");
    exit(1);
}
