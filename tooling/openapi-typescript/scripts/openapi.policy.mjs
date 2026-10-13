// OpenAPI -> TypeScript generation policy.
//
// THIS IS THE FILE YOU EDIT. The generator (generate-openapi-types.mjs) is the reusable
// core and should not need changing; this file is where a project says what it serves.
//
// It encodes Principle IV ("Generators build the scaffold, agents write the logic") and the
// enforcement rule that makes it real: an OpenAPI construct the project has not accounted for
// BREAKS THE BUILD, it is never silently ignored. A green build for a construct nothing serves
// ships the endpoint anyway and hides the gap, which is worse than a red one.
//
// Every key below is one of three things, recorded here rather than inferred:
//   - allowed     - the generator/your code honours it, or it is purely documentary (safe).
//   - refused     - your runtime cannot serve it; the reason names the CONSTRAINT, not the key,
//                   so the next reader knows "why not, and what would it take".
//   - neither     - a key named in neither list fails the build with the generic message.

import { operationsEmitter } from "./emit-operations.mjs";
import { nextAppRouter } from "./adapters/next-app-router.mjs";
// import { fastify } from "./adapters/fastify.mjs";

/** Where the contract is, and where generated code goes. Paths are repo-relative. */
export const spec = "openapi.yaml";
export const out = "generated/api";

/**
 * The @hey-api/openapi-ts version this policy was verified against (major.minor).
 * The generator refuses to run against a different minor until you re-verify and bump this,
 * because a generator's output is an input to everything downstream and its behaviour changes
 * between releases. See the README, "Pinning the emitter".
 */
export const verifiedHeyApi = "0.99";

/**
 * Allow `x-*` specification extensions without listing each one. Extensions are project-defined
 * and usually documentary (read by review tooling, not served). Set false to force every
 * extension key through the allow-lists below, as the strictest setups do.
 */
export const allowExtensions = true;

/** Keys permitted on each object type. A key here is allowed; anything else is refused or breaks the build. */
export const allow = {
  document: [
    "openapi", "info", "jsonSchemaDialect", "tags", "externalDocs",
    "servers", "security", "paths", "components",
  ],
  pathItem: ["get", "put", "post", "delete", "patch", "options", "head", "trace", "parameters", "summary", "description"],
  operation: ["operationId", "parameters", "requestBody", "responses", "summary", "description", "tags", "externalDocs", "deprecated"],
  response: ["description", "content"],
  requestBody: ["content", "required", "description"],
  parameter: ["name", "in", "required", "schema", "description", "deprecated", "example", "examples"],
};

/**
 * Keys you have met and decided your runtime cannot serve. The value is the reason, phrased as
 * the constraint. Delete an entry (and add the key to `allow` above) once you model it.
 *
 * The defaults below are the common ones. They are written generically; sharpen the wording to
 * your stack, or remove any you do serve.
 */
export const refuse = {
  document: {
    webhooks:
      "A root `webhooks:` block declares operations the CLIENT serves. Most backends register " +
      "handlers from routes they own, so a declared webhook maps to no handler and would generate " +
      "types nothing dispatches. Model webhook handling and allow it, or remove the block.",
  },
  pathItem: {
    servers:
      "A path-level `servers` override changes the origin this path is served from. If every route " +
      "is mounted at one origin derived from the path, the document would name a host nothing listens on.",
    $ref:
      "A $ref'd path item hides its operations behind indirection the generator does not follow. " +
      "Inline the path item so every operation is visible.",
  },
  operation: {
    security:
      "A per-operation `security` only means something if your request layer can select a credential " +
      "model per operation. If it applies one model unconditionally, a per-operation value publishes an " +
      "auth scheme the server does not honour. Give your request layer a credential branch and allow this, " +
      "or state the one model once at the document level.",
    servers: "A per-operation `servers` override changes the origin this operation is served from; most routers mount at the path alone.",
    callbacks:
      "A `callbacks` object describes a request the SERVER later makes to the client. Unless you generate " +
      "and dispatch those, the document describes traffic that does not exist.",
  },
  response: {
    headers:
      "A declared response header can only be honoured if your response layer can set arbitrary headers " +
      "AND a handler supplies the values. If responses are serialised as body+status alone, the header can " +
      "never be sent and a generated client would wait for it.",
    links:
      "A `links` object tells a client how to build a follow-up call from this response. Nothing generates " +
      "or verifies them here, so they are a promise the code does not keep.",
  },
  requestBody: {},
  parameter: {
    content:
      "A parameter with `content:` (a serialised media type in the URL) is not validated as a plain string. " +
      "Use `schema:`.",
    style: "`style`/`explode` describe URL/header serialisation. If your request layer implements only the defaults (form+explode for query, simple for header), any other value is declared and not honoured.",
    explode: "See `style` - one decision, and the default is what is implemented.",
    allowReserved: "`allowReserved` is usually not observable once the URL is decoded by the framework.",
    allowEmptyValue: "Deprecated in OpenAPI 3.1 with unspecified behaviour. Model it with a schema that accepts an empty string instead.",
  },
};

