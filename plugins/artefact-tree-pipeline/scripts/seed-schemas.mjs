#!/usr/bin/env node
// Seed the canonical artefact schemas into a project's artefact tree.
//
// The schemas are OWNED by this plugin (plugins/artefact-tree-pipeline/schemas/).
// A project keeps a *seeded copy* in its artefact tree, because the consumers that
// are not agents reach for it there: lint_decisions.py (run from the tree), CI, and
// editor `$schema` (`# yaml-language-server: $schema=../../schemas/decisions.schema.json`).
// Seeding keeps exactly one authored copy and one deterministic project copy, so the
// two producing skills can never hand-fork the shape (the drift schemas/README.md warns about).
//
// A stamp file `<tree>/schemas/.source` records the plugin version and a sha256 over the
// schema set, mirroring the `// inputs-sha256:` idiom this repo already uses for generated
// code: a seeded copy that diverges from the shipped schemas is then detectable, not silent.
//
// Usage:
//   node seed-schemas.mjs [--tree <path>] [--force] [--check]
//
// Destination tree root resolution, in order:
//   1. --tree <path>
//   2. $AEOS_ARTEFACT_TREE
//   3. ./docs/artefact-tree        (in-repo default)
//
// --check  exit non-zero if the tree is unseeded or diverged (for CI); writes nothing.
// --force  overwrite a diverged seeded copy with the shipped schemas.

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// CLAUDE_PLUGIN_ROOT is set by the plugin runtime; fall back to this script's parent.
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || resolve(HERE, "..");
const SRC = join(PLUGIN_ROOT, "schemas");

const SCHEMA_FILES = [
  "decisions.schema.json",
  "feature-inventory.schema.json",
  "assumption-register.schema.json",
  "lint_decisions.py",
];

function parseArgs(argv) {
  const args = { force: false, check: false, tree: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") args.force = true;
    else if (a === "--check") args.check = true;
    else if (a === "--tree") args.tree = argv[++i];
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

function resolveTree(arg) {
  return resolve(arg || process.env.AEOS_ARTEFACT_TREE || "docs/artefact-tree");
}

function hashSet(dir, files) {
  const h = createHash("sha256");
  for (const f of files) {
    h.update(f + "\0");
    h.update(readFileSync(join(dir, f)));
    h.update("\0");
  }
  return h.digest("hex");
}

function pluginVersion() {
  try {
    const pj = JSON.parse(
      readFileSync(join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), "utf8"),
    );
    return pj.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const args = parseArgs(process.argv.slice(2));
const tree = resolveTree(args.tree);
const destDir = join(tree, "schemas");
const stampPath = join(destDir, ".source");

if (!existsSync(SRC)) {
  console.error(`Cannot find bundled schemas at ${SRC}`);
  process.exit(2);
}

const shipped = hashSet(SRC, SCHEMA_FILES);
const version = pluginVersion();
const short = (h) => (h ? h.slice(0, 12) : "none");

// Hash the files actually in the tree, not just the stamp. A stamp alone cannot catch a
// hand-edit of the seeded copy; re-hashing the tree can.
const allPresent = SCHEMA_FILES.every((f) => existsSync(join(destDir, f)));
const seeded = allPresent ? hashSet(destDir, SCHEMA_FILES) : null;

let stamp = null;
if (existsSync(stampPath)) {
  try {
    stamp = JSON.parse(readFileSync(stampPath, "utf8"));
  } catch {
    /* treat an unreadable stamp as absent */
  }
}

function writeStamp() {
  writeFileSync(
    stampPath,
    JSON.stringify(
      {
        plugin: "artefact-tree-pipeline",
        version,
        sha256: shipped,
        seeded_at: new Date().toISOString(),
        note: "Seeded by artefact-tree-pipeline. Edit schemas in the plugin, not here; re-seed to update.",
      },
      null,
      2,
    ) + "\n",
  );
}

function copyAll() {
  mkdirSync(destDir, { recursive: true });
  for (const f of SCHEMA_FILES) copyFileSync(join(SRC, f), join(destDir, f));
}

// Describe why a present-but-not-matching tree is out of sync.
function divergence() {
  if (stamp && stamp.sha256 === seeded) {
    return `stale seed: tree holds v${stamp.version} (${short(seeded)}), plugin ships v${version} (${short(shipped)})`;
  }
  return `locally modified: tree (${short(seeded)}) does not match its own stamp${stamp ? ` v${stamp.version} (${short(stamp.sha256)})` : " (missing)"}`;
}

if (args.check) {
  if (seeded === shipped) {
    console.log(`artefact schemas up to date at ${destDir} (v${version}, ${short(shipped)})`);
    process.exit(0);
  }
  if (seeded === null) {
    console.error(
      `No schemas seeded at ${destDir}. Seed with: node seed-schemas.mjs --tree ${tree}`,
    );
  } else {
    console.error(`Seeded schemas at ${destDir} out of sync — ${divergence()}.`);
    console.error(`Re-seed with: node seed-schemas.mjs --tree ${tree} --force`);
  }
  process.exit(1);
}

// Content already matches the plugin: nothing to copy, but stamp it if the stamp is missing or stale.
if (seeded === shipped) {
  if (!stamp || stamp.sha256 !== shipped) {
    writeStamp();
    console.log(`Stamped existing schemas at ${destDir} (v${version}, ${short(shipped)}); content already current.`);
  } else {
    console.log(`artefact schemas up to date at ${destDir} (v${version}, ${short(shipped)})`);
  }
  process.exit(0);
}

// A present copy that differs is only overwritten with --force.
if (seeded !== null && !args.force) {
  console.error(`Refusing to overwrite schemas at ${destDir} — ${divergence()}.`);
  console.error(
    `Edit schemas in the plugin, not in the tree. If the plugin copy is authoritative, re-run with --force.`,
  );
  process.exit(1);
}

copyAll();
writeStamp();
console.log(
  `Seeded ${SCHEMA_FILES.length} schema files into ${destDir} (v${version}, ${short(shipped)})`,
);
