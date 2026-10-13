import { defineConfig } from "@hey-api/openapi-ts";

/**
 * Generates `generated/api/` from `openapi.yaml`.
 *
 * Run via `npm run generate-api-types` (the wrapper), never the CLI directly: the wrapper
 * pins the emitter version and asserts the files were written, because this tool exits 0 and
 * prints "0 files" when its plugin list is wrong - a silent no-op that surfaces much later as
 * unrelated missing-module errors.
 *
 * Direction is spec -> code only. Nothing here reads the codebase.
 *
 * Keep `input`/`output` in step with `spec`/`out` in scripts/openapi.policy.mjs.
 */
export default defineConfig({
  input: "./openapi.yaml",
  output: "./generated/api",
  plugins: [
    // DTOs shared by handlers and UI.
    "@hey-api/typescript",
    // Runtime validation at the boundary. Note: Zod from JSON Schema cannot carry cross-field
    // invariants (an expiry that must be after a start date, say) - keep those in your domain
    // code and apply both layers.
    "zod",
  ],
});