// --------------------------------------------------------------------------------------------
// Value-level checks. The allow-lists above check the SHAPE of the spec (which keys appear);
// these check VALUES the shape cannot catch. Each receives one operation and throws (with a
// clear message) to fail the build. Edit, remove, or add your own - they are ordinary functions.
// `op` = { method, path, operationId, operation }.
// --------------------------------------------------------------------------------------------

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** The generated DTO/validator names are derived from operationId, so it must be a usable identifier. */
export function operationIdIsUsable(op) {
  if (!op.operationId) {
    throw new Error(`${op.method} ${op.path} has no operationId. Types are named from it and handlers bind to it.`);
  }
  if (!IDENTIFIER.test(op.operationId)) {
    throw new Error(`${op.method} ${op.path} has operationId "${op.operationId}", which is not a usable JS identifier (it is emitted as an export). Use a camelCase verb-noun.`);
  }
}

/** Every operation returns something: at least one 2xx response. */
export function declaresSuccess(op) {
  const codes = Object.keys(op.operation.responses ?? {});
  if (!codes.some((c) => /^2\d\d$/.test(c))) {
    throw new Error(`${op.operationId} declares no 2xx response. Every operation returns something.`);
  }
}

/** 1xx/3xx responses have no generated schema in this pipeline; refuse them unless you model them. */
export function noInformationalOrRedirect(op) {
  const bad = Object.keys(op.operation.responses ?? {}).filter((c) => /^[13]\d\d$/.test(c));
  if (bad.length) {
    throw new Error(`${op.operationId} declares ${bad.join(", ")}. Informational/redirect statuses get no generated schema here; model a null-body/redirect path and remove this check, or drop them.`);
  }
}

/** hey-api emits nothing for `in: cookie`, so a cookie parameter would be silently unread. */
export function noCookieParameters(op) {
  const params = [...(op.operation.parameters ?? [])];
  if (params.some((p) => p && p.in === "cookie")) {
    throw new Error(`${op.operationId} declares an 'in: cookie' parameter, which the generator emits nothing for - it would be accepted without the value. Read cookies in your request layer and remove this check, or drop the parameter.`);
  }
}

export const checks = [
  operationIdIsUsable,
  declaresSuccess,
  noInformationalOrRedirect,
  noCookieParameters,
];

// --------------------------------------------------------------------------------------------
// Operations registry (optional). Emits `<out>/operations.gen.ts` - one typed OperationDefinition
// per operationId, binding the generated Zod validators to each operation's method, path, declared
// statuses and content types. The registry itself is framework-agnostic; an ADAPTER adds the
// framework-specific bits and is the extension point for other stacks.
//
// Bundled adapters:
//   nextAppRouter  - adds a `routeFile` per path (app/payments/[id]/route.ts) and can enforce it.
//   fastify        - adds a `fastifyPath` and emits the operationId union + 501 stub handlers
//                    that fastify-openapi-glue needs.
// Write your own by exporting { name, fields?, typeFields?, emit?, check? } - see scripts/adapters/.
// --------------------------------------------------------------------------------------------

export const afterGenerate = operationsEmitter({
  adapter: nextAppRouter(),
  // Enforce that each operation's route file exists (pair with an x-implemented flag for stubs):
  // adapter: nextAppRouter({ enforceRouteFiles: true, isImplemented: (op) => op.operation["x-implemented"] === true }),
});

// Fastify (fastify-openapi-glue) instead:
// export const afterGenerate = operationsEmitter({ adapter: fastify() });

// Routing-agnostic (just the portable registry, no framework fields):
// export const afterGenerate = operationsEmitter();
