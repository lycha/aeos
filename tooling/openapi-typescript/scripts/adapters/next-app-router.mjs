// Next.js App Router adapter for the operations emitter.
//
// Maps each OpenAPI path to the route file it must live in:
//   /payments/{id}  ->  app/payments/[id]/route.ts
// and (optionally) fails the build if that file does not exist, which is how StandIn catches a
// handler bound to the wrong operation or a declared endpoint with no handler.
//
// Factory, so it is configurable and therefore extendable:
//   nextAppRouter()                                   // app/ base, no file-existence check
//   nextAppRouter({ appDir: 'src/app' })              // custom base directory
//   nextAppRouter({ enforceRouteFiles: true })        // fail if a route file is missing
//   nextAppRouter({ isImplemented: (op) => ... })     // only enforce for "implemented" operations

import { existsSync } from "node:fs";
import { join } from "node:path";

/** `/payments/{id}` -> `app/payments/[id]/route.ts`. Validates each segment is literal or one whole {param}. */
export function routeFileFor(specPath, appDir = "app") {
  if (!specPath.startsWith("/")) {
    throw new Error(`path ${specPath} must start with "/".`);
  }
  const segments = specPath.slice(1).split("/").filter((s) => s !== "" || specPath === "/");
  for (const segment of segments) {
    if (segment === "") {
      throw new Error(`path ${specPath} has an empty segment; each becomes one directory under ${appDir}/.`);
    }
    // A segment is a literal or one whole {name}. Next has no syntax for a partial parameter.
    if (/[{}]/.test(segment) && !/^\{[^{}]+\}$/.test(segment)) {
      throw new Error(
        `path ${specPath} segment \`${segment}\` mixes braces with other text. A path parameter must be a ` +
          `whole segment (\`{id}\`), because App Router's dynamic segment is a whole directory (\`[id]\`).`,
      );
    }
  }
  return [appDir, ...segments.map((s) => s.replace(/^\{(.+)\}$/, "[$1]")), "route.ts"].join("/");
}

export function nextAppRouter({ appDir = "app", enforceRouteFiles = false, isImplemented } = {}) {
  return {
    name: "next-app-router",

    fields(op) {
      return { routeFile: routeFileFor(op.path, appDir) };
    },

    typeFields: [
      // Repo-relative App Router file this operation must live in.
      { name: "routeFile", tsType: "string" },
    ],

    check(op, ctx) {
      if (!enforceRouteFiles) return;
      if (isImplemented && !isImplemented(op)) return;
      const routeFile = routeFileFor(op.path, appDir);
      if (!existsSync(join(ctx.repoRoot, routeFile))) {
        throw new Error(
          `${op.operationId} (${op.method} ${op.path}) is declared in the contract but ${routeFile} does not exist. ` +
            `Create the route handler there, or mark the operation unimplemented so it is skipped (see the isImplemented option).`,
        );
      }
    },
  };
}
