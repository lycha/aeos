# Tooling: Generating TypeScript from an OpenAPI spec

Enforcement tooling for **Principle IV - Generators build the scaffold, agents write the logic.**
A human owns `openapi.yaml`; this generates the TypeScript the agent is not allowed to hand-write
(DTOs and runtime validators), and fails the build the moment the contract contains a construct the
project has not accounted for.

This is a **copyable scaffold**, not a package: drop the files into a project and edit one policy
file. Nothing here is framework-specific; the project-specific decisions live in
[`scripts/openapi.policy.mjs`](scripts/openapi.policy.mjs).

## What it produces

From `openapi.yaml`, via [`@hey-api/openapi-ts`](https://heyapi.dev):

- `generated/api/types.gen.ts` - DTOs shared by handlers and UI.
- `generated/api/zod.gen.ts` - runtime validators for the boundary.
- `generated/api/index.ts` - barrel.

Optionally (see [Operations registry and adapters](#operations-registry-and-adapters)):

- `generated/api/operations.gen.ts` - a typed `OperationDefinition` per operationId, binding the
  validators above to each operation's method, path, statuses and content types.
- plus any framework files an adapter emits (e.g. Fastify's `handler-stubs.ts`).

The output is generated, so it is `.gitignore`d and never hand-edited.

## Why it is more than running hey-api

Three disciplines turn "we generate types" into something that actually enforces the principle. All
three live in the core generator; you do not edit it.

1. **The emitter is pinned.** A generator's output is an input to everything downstream, and its
   output shape changes between releases. The core holds the installed hey-api version against
   `verifiedHeyApi` in the policy and refuses to run against a different minor until you re-verify
   and bump it. Bumping the dependency alone does not silently retype your app.
2. **No silent no-op.** hey-api exits `0` and writes zero files when its plugin list is
   misconfigured. A green install with no generated code surfaces much later as missing-module
   errors pointing nowhere near the cause, so the core checks the files exist and are non-empty.
3. **An unmodelled construct breaks the build.** Every key of the document, each path item,
   operation, response, request body and parameter is walked against the policy's allow-lists. A
   key on neither the allow-list nor the refusal list fails the build with a message that offers the
   two deliberate ways out: *model it* or *refuse it*. A green build for a construct nothing serves
   (a per-operation auth scheme the server ignores, a response header it can never send) ships the
   endpoint anyway and hides the gap - worse than a red build. Value-level checks (`policy.checks`)
   then run per operation.

## Install

Copy into your project root:

```
openapi-ts.config.ts
scripts/generate-openapi-types.mjs
scripts/openapi.policy.mjs
scripts/emit-operations.mjs          # only if you want operations.gen.ts
scripts/generate-operations.mjs      # the standalone `generate-operations` command
scripts/adapters/                    # the framework adapters you use
```

Merge [`package.snippet.json`](package.snippet.json) into `package.json` (scripts + deps), then:

```bash
npm install
npm run generate-api-types
```

Add `generated/` to `.gitignore`. The `pre*` hooks in the snippet make `dev`, `build`, `test` and
`typecheck` regenerate first, so no workflow ever runs against a stale contract - and a CI job that
runs `npm run typecheck` is enough to enforce the whole thing.

## Extending it - the policy file

[`scripts/openapi.policy.mjs`](scripts/openapi.policy.mjs) is the only file you edit. It exports:

| Export | What it controls |
|---|---|
| `spec`, `out` | Where the contract is and where code goes (keep in step with `openapi-ts.config.ts`). |
| `verifiedHeyApi` | The hey-api `major.minor` this policy is verified against. |
| `allow` | Keys permitted on each object type. A key not here is refused or breaks the build. |
| `refuse` | Keys you have decided your runtime cannot serve, each with the reason as the constraint. |
| `checks` | Value-level per-operation checks (ordinary functions that throw). Defaults cover a usable operationId, a 2xx, no 1xx/3xx, no `in: cookie`. |
| `afterGenerate` | Optional hook that runs once both passes have passed. The bundled operations emitter is wired here. |

When you decide to serve something currently refused, the move is always: honour it in your code,
then move the key from `refuse` to `allow` (or delete the check) in the same change. The refusal
list is a record of deliberate decisions, not a backlog.

## Operations registry and adapters

Turning on the operations registry emits `operations.gen.ts`: one `OperationDefinition` per
operationId that binds the generated Zod validators to the operation's method, path, declared
statuses and request content types. A handler can then be typed against its operation instead of
re-stating any of it. The registry is **framework-agnostic** - everything in it is derived from the
spec plus the generated validator names.

Two npm commands produce it:

- **`npm run generate-api-types`** — the full pipeline: types + validators + conformance + the
  operations registry. This is what the `pre*` hooks and CI run.
- **`npm run generate-operations`** — just the registry (and any adapter files), against the types
  already generated. Use it to iterate on the registry or an adapter without re-running hey-api; it
  runs the same conformance pass first, and errors clearly if the types are not generated yet.

  Pick the adapter at the command line (overrides whatever the policy wires):

  ```bash
  npm run generate-operations -- --adapter next      # Next.js App Router (routeFile per path)
  npm run generate-operations -- --adapter fastify   # fastify-openapi-glue (operationId + stubs)
  npm run generate-operations -- --adapter none       # portable registry, no framework fields
  ```

  Per-adapter options: `--app-dir <dir>` and `--enforce-route-files` (next); `--stubs-file <name>`
  and `--no-stubs` (fastify). With no `--adapter`, the policy's own wiring is used. Switching
  adapters rewrites `operations.gen.ts`; a file a previous adapter emitted (e.g. Fastify's
  `handler-stubs.ts`) is not auto-removed, so delete it if you switch away.

Framework-specific behaviour comes from an **adapter**, which is the extension point. It is wired in
the policy:

```js
import { operationsEmitter } from "./emit-operations.mjs";
import { nextAppRouter } from "./adapters/next-app-router.mjs";

export const afterGenerate = operationsEmitter({ adapter: nextAppRouter() });
```

### Bundled adapters

- **`nextAppRouter({ appDir?, enforceRouteFiles?, isImplemented? })`** - adds a `routeFile` to each
  entry (`/payments/{id}` → `app/payments/[id]/route.ts`) and, with `enforceRouteFiles: true`, fails
  the build when a declared operation's route file is missing (pair it with `isImplemented` so
  unbuilt operations are skipped). This is how a handler bound to the wrong path is caught.
- **`fastify({ stubsFile?, emitStubs? })`** - for apps wired with
  [`fastify-openapi-glue`](https://github.com/seriousme/fastify-openapi-glue), which resolves routes
  by operationId at runtime rather than by file. Adds a `fastifyPath` (`:id` syntax) and emits
  `handler-stubs.ts`: the `OperationId` union plus a 501 problem+json stub per operation, spread
  first in the service so an unimplemented operation returns a clean 501 instead of glue's generic
  500.

### Writing your own adapter

An adapter is a plain object; every field is optional:

```js
export function myFramework(opts = {}) {
  return {
    name: "my-framework",
    fields(op) { return { /* literal fields merged into each registry entry */ }; },
    typeFields: [{ name: "routeKey", tsType: "string" }], // their TS members on OperationDefinition
    emit(ctx) { /* write extra files; ctx has { doc, outDir, operations, entries, zodExports, repoRoot } */ },
    check(op, ctx) { /* throw to fail the build - a per-operation conformance check */ },
  };
}
```

`op` is `{ operationId, method, path, operation, parameters, requestBody }`. Pass no adapter at all
(`operationsEmitter()`) for the portable registry alone.

### Worked reference

StandIn's generator is this pattern taken all the way: its operations emitter is a Next App Router
adapter with the route-file conformance always on (gated by an `x-implemented` flag), and its
allow-lists carry app-specific refusals ("a per-operation `security` cannot change what
`contractRoute` checks"). See `scripts/contracts/generate-api-contracts.mjs` in the StandIn
repository for the fully-extended form. The Fastify adapter is modelled on
[`edugo-payments-service`](https://github.com/lycha/edugo-payments-service).

## Testing the core

`assertHeyApiVersion` and `walkSpec` (in `generate-openapi-types.mjs`) and `buildRegistry` /
`renderRegistry` (in `emit-operations.mjs`) are exported pure functions - feed them a parsed spec or
operation list and assert on the output or the `ConformanceError` message. The message *is* the
product of a build-time guard, so test its wording.
