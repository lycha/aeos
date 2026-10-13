#!/usr/bin/env node
// Generate TypeScript (DTOs + runtime validators) from an OpenAPI contract, then prove it
// happened and that the contract contains nothing the project has not accounted for.
//
// This is the REUSABLE CORE. It should not need editing - project decisions live in
// `openapi.policy.mjs` beside it. It implements the enforcement half of Principle IV:
//
//   1. Pin the emitter. A generator's output is an input to everything downstream, so the
//      tool version is held against `policy.verifiedHeyApi`. A new minor refuses to run until
//      someone re-verifies and bumps the pin, instead of silently retyping the app.
//   2. No silent no-op. `@hey-api/openapi-ts` exits 0 and writes zero files when its plugin
//      list is wrong. A green install with no generated code surfaces much later as a wall of
//      missing-module errors pointing nowhere near the cause, so the files are checked for.
//   3. An unmodelled construct breaks the build. Every key of the document, each path item,
//      operation, response, request body and parameter is walked against the policy's
//      allow-lists; a key on neither the allow-list nor the refusal list fails the build.
//      Value-level `policy.checks` then run per operation.
//
// Exit codes: 0 generated and verified, 1 anything else.
//
// The pure halves (`assertHeyApiVersion`, `walkSpec`) are exported so they can be unit-tested
// without invoking hey-api. `main()` runs only when this file is the entry point.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { argv } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parse } from "yaml";

const HERE = dirname(fileURLToPath(import.meta.url));

const HTTP_VERBS = ["get", "put", "post", "delete", "patch", "options", "head", "trace"];
const REF_SIBLINGS = new Set(["$ref", "summary", "description"]);

/** Every assertion throws this; `main` prints the message and exits 1. */
export class ConformanceError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConformanceError";
  }
}
const fail = (msg) => {
  throw new ConformanceError(msg);
};

/**
 * Hold the installed `@hey-api/openapi-ts` against the policy's pin (major.minor).
 * Pure and exported so its message - the whole product of a build-time guard - is testable.
 */
export function assertHeyApiVersion(installed, verified) {
  if (typeof installed !== "string" || !/^\d+\.\d+\.\d+/.test(installed)) {
    fail(
      `could not read a version from @hey-api/openapi-ts (got ${JSON.stringify(installed)}). ` +
        `That is how this script knows which generator is about to run; without it the pin cannot ` +
        `be evaluated and generation is not safe to attempt. Is the package installed?`,
    );
  }
  const [major, minor] = installed.split(".");
  if (`${major}.${minor}` === verified) return;
  fail(
    `@hey-api/openapi-ts ${installed} is installed; this policy is verified against ${verified}.x.\n` +
      `A generator's output is an input to everything downstream, and its behaviour changes between ` +
      `releases. Re-verify the new version against your policy (run a generation, read the diff), then ` +
      `set \`verifiedHeyApi\` in openapi.policy.mjs in the same change. Bumping the dependency alone is ` +
      `what this refuses.`,
  );
}

/** Fail on any key of `object` the allow-list does not name. */
const allowOnly = (object, { allowed, refusals = {}, allowExtensions, subject, kind }) => {
  for (const key of Object.keys(object ?? {})) {
    if (allowed.has(key)) continue;
    if (allowExtensions && key.startsWith("x-")) continue;
    const why = refusals[key];
    if (why) fail(`${subject} declares \`${key}\` on its ${kind}. ${why}`);
    fail(
      `${subject} declares \`${key}\` on its ${kind}, which this pipeline does not account for.\n` +
        `Allowed today: ${[...allowed].sort().join(", ")}.\n` +
        `An unmodelled construct breaks the build rather than being ignored, because a green build ` +
        `for something nothing serves ships the endpoint anyway and hides the gap. Two deliberate ways ` +
        `out: model it (honour it in your code and add the key to \`allow\` in openapi.policy.mjs), or ` +
        `refuse it (add it to \`refuse\` with the constraint that makes it unservable).`,
    );
  }
};

/** OpenAPI 3.1 allows only summary/description beside a $ref; anything else would be read by nothing. */
const checkRefSiblings = (node, subject, kind) => {
  if (!node || typeof node.$ref !== "string") return;
  const extra = Object.keys(node).filter((key) => !REF_SIBLINGS.has(key));
  if (extra.length > 0) {
    fail(
      `${subject} writes ${extra.join(", ")} beside a $ref on its ${kind}. OpenAPI 3.1 allows only ` +
        `summary and description there; move those keys onto the component the $ref names, or inline it.`,
    );
  }
};

