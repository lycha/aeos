<?php

declare(strict_types=1);

// OpenAPI -> PHP/Laravel generation policy.
//
// THIS IS THE FILE YOU EDIT. The verifier (scripts/verify-contract.php) is the reusable core and
// should not need changing; this file is where a project says what it serves.
//
// It encodes Principle IV ("Generators build the scaffold, agents write the logic") and the
// enforcement rule that makes it real: an OpenAPI construct the project has not accounted for
// BREAKS THE BUILD, it is never silently ignored. A green build for a construct nothing serves
// ships the endpoint anyway and hides the gap, which is worse than a red one.
//
// Every key in `allow`/`refuse` is one of three things, recorded here rather than inferred:
//   - allowed  - the generator/your code honours it, or it is purely documentary (safe).
//   - refused  - your runtime cannot serve it; the reason names the CONSTRAINT, not the key.
//   - neither  - a key named in neither list fails the build with the generic message.

return [

    // Where the contract is, and where generated code goes. Paths are relative to this scaffold.
    'spec' => 'examples/openapi.yaml',
    'out'  => 'build/generated',

    // The openapi-generator CLI the generate step invokes. It needs Java on PATH. Override with the
    // OPENAPI_GENERATOR_CMD env var (e.g. "npx @openapitools/openapi-generator-cli", or a jar wrapper).
    'generatorCommand' => getenv('OPENAPI_GENERATOR_CMD') ?: 'openapi-generator-cli',
    'generatorName'    => 'php-laravel',

    // The openapi-generator version this policy was verified against.
    //
    // The verifier reads the version the generator stamped into build/generated/.openapi-generator/VERSION
    // and refuses to pass unless it equals this. Bumping the generator alone - without regenerating,
    // reading the diff and moving this pin in the same change - is what fails. A generator's output is
    // an input to everything downstream, and its output shape changes between releases.
    'pinnedGeneratorVersion' => '7.26.0',

    // Passed to the php-laravel generator as --additional-properties. The default invokerPackage is
    // OpenAPI\Server (used by the committed reference output). In a real app set it to your namespace,
    // e.g. 'App\\Generated' - generate.php passes it as a non-shell argument, so backslashes are safe.
    'configOptions' => [
        'invokerPackage'           => 'OpenAPI\\Server',
        'variableNamingConvention' => 'camelCase',
    ],

    // `x-*` extensions are allowed everywhere (documentary); set to false to force each through the lists.
    'allowExtensions' => true,

    // Keys permitted on each object type. A key here is allowed; anything else is refused (if it
    // appears in `refuse`) or breaks the build with the generic message.
    'allow' => [
        'document'    => ['openapi', 'info', 'servers', 'security', 'tags', 'paths', 'components', 'externalDocs'],
        'pathItem'    => ['get', 'put', 'post', 'delete', 'patch', 'options', 'head', 'trace', 'parameters', 'summary', 'description', 'servers'],
        'operation'   => ['operationId', 'parameters', 'requestBody', 'responses', 'summary', 'description', 'tags', 'externalDocs', 'deprecated', 'security'],
        'response'    => ['description', 'content'],
        'requestBody' => ['content', 'required', 'description'],
        'parameter'   => ['name', 'in', 'required', 'schema', 'description', 'deprecated', 'example', 'examples'],
    ],

    // Keys you have met and decided your runtime cannot serve. The value is the reason, phrased as the
    // constraint. Move a key to `allow` (or delete the matching check) once you model it.
    'refuse' => [
        'document' => [
            'webhooks' =>
                'A root `webhooks:` block (OpenAPI 3.1) declares operations the CLIENT serves. The php-laravel '
                . 'server generator emits nothing that dispatches them, so they would be a contract promise no '
                . 'handler keeps. Model webhook handling and allow it, or remove the block.',
        ],
        'pathItem' => [
            '$ref' =>
                'A $ref\'d path item hides its operations behind indirection the generator does not follow into '
                . 'generated interfaces. Inline the path item so every operation is visible.',
        ],
        'operation' => [
            'callbacks' =>
                'A `callbacks` object describes a request the SERVER later makes to the client. The server generator '
                . 'does not emit or dispatch those, so the document would describe traffic that does not exist.',
        ],
        'response' => [
            'headers' =>
                'A declared response header is not surfaced as a typed return on the generated *ApiInterface (methods '
                . 'return the body model union). It can only be set by hand in the controller, so a generated client '
                . 'would wait for a header the signature never promises. Set it in your impl and allow this, or drop it.',
            'links' =>
                'A `links` object tells a client how to build a follow-up call from this response. Nothing generates or '
                . 'verifies them here, so they are a promise the code does not keep.',
        ],
        'requestBody' => [],
        'parameter' => [
            'content' =>
                'A parameter with `content:` (a serialised media type in the parameter) is not bound as a plain typed '
                . 'value by the generator. Use `schema:`.',
        ],
    ],

    // Value-level checks the shape lists cannot catch. Each is a callable taking one operation
    // ['method','path','operationId','operation'] and throwing (with a clear message) to fail the build.
    'checks' => [

        // The generated interface method is named from operationId, so it must be a usable PHP identifier.
        static function (array $op): void {
            $id = $op['operationId'] ?? null;
            if (!$id) {
                throw new RuntimeException("{$op['method']} {$op['path']} has no operationId. The generated interface method is named from it.");
            }
            if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', (string) $id)) {
                throw new RuntimeException("{$op['method']} {$op['path']} has operationId \"{$id}\", which is not a usable PHP identifier. Use a camelCase verb-noun.");
            }
        },

        // php-laravel groups operations into one *ApiInterface per tag; an untagged operation lands on a
        // catch-all DefaultApiInterface, which is never what a tagged contract intends.
        static function (array $op): void {
            $tags = $op['operation']['tags'] ?? [];
            if (!is_array($tags) || count($tags) === 0) {
                throw new RuntimeException("{$op['operationId']} declares no tag. php-laravel puts each operation on the *ApiInterface named by its tag; an untagged operation is dumped onto DefaultApiInterface. Give it exactly one tag.");
            }
        },

        // Every operation returns something: at least one 2xx response.
        static function (array $op): void {
            $codes = array_map('strval', array_keys($op['operation']['responses'] ?? []));
            if (!array_filter($codes, static fn ($c) => preg_match('/^2\d\d$/', $c))) {
                throw new RuntimeException("{$op['operationId']} declares no 2xx response. Every operation returns something.");
            }
        },

        // 1xx/3xx responses get no generated body model here; refuse them unless you model them.
        static function (array $op): void {
            $codes = array_map('strval', array_keys($op['operation']['responses'] ?? []));
            $bad = array_values(array_filter($codes, static fn ($c) => preg_match('/^[13]\d\d$/', $c)));
            if ($bad) {
                throw new RuntimeException("{$op['operationId']} declares " . implode(', ', $bad) . '. Informational/redirect statuses get no generated model here; model a null-body/redirect path and remove this check, or drop them.');
            }
        },
    ],
];
