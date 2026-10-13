<?php

declare(strict_types=1);

// Generation step. Reads openapi-policy.php and invokes the openapi-generator CLI for php-laravel.
// Kept tiny and generator-agnostic: all project decisions live in the policy. The verifier
// (verify-contract.php) runs after this and is what actually enforces the contract.
//
// The configOptions are written to a JSON config file and passed with `-c`, NOT via
// `--additional-properties`: the CLI's comma-separated additional-properties parser strips the
// backslash in namespace values (invokerPackage=App\Generated would arrive as "AppGenerated"),
// whereas a JSON config carries backslashes faithfully.

$policy = require __DIR__ . '/../openapi-policy.php';
$root = dirname(__DIR__);
$spec = $root . '/' . $policy['spec'];
$out = $root . '/' . $policy['out'];

if (!is_file($spec)) {
    fwrite(STDERR, "generate: {$spec} not found - nothing to generate from.\n");
    exit(1);
}

// Mirror stayposted-backend: wipe prior output so a renamed/removed operation cannot leave a stale file.
if (is_dir($out)) {
    $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($out, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($it as $f) {
        $f->isDir() ? @rmdir($f->getPathname()) : @unlink($f->getPathname());
    }
}

// Write configOptions to a JSON config the generator reads with `-c` (see note above re: backslashes).
$configFile = sys_get_temp_dir() . '/openapi-php-laravel-config-' . getmypid() . '.json';
file_put_contents($configFile, json_encode((object) ($policy['configOptions'] ?? []), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
register_shutdown_function(static fn () => @unlink($configFile));

// `generatorCommand` may be a multi-word launcher (e.g. "npx @openapitools/openapi-generator-cli").
$cmd = array_merge(
    preg_split('/\s+/', trim((string) $policy['generatorCommand'])),
    [
        'generate',
        '-i', $spec,
        '-g', $policy['generatorName'],
        '-o', $out,
        '-c', $configFile,
    ]
);

fwrite(STDOUT, 'generate: ' . implode(' ', $cmd) . "\n");

$proc = proc_open($cmd, [1 => STDOUT, 2 => STDERR], $pipes);
if (!is_resource($proc)) {
    fwrite(STDERR, "generate: could not start the generator. Is `{$policy['generatorCommand']}` on PATH? It needs Java.\n");
    exit(1);
}
$code = proc_close($proc);
if ($code !== 0) {
    fwrite(STDERR, "generate: the generator exited {$code}. See its output above.\n");
    exit($code);
}
