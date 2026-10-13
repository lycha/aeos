# Research: contract-first OpenAPI → PHP/Laravel tooling

Does the PHP/Laravel ecosystem already have what `tooling/openapi-typescript` and
`tooling/openapi-kotlin-spring` implement — **spec-first generation of server code, with build-time
enforcement** (pin the generator, no silent no-op, a conformance gate that refuses unmodelled
constructs)?

**Short answer.** The pieces all exist, but fragmented across separate packages, and **no single one
bundles the full Principle IV enforcement**. The cleanest path is also the most direct: the official
`openapi-generator` we already use ships a **`php-laravel`** server generator, so our pattern ports
almost 1:1 — which is exactly what [`openapi-php-laravel/`](openapi-php-laravel) now does.

_Researched 2026-10-13._

## The landscape

### A. Same engine, Laravel target (closest to ours)
- **`openapi-generator` `php-laravel`** server generator (plus `php-lumen`) — listed under SERVER with
  no experimental tag. Our exact pattern (generator + editable policy + a `verify` step) reproduces
  directly; only the invocation (Composer script) and the stack-specific policy checks change.
  <https://openapi-generator.tech/docs/generators/>

### B. Laravel-native spec-first generators
- **`ensi/laravel-openapi-server-generator`** — most mature. `artisan openapi:generate-server` emits
  controllers, form requests, policies, tests; leaves existing files alone. Laravel 9–12 (v4.0.5).
  <https://packagist.org/packages/ensi/laravel-openapi-server-generator>
- **`codewithagents/openapi-laravel`** — closest *in spirit*: generates `spatie/laravel-data` classes
  with spec-derived `rules()`, native enums, **one abstract controller per tag**, and a routes file
  (parallels kotlin-spring `interfaceOnly` + `useTags`). Has an `openapi:check` that regenerates
  in-memory and compares **byte-for-byte** against committed files (our "reference output is
  identical" check) — but mostly *warns* rather than *fails* on unsupported constructs, and is young
  (3★, 0.x, PHP 8.2+, laravel-data v4). <https://github.com/codewithagents/openapi-laravel>
- **`gcob/lara-spec-first`** — spec-first routing + `501` stubs + a `spec:doctor` that reports what it
  will/won't honour; very early (1★, v0.1.0, Laravel 12/13).
  <https://packagist.org/packages/gcob/lara-spec-first>
- Also-rans: **`laravel-openapi/codegen`** (routes/requests/controllers, last release 2024),
  **`maxbeckers/php-openapi-generator`** (multi-target, implement generated `*ApiInterface`).
  <https://packagist.org/packages/laravel-openapi/codegen> ·
  <https://packagist.org/packages/maxbeckers/php-openapi-generator>

### C. The "conformance / enforcement" half (contract validation)
- **`league/openapi-psr7-validator`** — runtime request/response validation against the spec
  (PSR-7/15 middleware). <https://root.packagist.org/packages/league/openapi-psr7-validator/dependents>
- **`kentaroutakeda/laravel-openapi-validator`** — Laravel runtime middleware built on the league
  validator. <https://root.packagist.org/packages/kentaroutakeda/laravel-openapi-validator>
- **`kirschbaum-development/laravel-openapi-validator`** (test-time trait) and **`spurjobs/spectator`**
  (contract testing; v3 tracks which spec operations tests exercise).
  <https://kirschbaumdevelopment.com/insights/laravel-openapi-validator> ·
  <https://packagist.org/packages/spurjobs/spectator>

### D. Cultural caveat
The dominant Laravel practice is **code-first** — generate docs *from* code with **Scramble (dedoc)**
or L5-Swagger annotations — the opposite direction from spec-first. So spec-first-with-enforcement is
a minority approach in Laravel; nothing is a drop-in equal of our tool.
<https://scramble.dedoc.co/how-it-works>

## The gap

No package combines **emitter-pinning + no-silent-no-op + a build-failing conformance walk**. The
nearest existing art is `codewithagents/openapi-laravel` (byte-for-byte drift check, deterministic
output, per-tag controller + `spatie/laravel-data` `rules()`), but it is 0.x and warns rather than
fails on unmodelled constructs.

## What we built

[`openapi-php-laravel/`](openapi-php-laravel) — the PHP/Composer sibling of the other two scaffolds:
`openapi-generator -g php-laravel` behind the same editable-policy (`openapi-policy.php`) + reusable
verifier (`scripts/verify-contract.php`) split, run via `composer generate-api`. For runtime
enforcement in a real app it pairs naturally with `league/openapi-psr7-validator`; for the generated
DTO shape, `codewithagents/openapi-laravel` is the nearest art to borrow from.

## Sources

- openapi-generator generators list — <https://openapi-generator.tech/docs/generators/>
- ensi/laravel-openapi-server-generator — <https://packagist.org/packages/ensi/laravel-openapi-server-generator>
- codewithagents/openapi-laravel — <https://github.com/codewithagents/openapi-laravel>
- gcob/lara-spec-first — <https://packagist.org/packages/gcob/lara-spec-first>
- laravel-openapi/codegen — <https://packagist.org/packages/laravel-openapi/codegen>
- maxbeckers/php-openapi-generator — <https://packagist.org/packages/maxbeckers/php-openapi-generator>
- league/openapi-psr7-validator — <https://root.packagist.org/packages/league/openapi-psr7-validator/dependents>
- kentaroutakeda/laravel-openapi-validator — <https://root.packagist.org/packages/kentaroutakeda/laravel-openapi-validator>
- kirschbaum laravel-openapi-validator — <https://kirschbaumdevelopment.com/insights/laravel-openapi-validator>
- spurjobs/spectator — <https://packagist.org/packages/spurjobs/spectator>
- Scramble (dedoc) — <https://scramble.dedoc.co/how-it-works>
