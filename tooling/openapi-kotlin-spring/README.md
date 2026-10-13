# Tooling: Generating Kotlin/Spring from an OpenAPI spec

Enforcement tooling for **Principle IV — Generators build the scaffold, agents write the logic**,
for a **Kotlin + Spring Boot** stack. A human owns `openapi.yaml`; this generates the server-side
Kotlin the agent is not allowed to hand-write (the `@RestController` API *interfaces* and the DTO
models), and fails the build the moment the contract contains a construct the project has not
accounted for.

It is the Gradle/kotlin-spring sibling of [`../openapi-typescript`](../openapi-typescript), and it
mirrors how a production Kotlin/Spring service does contract-first generation (the
`org.openapi.generator` `kotlin-spring` task with `interfaceOnly`, `useTags`, UPPERCASE enums).

Unlike the TypeScript scaffold (a copyable file set), this is a **runnable Gradle project**: the
pieces stand alone here so `./gradlew generateApi` works end to end. To use it in a real service you
copy two files and merge a snippet — see **Install** below.

## What it produces

From `examples/openapi.yaml`, via the `kotlin-spring` generator (`interfaceOnly=true`):

- `build/generated/src/main/kotlin/<apiPackage>/*Api.kt` — one `@RestController interface` per tag;
  you write the `@Component` that implements each. You never edit the interface.
- `build/generated/src/main/kotlin/<modelPackage>/*.kt` — DTOs and enums (UPPERCASE constants).
- Support files (`ApiUtil`, `Exceptions`, an enum converter config).

A committed **reference copy** of that output lives in [`examples/generated/`](examples/generated)
so you can read the shape without running anything. `build/` itself is generated and gitignored.

## Why it is more than running openapi-generator

Three disciplines, all in the reusable verifier ([`scripts/verify-contract.gradle`](scripts/verify-contract.gradle)) —
you do not edit it:

1. **The emitter is pinned.** A generator's output is an input to everything downstream, and its
   output shape changes between releases. The verifier reads the version the generator stamped into
   `build/generated/.openapi-generator/VERSION` and refuses to pass unless it equals
   `pinnedGeneratorVersion` in the policy. Bumping the plugin id alone — without regenerating,
   reading the diff and moving the pin in the same change — fails.
2. **No silent no-op.** A misconfigured generator can exit `0` having written nothing useful. A
   green build with no API interfaces surfaces much later as a wall of "unresolved reference"
   errors pointing nowhere near the cause, so the verifier checks the files exist and are non-empty.
3. **An unmodelled construct breaks the build.** Every key of the document, each path item,
   operation, response, request body and parameter is walked against the policy's allow-lists. A key
   on neither the allow-list nor the refusal list fails the build with a message offering the two
   deliberate ways out: *model it* or *refuse it*. Value-level checks (`policy.checks`) then run per
   operation — here: a usable `operationId`, exactly one tag (so each operation lands on its tagged
   interface, never `DefaultApi`), a 2xx response, and no 1xx/3xx.

## Run it here

```bash
./gradlew generateApi      # generateApiServer + verifyContract
```

Expected tail:

```
verifyContract: build/generated is current - 4 operations, 3 API interfaces, 8 models, emitter 7.26.0.
BUILD SUCCESSFUL
```

Requires a JDK that the pinned Gradle (`gradle/wrapper/gradle-wrapper.properties`) supports; the
wrapper downloads Gradle and resolves the generator plugin on first run.

## Install (into a real Spring Boot project)

Copy into your project:

```
openapi-policy.gradle
scripts/verify-contract.gradle
```

Merge [`build.gradle.snippet`](build.gradle.snippet) into your `build.gradle` (buildscript classpath,
plugin, the two `apply from`, the generate task, and the `compileKotlin` gate), point `spec` in
`openapi-policy.gradle` at your contract, then:

```bash
./gradlew generateApi
```

The snippet also wires `compileKotlin.dependsOn verifyContract` and adds the generated dir to the
Kotlin source set, so no workflow ever compiles against a stale or unverified contract — a CI job
that runs `build` is enough to enforce the whole thing. Add a second generate task for an admin
spec if you serve one (one task per contract).

## Extending it — the policy file

[`openapi-policy.gradle`](openapi-policy.gradle) is the only file you edit. It exports a single
`ext.openapiPolicy` map:

| Key | What it controls |
|---|---|
| `spec`, `out` | Where the contract is and where code goes. |
| `pinnedGeneratorVersion` | The generator `major.minor.patch` this policy is verified against. Keep in step with the plugin id in `build.gradle`. |
| `configOptions` | Passed verbatim to the `kotlin-spring` generator (packages, `interfaceOnly`, `useTags`, enum naming, …). |
| `allow` | Keys permitted on each object type. A key not here is refused or breaks the build. |
| `refuse` | Keys you have decided your runtime cannot serve, each with the reason as the constraint. |
| `checks` | Value-level per-operation closures that throw to fail the build. |

When you decide to serve something currently refused, the move is always: honour it in your
`@RestController`, then move the key from `refuse` to `allow` (or delete the check) in the same
change. The refusal list is a record of deliberate decisions, not a backlog.

## Notes on version & Spring Boot 3 (jakarta)

- Many existing services still pin `org.openapi.generator` **6.0.1** on Gradle 7.6. This scaffold
  pins a current **7.26.0** on Gradle 9.x so it runs on a modern JDK. The version pin is the single
  knob you re-verify on a bump — which is the whole point of discipline (1).
- The generated models here import `javax.validation.*` (the generator default, matching the 6.0.1
  era). For a Spring Boot 3 service you want `jakarta.*`: add `useSpringBoot3: "true"` to
  `configOptions` and regenerate. The reference output would change accordingly.
