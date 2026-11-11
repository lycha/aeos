import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import * as yaml from 'js-yaml';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { FsProjectRepository } from './fs-project.repository.js';
import { FsTemplateCatalog } from './fs-template-catalog.js';
import { ProjectSyncUseCase } from '../../application/project-sync.use-case.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const repoRoot = path.resolve(packageRoot, '..');
const plugin = path.join(repoRoot, 'plugins', 'artefact-tree-pipeline');
const seedScript = path.join(plugin, 'scripts', 'seed-schemas.mjs');

/** Runs the plugin's seeder, which owns the stamp and `--check` semantics. */
function seed(args: string[], cwd: string = packageRoot) {
  const env = { ...process.env };
  delete env.AEOS_ARTEFACT_TREE;
  return spawnSync('node', [seedScript, ...args], { cwd, env, encoding: 'utf-8' });
}

describe('artefact schemas', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-schemas-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("the harvest skill's worked inventory example validates against the schema", () => {
    const example = fs.readFileSync(
      path.join(plugin, 'skills', 'prototype-harvest', 'references', 'inventory-example.md'),
      'utf-8',
    );
    const validate = new Ajv2020({
      allErrors: true,
      // shortcut: one format in use, so a pattern instead of the ajv-formats package.
      formats: { 'date-time': /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/ },
    }).compile(
      JSON.parse(
        fs.readFileSync(path.join(plugin, 'schemas', 'feature-inventory.schema.json'), 'utf-8'),
      ) as object,
    );

    // js-yaml reads a bare timestamp as a Date; the schema wants the string.
    const inventory = yaml.load(/```yaml\n([\s\S]*?)```/.exec(example)![1]!, {
      schema: yaml.JSON_SCHEMA,
    });

    expect(validate(inventory), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it('ships a copy in templates/schemas that matches the plugin (run `npm run build` to refresh)', () => {
    const check = seed(['--tree', path.join(packageRoot, 'templates'), '--check']);

    expect(check.status, check.stderr).toBe(0);
  });

  it('has one authored copy of each schema and each skill', () => {
    expect(fs.existsSync(path.join(packageRoot, 'src', 'artefact-tree'))).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, 'skills'))).toBe(false);
  });

  it('seeds every plugin schema with a valid stamp on project init, plus features/ and contexts/', () => {
    new FsProjectRepository().scaffoldDefaults(tmpDir);

    const aeos = path.join(tmpDir, '.aeos');
    const shipped = fs.readdirSync(path.join(plugin, 'schemas')).filter((f) => f !== 'README.md');
    for (const file of shipped) {
      expect(fs.readFileSync(path.join(aeos, 'schemas', file), 'utf-8'), file).toBe(
        fs.readFileSync(path.join(plugin, 'schemas', file), 'utf-8'),
      );
    }
    expect(seed(['--tree', aeos, '--check']).status).toBe(0);
    expect(
      JSON.parse(fs.readFileSync(path.join(aeos, 'schemas', '.source'), 'utf-8')),
    ).toHaveProperty('sha256');
    expect(fs.statSync(path.join(aeos, 'features')).isDirectory()).toBe(true);
    expect(fs.statSync(path.join(aeos, 'contexts')).isDirectory()).toBe(true);
  });

  it('reports a hand-edited schema as drifted on sync and keeps it without --force', () => {
    new FsProjectRepository().scaffoldDefaults(tmpDir);
    const edited = path.join(tmpDir, '.aeos', 'schemas', 'decisions.schema.json');
    fs.writeFileSync(edited, '{"hand":"edited"}\n', 'utf-8');
    const sync = new ProjectSyncUseCase(new FsTemplateCatalog());
    const outcome = (force: boolean) =>
      sync
        .execute({ projectPath: tmpDir, apply: true, force })
        .files.find((f) => f.relativePath === path.join('schemas', 'decisions.schema.json'));

    expect(outcome(false)).toMatchObject({ status: 'drifted', action: 'none' });
    expect(fs.readFileSync(edited, 'utf-8')).toBe('{"hand":"edited"}\n');
    expect(seed(['--tree', path.join(tmpDir, '.aeos'), '--check']).status).toBe(1);

    expect(outcome(true)).toMatchObject({ status: 'drifted', action: 'updated' });
    expect(seed(['--tree', path.join(tmpDir, '.aeos'), '--check']).status).toBe(0);
  });

  it('resolves the tree to <project>/.aeos when it exists and no variable is set', () => {
    new FsProjectRepository().scaffoldDefaults(tmpDir);

    const check = seed(['--check'], tmpDir);

    expect(check.status, check.stderr).toBe(0);
    expect(check.stdout).toContain(path.join('.aeos', 'schemas'));
  });

  it('resolves the tree from artefactTree in .aeos/project.json before .aeos itself', () => {
    fs.mkdirSync(path.join(tmpDir, '.aeos'));
    fs.writeFileSync(
      path.join(tmpDir, '.aeos', 'project.json'),
      JSON.stringify({ artefactTree: '../specs' }),
    );

    const check = seed(['--check'], tmpDir);

    expect(check.status).toBe(1);
    expect(check.stderr).toContain(path.join('specs', 'schemas'));
  });
});
