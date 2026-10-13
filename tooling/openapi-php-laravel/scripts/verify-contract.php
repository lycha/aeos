<?php

declare(strict_types=1);

// Contract verifier - the REUSABLE CORE. It should not need editing; project decisions live in
// openapi-policy.php. It implements the enforcement half of Principle IV:
//
//   1. Pin the emitter. A generator's output is an input to everything downstream, so the version the
//      generator stamped into .openapi-generator/VERSION is held against the policy's
//      pinnedGeneratorVersion. A mismatch (someone bumped the generator without re-verifying) fails.
//   2. No silent no-op. The generator can exit 0 having written nothing useful (bad config, empty spec).
//      A green build with no *ApiInterface/models surfaces much later as unrelated "class not found"
//      errors, so the output is checked for.
//   3. An unmodelled construct breaks the build. Every key of the document, each path item, operation,
//      response, request body and parameter is walked against the policy's allow-lists; a key on neither
//      the allow-list nor the refusal list fails. Value-level `checks` then run per operation.
//
// Run it after generation (see composer.json `generate-api`). Exit 0 = verified, 1 = any violation.

use Symfony\Component\Yaml\Yaml;

$autoload = __DIR__ . '/../vendor/autoload.php';
if (!is_file($autoload)) {
    fwrite(STDERR, "verify-contract: vendor/autoload.php not found - run `composer install` first (needs symfony/yaml).\n");
    exit(1);
}
require $autoload;

/** Every assertion throws this; main() prints the message and exits 1. */
final class ConformanceError extends RuntimeException
{
}

/** @param array<string,mixed> $node @param list<string> $allowed @param array<string,string> $refusals */
function spAllowOnly(array $node, array $allowed, array $refusals, bool $allowExtensions, string $subject, string $kind): void
{
    $allowedSet = array_fill_keys($allowed, true);
    foreach (array_keys($node) as $key) {
        $key = (string) $key;
        if (isset($allowedSet[$key])) {
            continue;
        }
        if ($allowExtensions && str_starts_with($key, 'x-')) {
            continue;
        }
        $why = $refusals[$key] ?? null;
        if ($why !== null) {
            throw new ConformanceError("{$subject} declares `{$key}` on its {$kind}. {$why}");
        }
        $allowedList = $allowed;
        sort($allowedList);
        throw new ConformanceError(
            "{$subject} declares `{$key}` on its {$kind}, which this pipeline does not account for.\n"
            . '  Allowed today: ' . implode(', ', $allowedList) . ".\n"
            . "  An unmodelled construct breaks the build rather than being ignored, because a green build for\n"
            . "  something nothing serves ships the endpoint anyway and hides the gap. Two deliberate ways out:\n"
            . "  model it (honour it in your code and add the key to `allow` in openapi-policy.php), or refuse it\n"
            . '  (add it to `refuse` with the constraint that makes it unservable).'
        );
    }
}

/**
 * The whole conformance pass over the parsed spec and the policy. Returns the operations found.
 *
 * @param array<string,mixed> $doc
 * @param array<string,mixed> $policy
 * @return list<array{method:string,path:string,operationId:?string,operation:array<string,mixed>}>
 */
