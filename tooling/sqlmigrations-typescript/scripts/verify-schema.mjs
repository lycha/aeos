#!/usr/bin/env node
// Schema verifier - the REUSABLE CORE. It should not need editing; project decisions live in
// db-codegen.policy.mjs. It implements the enforcement half of Principle IV for the DB layer:
//
//   1. Pin the emitter. kysely-codegen does not stamp a version into its output, so the installed
//      version is read from node_modules and held against policy.pinnedCodegenVersion. A mismatch
//      (someone bumped it without re-verifying the generated diff) fails.
//   2. No silent no-op. The generated file must exist, be non-empty, and declare at least one table
//      interface - otherwise a green build ships a query layer with no types.
//   3. An unmapped type breaks the build. Every column's base type is checked against the policy's
//      allow-list; a type on neither the allow-list nor the refusal list fails. The headline refusal
//      is `unknown` - kysely-codegen's fallback for a Postgres type it could not map. Value-level
//      `checks` then run over the parsed schema.
//
// Run it after generation (see the `generate-db` script). Exit 0 = verified, 1 = any violation.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { default: policy } = await import(new URL('../db-codegen.policy.mjs', import.meta.url));
const root = resolve(dirname(new URL(import.meta.url).pathname), '..');

class ConformanceError extends Error {}
const fail = (msg) => { throw new ConformanceError(msg); };

/** Peel Generated<...>, nullability and unions to the set of base type names. */
export function baseTypes(raw) {
  let t = raw.trim().replace(/;$/, '').trim();
  const g = t.match(/^Generated<([\s\S]+)>$/);
  if (g) t = g[1].trim();
  return t.split('|').map((s) => s.trim()).filter((s) => s && s !== 'null');
}

/** Parse kysely-codegen output into { tables: [{ name, columns: [{ name, type, bases }] }] }. */
export function parseSchema(src) {
  const tables = [];
  const re = /export interface (\w+) \{([\s\S]*?)\n\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[1];
    if (name === 'DB') continue; // the aggregate map of table-name -> interface, not a table
    const columns = [];
    for (const line of m[2].split('\n')) {
      const c = line.match(/^\s+(\w+):\s*(.+?);?\s*$/);
      if (c) columns.push({ name: c[1], type: c[2].trim(), bases: baseTypes(c[2]) });
    }
    tables.push({ name, columns });
  }
  return { tables };
}

function main() {
  const outFile = resolve(root, policy.out);

  // 1. Pin the emitter.
  let installed;
  try {
    installed = require(require.resolve('kysely-codegen/package.json')).version;
  } catch {
    fail('could not read the installed kysely-codegen version. Is it installed? Run `npm install` first.');
  }
  if (installed !== policy.pinnedCodegenVersion) {
    fail(
      `kysely-codegen ${installed} is installed; this policy is verified against ${policy.pinnedCodegenVersion}.\n` +
      `  A generator's output is an input to everything downstream and changes between releases. Re-verify\n` +
      `  the new version (regenerate, read the diff), then set pinnedCodegenVersion in db-codegen.policy.mjs\n` +
      `  in the same change. Bumping the dependency alone is what this refuses.`,
    );
  }

  // 2. No silent no-op.
  if (!existsSync(outFile)) {
    fail(`${policy.out} not found - generation did not run. Run the generate step first (needs Docker).`);
  }
  if (statSync(outFile).size === 0) fail(`${policy.out} is empty.`);
  const src = readFileSync(outFile, 'utf8');
  const { tables } = parseSchema(src);
  if (tables.length === 0) {
    fail(`${policy.out} declares no table interfaces - a silent no-op, not a passing build. Did the migrations create any tables?`);
  }

  // 3. An unmapped (or unaccounted-for) column type breaks the build.
  const allowed = new Set(policy.allow.columnTypes);
  const refuse = policy.refuse ?? {};
  for (const table of tables) {
    for (const col of table.columns) {
      for (const base of col.bases) {
        if (allowed.has(base)) continue;
        if (refuse[base]) {
          fail(`${table.name}.${col.name} is typed \`${base}\`. ${refuse[base]}`);
        }
        fail(
          `${table.name}.${col.name} is typed \`${base}\`, which this pipeline does not account for.\n` +
          `  Allowed today: ${[...allowed].sort().join(', ')}.\n` +
          `  An unaccounted-for column type breaks the build rather than being ignored. Two deliberate ways\n` +
          `  out: map it (add a kysely-codegen type override, or change the column) and add the base type to\n` +
          `  allow.columnTypes, or refuse it (add it to \`refuse\` with the constraint that makes it unusable).`,
        );
      }
    }
  }

  // Value-level checks.
  for (const check of policy.checks ?? []) check({ tables });

  const cols = tables.reduce((n, t) => n + t.columns.length, 0);
  console.log(`verify-schema: ${policy.out} is current - ${tables.length} tables, ${cols} columns, generator kysely-codegen ${installed}.`);
}

try {
  main();
} catch (e) {
  if (!(e instanceof ConformanceError) && !(e instanceof Error)) throw e;
  process.stderr.write(`\nverify-schema: ${e.message}\n\n`);
  process.exit(1);
}
