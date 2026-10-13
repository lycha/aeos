#!/usr/bin/env node
// Generate just the operations registry (operations.gen.ts) and any adapter files, from the
// types that `generate-openapi-types.mjs` already produced.
//
// Use this for fast iteration on the registry or an adapter without re-running hey-api. It runs
// the same conformance pass first, then emits the registry, so a contract change is still caught
// here. It requires the generated validators to exist already - run `npm run generate-api-types`
// first if they do not. The full `generate-api-types` command runs this step too.
//
// Choose the adapter with a flag (overrides whatever the policy wires):
//   npm run generate-operations -- --adapter next       # Next.js App Router (routeFile per path)
//   npm run generate-operations -- --adapter fastify     # fastify-openapi-glue (operationId + stubs)
//   npm run generate-operations -- --adapter none        # portable registry, no framework fields
// Per-adapter options:
//   --app-dir <dir>          (next)    base directory, default "app"
//   --enforce-route-files    (next)    fail if a declared operation's route file is missing
//   --stubs-file <name>      (fastify) stub filename, default "handler-stubs.ts"
//   --no-stubs               (fastify) skip the stub file, emit only the registry
// With no --adapter, the policy's own `afterGenerate` is used (the default wiring).

import { existsSync, readFileSync } from "node:fs";
import { argv } from "node:process";
import { pathToFileURL } from "node:url";

import { parse } from "yaml";

import { resolveAdapter } from "./adapters/index.mjs";
import { operationsEmitter } from "./emit-operations.mjs";
import { ConformanceError, loadPolicy, runOperations } from "./generate-openapi-types.mjs";

function parseArgs(args) {
  const out = { adapter: undefined, opts: {} };
  const next = (i, flag) => {
    if (i + 1 >= args.length) throw new ConformanceError(`${flag} needs a value.`);
    return args[i + 1];
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--adapter") out.adapter = next(i++, a);
    else if (a.startsWith("--adapter=")) out.adapter = a.slice("--adapter=".length);
    else if (a === "--app-dir") out.opts.appDir = next(i++, a);
    else if (a.startsWith("--app-dir=")) out.opts.appDir = a.slice("--app-dir=".length);
    else if (a === "--enforce-route-files") out.opts.enforceRouteFiles = true;
    else if (a === "--stubs-file") out.opts.stubsFile = next(i++, a);
    else if (a.startsWith("--stubs-file=")) out.opts.stubsFile = a.slice("--stubs-file=".length);
    else if (a === "--no-stubs") out.opts.emitStubs = false;
    else throw new ConformanceError(`unknown argument: ${a}`);
  }
  return out;
}

async function main() {
  const { adapter: adapterName, opts } = parseArgs(argv.slice(2));

  const policy = await loadPolicy();
  if (!policy.spec || !policy.out) {
    throw new ConformanceError("openapi.policy.mjs must export `spec` and `out` paths.");
  }
  if (!existsSync(policy.spec)) {
    throw new ConformanceError(`${policy.spec} not found - nothing to generate from.`);
  }

  // A --adapter flag builds a fresh emitter and overrides the policy's afterGenerate.
  let override;
  if (adapterName !== undefined) {
    let adapter;
    try {
      adapter = resolveAdapter(adapterName, opts);
    } catch (e) {
      throw new ConformanceError(e.message);
    }
    override = operationsEmitter({ adapter });
  }

  const doc = parse(readFileSync(policy.spec, "utf8"));
  const operations = await runOperations(doc, policy, override ? { afterGenerate: override } : {});

  const used = adapterName ?? "policy default";
  console.log(`generate-operations: ${policy.out}/ registry is current - ${operations.length} operations (adapter: ${used}).`);
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  main().catch((e) => {
    if (!(e instanceof ConformanceError)) throw e;
    console.error(`\ngenerate-operations: ${e.message}\n`);
    process.exit(1);
  });
}