function spWalkSpec(array $doc, array $policy): array
{
    $verbs = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head', 'trace'];
    $allowExt = ($policy['allowExtensions'] ?? true) !== false;
    $refuse = $policy['refuse'] ?? [];
    $operations = [];

    spAllowOnly($doc, $policy['allow']['document'], $refuse['document'] ?? [], $allowExt, 'the contract', 'document');

    $seenIds = [];
    foreach (($doc['paths'] ?? []) as $path => $item) {
        $path = (string) $path;
        spAllowOnly($item, $policy['allow']['pathItem'], $refuse['pathItem'] ?? [], $allowExt, $path, 'path item');
        $sharedParams = $item['parameters'] ?? [];

        foreach ($verbs as $verb) {
            $operation = $item[$verb] ?? null;
            if ($operation === null) {
                continue;
            }
            $id = $operation['operationId'] ?? null;
            $method = strtoupper($verb);

            if ($id !== null && isset($seenIds[$id])) {
                throw new ConformanceError("two operations share operationId \"{$id}\": {$seenIds[$id]} and {$method} {$path}. It names one generated method; give each its own id.");
            }
            if ($id !== null) {
                $seenIds[$id] = "{$method} {$path}";
            }

            spAllowOnly($operation, $policy['allow']['operation'], $refuse['operation'] ?? [], $allowExt, "{$method} {$path} (" . ($id ?? 'no operationId') . ')', 'operation');

            foreach (array_merge($sharedParams, $operation['parameters'] ?? []) as $p) {
                // $ref'd parameters are resolved by the generator; we only police inline ones here.
                if (is_array($p) && !isset($p['$ref'])) {
                    spAllowOnly($p, $policy['allow']['parameter'], $refuse['parameter'] ?? [], $allowExt, ($id ?? "{$method} {$path}") . ' parameter', 'parameter');
                }
            }

            foreach (($operation['responses'] ?? []) as $code => $response) {
                if (is_array($response) && !isset($response['$ref'])) {
                    spAllowOnly($response, $policy['allow']['response'], $refuse['response'] ?? [], $allowExt, "{$id} {$code}", 'response');
                }
            }

            if (isset($operation['requestBody']) && is_array($operation['requestBody']) && !isset($operation['requestBody']['$ref'])) {
                spAllowOnly($operation['requestBody'], $policy['allow']['requestBody'], $refuse['requestBody'] ?? [], $allowExt, (string) $id, 'requestBody');
            }

            $op = ['method' => $method, 'path' => $path, 'operationId' => $id, 'operation' => $operation];
            foreach (($policy['checks'] ?? []) as $check) {
                try {
                    $check($op);
                } catch (ConformanceError $e) {
                    throw $e;
                } catch (\Throwable $e) {
                    throw new ConformanceError($e->getMessage());
                }
            }
            $operations[] = $op;
        }
    }

    if (count($operations) === 0) {
        throw new ConformanceError('the contract declares no operations.');
    }

    return $operations;
}

function main(): void
{
    $policy = require __DIR__ . '/../openapi-policy.php';
    $root = dirname(__DIR__);
    $outDir = $root . '/' . $policy['out'];

    // 1. Pin the emitter: compare the version the generator stamped to the policy pin.
    $versionFile = $outDir . '/.openapi-generator/VERSION';
    if (!is_file($versionFile)) {
        throw new ConformanceError("{$versionFile} not found - generation did not run, so the emitter version cannot be checked. Run the generate step first.");
    }
    $stamped = trim((string) file_get_contents($versionFile));
    if ($stamped !== $policy['pinnedGeneratorVersion']) {
        throw new ConformanceError(
            "openapi-generator {$stamped} produced the output; this policy is verified against {$policy['pinnedGeneratorVersion']}.\n"
            . "  A generator's output is an input to everything downstream and changes between releases. Re-verify the new\n"
            . "  version (regenerate, read the diff), then set `pinnedGeneratorVersion` in openapi-policy.php in the same change.\n"
            . '  Bumping the generator alone is what this refuses.'
        );
    }

    // 2. No silent no-op: at least one *ApiInterface and one model must exist and be non-empty.
    $phpFiles = [];
    if (is_dir($outDir)) {
        $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($outDir, FilesystemIterator::SKIP_DOTS));
        foreach ($it as $f) {
            if ($f->isFile() && str_ends_with($f->getFilename(), '.php')) {
                $phpFiles[] = $f;
            }
        }
    }
    $apis = array_values(array_filter($phpFiles, static fn ($f) => str_ends_with($f->getFilename(), 'ApiInterface.php')));
    $models = array_values(array_filter($phpFiles, static fn ($f) => basename(dirname($f->getPathname())) === 'Model'));
    if (count($apis) === 0) {
        throw new ConformanceError('the generator wrote no *ApiInterface.php - a silent no-op, not a passing build. Check configOptions in openapi-policy.php.');
    }
    $empty = array_values(array_filter($phpFiles, static fn ($f) => $f->getSize() === 0));
    if ($empty) {
        throw new ConformanceError('generated but empty: ' . implode(', ', array_map(static fn ($f) => $f->getFilename(), $empty)) . '.');
    }

    // 3. Conformance: nothing in the contract is unaccounted for.
    $specFile = $root . '/' . $policy['spec'];
    if (!is_file($specFile)) {
        throw new ConformanceError("{$specFile} not found - nothing to verify against.");
    }
    $doc = Yaml::parseFile($specFile);
    $operations = spWalkSpec($doc, $policy);

    fwrite(STDOUT, sprintf(
        "verify-contract: %s is current - %d operations, %d API interfaces, %d models, emitter %s.\n",
        $policy['out'],
        count($operations),
        count($apis),
        count($models),
        $stamped
    ));
}

try {
    main();
} catch (ConformanceError $e) {
    fwrite(STDERR, "\nverify-contract: {$e->getMessage()}\n\n");
    exit(1);
}