/** Follow a local `$ref` to the object it names (used so refusal checks see the resolved shape). */
const resolver = (doc) => {
  const go = (node, seen = new Set()) => {
    if (!node || typeof node.$ref !== "string") return node;
    if (seen.has(node.$ref)) fail(`circular $ref: ${node.$ref}`);
    seen.add(node.$ref);
    const target = node.$ref.replace(/^#\//, "").split("/").reduce((a, k) => (a == null ? a : a[k]), doc);
    if (!target) fail(`unresolved $ref: ${node.$ref}`);
    return go(target, seen);
  };
  return go;
};

const toSet = (list, type) => {
  if (!Array.isArray(list)) fail(`policy.allow.${type} must be an array of key names.`);
  return new Set(list);
};

/**
 * The whole conformance pass, as one pure function over the parsed spec and the policy.
 * Returns the operations it found (for the optional afterGenerate hook). Throws on any violation.
 */
export function walkSpec(doc, policy) {
  const resolve = resolver(doc);
  const allowExtensions = policy.allowExtensions !== false;
  const refuse = policy.refuse ?? {};
  const operations = [];

  allowOnly(doc, {
    allowed: toSet(policy.allow.document, "document"),
    refusals: refuse.document,
    allowExtensions,
    subject: "the contract",
    kind: "document",
  });

  const seenIds = new Map();

  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    allowOnly(item, {
      allowed: toSet(policy.allow.pathItem, "pathItem"),
      refusals: refuse.pathItem,
      allowExtensions,
      subject: path,
      kind: "path item",
    });

    const sharedParams = item.parameters ?? [];

    for (const verb of HTTP_VERBS) {
      const operation = item[verb];
      if (!operation) continue;
      const id = operation.operationId;
      const method = verb.toUpperCase();

      const where = seenIds.get(id);
      if (id && where) {
        fail(`two operations share operationId "${id}": ${where} and ${method} ${path}. It names one set of generated types; give each its own id.`);
      }
      if (id) seenIds.set(id, `${method} ${path}`);

      allowOnly(operation, {
        allowed: toSet(policy.allow.operation, "operation"),
        refusals: refuse.operation,
        allowExtensions,
        subject: `${method} ${path} (${id ?? "no operationId"})`,
        kind: "operation",
      });

      for (const p of [...sharedParams, ...(operation.parameters ?? [])]) {
        checkRefSiblings(p, id ?? `${method} ${path}`, "parameter");
        allowOnly(resolve(p), {
          allowed: toSet(policy.allow.parameter, "parameter"),
          refusals: refuse.parameter,
          allowExtensions,
          subject: `${id ?? `${method} ${path}`} parameter`,
          kind: "parameter",
        });
      }

      for (const [code, response] of Object.entries(operation.responses ?? {})) {
        checkRefSiblings(response, `${id} ${code}`, "response");
        allowOnly(resolve(response), {
          allowed: toSet(policy.allow.response, "response"),
          refusals: refuse.response,
          allowExtensions,
          subject: `${id} ${code}`,
          kind: "response",
        });
      }

      if (operation.requestBody !== undefined) {
        checkRefSiblings(operation.requestBody, id, "requestBody");
        allowOnly(resolve(operation.requestBody), {
          allowed: toSet(policy.allow.requestBody, "requestBody"),
          refusals: refuse.requestBody,
          allowExtensions,
          subject: id,
          kind: "requestBody",
        });
      }

      const op = { method, path, operationId: id, operation };
      // Policy checks are ordinary project functions that throw a plain Error; present their
      // message the same way as an allow-list break rather than as a Node stack trace.
      for (const check of policy.checks ?? []) {
        try {
          check(op);
        } catch (e) {
          if (e instanceof ConformanceError) throw e;
          fail(e instanceof Error ? e.message : String(e));
        }
      }
      operations.push(op);
    }
  }

  if (operations.length === 0) fail("the contract declares no operations.");
  return operations;
}

async function loadPolicy() {
  const path = process.env.OPENAPI_POLICY
    ? resolve(process.env.OPENAPI_POLICY)
    : join(HERE, "openapi.policy.mjs");
  if (!existsSync(path)) fail(`policy not found at ${path}. Copy openapi.policy.mjs beside this script and edit it.`);
  return import(pathToFileURL(path).href);
}

async function main() {
  const policy = await loadPolicy();
  const SPEC = policy.spec;
  const OUT = policy.out;
  if (!SPEC || !OUT) fail("openapi.policy.mjs must export `spec` and `out` paths.");
  if (!existsSync(SPEC)) fail(`${SPEC} not found - nothing to generate from.`);

  // 1. Pin the emitter, before a single file is written.
  let installed;
  try {
    const pkg = createRequire(import.meta.url).resolve("@hey-api/openapi-ts/package.json");
    installed = JSON.parse(readFileSync(pkg, "utf8")).version;
  } catch {
    installed = undefined;
  }
  assertHeyApiVersion(installed, policy.verifiedHeyApi);

  // 2. Emitter: DTOs + Zod. Reads openapi-ts.config.ts at the repo root.
  try {
    execFileSync("npx", ["@hey-api/openapi-ts"], { stdio: "inherit" });
  } catch {
    fail("@hey-api/openapi-ts failed. See its output above.");
  }

  // 3. No silent no-op: the files must exist and be non-empty.
  const expected = ["types.gen.ts", "zod.gen.ts", "index.ts"];
  const missing = expected.filter((f) => !existsSync(join(OUT, f)));
  if (missing.length) {
    fail(`the generator exited 0 but did not write ${missing.join(", ")} into ${OUT}/. That is the silent no-op, not a passing build - check the plugin list in openapi-ts.config.ts.`);
  }
  const empty = expected.filter((f) => statSync(join(OUT, f)).size === 0);
  if (empty.length) fail(`${empty.join(", ")} generated but empty.`);

  // 4. Conformance: nothing in the contract is unaccounted for.
  const doc = parse(readFileSync(SPEC, "utf8"));
  const operations = walkSpec(doc, policy);

  if (typeof policy.afterGenerate === "function") {
    await policy.afterGenerate({ doc, outDir: OUT, operations });
  }

  console.log(`generate-openapi-types: ${OUT}/ is current - ${operations.length} operations, ${expected.length} files.`);
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  main().catch((e) => {
    if (!(e instanceof ConformanceError)) throw e;
    console.error(`\ngenerate-openapi-types: ${e.message}\n`);
    process.exit(1);
  });
}
