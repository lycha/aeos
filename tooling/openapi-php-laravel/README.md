# Tooling: Generating PHP/Laravel from an OpenAPI spec

Enforcement tooling for **Principle IV — Generators build the scaffold, agents write the logic**,
for a **PHP + Laravel** stack. A human owns `openapi.yaml`; this generates the server-side PHP the
agent is not allowed to hand-write (the `*ApiInterface` per tag and the `Model/` DTOs), and fails
the build the moment the contract contains a construct the project has not accounted for.

It is the PHP/Composer sibling of [`../openapi-typescript`](../openapi-typescript) and
[`../openapi-kotlin-spring`](../openapi-kotlin-spring), and it uses the **same engine** — the
`openapi-generator` `php-laravel` server generator — behind the same editable-policy + reusable-verifier
split.

## What it produces

From `examples/openapi.yaml`, via the `php-laravel` generator:

- `build/generated/Api/*ApiInterface.php` — one interface per tag, each operation a typed method
  (body-model union return). You write the controller that implements it; you never edit the interface.
- `build/generated/Model/*.php` — DTOs and native PHP backed enums (UPPERCASE cases).
- `build/generated/Http/Controllers/*.php` + `routes.php` — thin glue you own.

A committed **reference copy** of that output lives in [`examples/generated/`](examples/generated)
so you can read the shape without running anything. `build/` itself is generated and gitignored.

## Why it is more than running openapi-generator

Three disciplines, all in the reusable verifier ([`scripts/verify-contract.php`](scripts/verify-contract.php)) —
you do not edit it:

1. **The emitter is pinned.** The verifier reads the version the generator stamped into
   `build/generated/.openapi-generator/VERSION` and refuses to pass unless it equals
   `pinnedGeneratorVersion` in the policy. Bumping the generator alone — without regenerating,
   reading the diff and moving the pin in the same change — fails. A generator's output is an input
   to everything downstream, and its output shape changes between releases.
2. **No silent no-op.** A misconfigured generator can exit `0` having written nothing useful. A green
   build with no `*ApiInterface` surfaces much later as a wall of "class not found" errors pointing
   nowhere near the cause, so the verifier checks the files exist and are non-empty.
3. **An unmodelled construct breaks the build.** Every key of the document, each path item, operation,
   response, request body and parameter is walked against the policy's allow-lists. A key on neither
   the allow-list nor the refusal list fails the build with a message offering the two deliberate ways
   out: *model it* or *refuse it*. Value-level checks (`policy.checks`) then run per operation — here:
   a usable `operationId`, exactly one tag (so each operation lands on its tagged interface, never
   `DefaultApiInterface`), a 2xx response, and no 1xx/3xx.

## Run it

```bash
composer install          # brings in symfony/yaml for the conformance walk
composer generate-api     # generate + verify-contract
```

Expected tail:

```
verify-contract: build/generated is current - 4 operations, 3 API interfaces, 8 models, emitter 7.26.0.
```

Requirements: PHP 8.1+, Composer, and the `openapi-generator` CLI on PATH (it needs Java). If you do
not have the CLI installed globally, set `OPENAPI_GENERATOR_CMD="npx @openapitools/openapi-generator-cli"`
and the generate step will use that instead.

## Install (into a real Laravel project)

Copy into your project (root, or a dedicated package):

```
openapi-policy.php
scripts/generate.php
scripts/verify-contract.php
```

Merge [`composer.snippet.json`](composer.snippet.json) into your `composer.json` (the `symfony/yaml`
dev dependency and the three scripts), point `spec`/`out` in `openapi-policy.php` at your paths, set
`invokerPackage` to your namespace (e.g. `App\\Generated`), then:

```bash
composer generate-api
```

Run `composer generate-api` in CI before your build/test step, and PSR-4 autoload the generated
namespace, so nothing ever runs against a stale or unverified contract. Add a second policy + generate
call for an admin spec if you serve one (one call per contract).

## Extending it — the policy file

[`openapi-policy.php`](openapi-policy.php) is the only file you edit. It returns one array:

| Key | What it controls |
|---|---|
| `spec`, `out` | Where the contract is and where code goes. |
| `generatorCommand`, `generatorName` | How the generator is invoked (override the command via `OPENAPI_GENERATOR_CMD`). |
| `pinnedGeneratorVersion` | The generator version this policy is verified against. |
| `configOptions` | Passed to `php-laravel` as `--additional-properties` (namespace, naming, …). |
| `allow` | Keys permitted on each object type. A key not here is refused or breaks the build. |
| `refuse` | Keys you have decided your runtime cannot serve, each with the reason as the constraint. |
| `checks` | Value-level per-operation callables that throw to fail the build. |

When you decide to serve something currently refused, the move is always: honour it in your
controller, then move the key from `refuse` to `allow` (or delete the check) in the same change. The
refusal list is a record of deliberate decisions, not a backlog.

## Notes

- **Verifier not executed in this repo's authoring environment.** The committed reference output under
  `examples/generated/` was produced by `openapi-generator 7.26.0` (the pinned version) with this
  policy's settings, so it is faithful. The PHP verifier itself (`scripts/verify-contract.php`) was
  authored but not run here — run `composer generate-api` in any PHP 8.1+/Composer environment to
  exercise it end to end.
- The committed reference uses the generator's default namespace `OpenAPI\Server` (consistent across
  `Api/`, `Model/`, `Http/Controllers/`). Set `invokerPackage` in the policy to your own namespace for
  a real app; the output changes accordingly.
