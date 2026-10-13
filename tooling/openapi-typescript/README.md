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
| `afterGenerate` | Optional hook to emit project-specific files (e.g. a typed route registry) once both passes have passed. |

When you decide to serve something currently refused, the move is always: honour it in your code,
then move the key from `refuse` to `allow` (or delete the check) in the same change. The refusal
list is a record of deliberate decisions, not a backlog.

### Worked reference

StandIn's generator is this pattern taken all the way: its `afterGenerate` equivalent emits a typed
route registry (`operations.gen.ts`) that binds each handler to its operation, and its allow-lists
carry app-specific refusals ("a per-operation `security` cannot change what `contractRoute` checks").
See `scripts/contracts/generate-api-contracts.mjs` in the StandIn repository for the fully-extended
form.

## Testing the core

`assertHeyApiVersion` and `walkSpec` are exported pure functions - feed `walkSpec` a parsed spec and
a policy and assert on the `ConformanceError` message. The message *is* the product of a build-time
guard, so test its wording.
