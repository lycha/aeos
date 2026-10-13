// Adapter registry - maps a name (as passed to `generate-operations --adapter <name>`) to the
// adapter factory. A project that writes its own adapter can add it here, or wire it directly in
// the policy; the flag is for switching between the ones registered here.

import { fastify } from "./fastify.mjs";
import { nextAppRouter } from "./next-app-router.mjs";

export const ADAPTERS = {
  next: nextAppRouter,
  "next-app-router": nextAppRouter,
  fastify,
};

/** Resolve an adapter by name. `null`/`"none"` means the portable registry with no framework fields. */
export function resolveAdapter(name, opts = {}) {
  if (name == null || name === "none") return null;
  const factory = ADAPTERS[name];
  if (!factory) {
    const names = [...new Set(Object.keys(ADAPTERS))].join(", ");
    throw new Error(`unknown adapter "${name}". Known adapters: ${names}, none.`);
  }
  return factory(opts);
}
