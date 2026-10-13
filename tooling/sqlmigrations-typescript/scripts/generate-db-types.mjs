#!/usr/bin/env node
// Generate TypeScript DB types from the SQL migrations.
//
// Pipeline: start a throwaway Postgres (Docker/testcontainers) -> run the migrations against it ->
// introspect the LIVE migrated schema with kysely-codegen -> write the types -> discard the container.
// Introspecting the real migrated database (rather than parsing the SQL) is the point: the types then
// reflect exactly what Postgres built, defaults, constraints and all.
//
// This is generator-agnostic orchestration; all project decisions live in db-codegen.policy.mjs, and
// verify-schema.mjs is what actually enforces the contract. Requires Docker (e.g. colima) running.

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

import { PostgreSqlContainer } from '@testcontainers/postgresql';

const require = createRequire(import.meta.url);
const { default: policy } = await import(new URL('../db-codegen.policy.mjs', import.meta.url));
const root = resolve(dirname(new URL(import.meta.url).pathname), '..');

/** Resolve a dependency's CLI entry from its package manifest (no hardcoded dist paths). */
function binOf(pkg, binName) {
  const manifest = require.resolve(`${pkg}/package.json`);
  const bin = require(manifest).bin;
  return join(dirname(manifest), typeof bin === 'string' ? bin : bin[binName]);
}

const migrationsDir = resolve(root, policy.migrationsDir);
const outFile = resolve(root, policy.out);
mkdirSync(dirname(outFile), { recursive: true });

console.log(`generate-db-types: starting ${policy.postgresImage} ...`);
const container = await new PostgreSqlContainer(policy.postgresImage).start();
try {
  const url = container.getConnectionUri();

  // 1. Migrate the throwaway database to head.
  console.log('generate-db-types: applying migrations ...');
  execFileSync(process.execPath, [binOf('node-pg-migrate', 'node-pg-migrate'), 'up', '-m', migrationsDir, '--no-lock'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });

  // 2. Introspect the migrated schema into TypeScript.
  console.log('generate-db-types: introspecting schema ...');
  execFileSync(
    process.execPath,
    [
      binOf('kysely-codegen', 'kysely-codegen'),
      '--dialect', 'postgres',
      '--url', url,
      '--schema', policy.dbSchema,
      '--exclude-pattern', policy.excludePattern,
      '--out-file', outFile,
      ...(policy.codegenFlags ?? []),
    ],
    { stdio: 'inherit' },
  );

  console.log(`generate-db-types: wrote ${policy.out}`);
} finally {
  await container.stop();
}
