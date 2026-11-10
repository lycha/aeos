import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { PythonDecisionsLint, type PythonRunner } from './decisions-lint.adapter.js';
import { FsProjectRepository } from '../filesystem/fs-project.repository.js';

const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../e2e/fixtures/feature-sample',
);
const pythonReady =
  spawnSync('python3', ['-c', 'import yaml, jsonschema'], { stdio: 'ignore' }).status === 0;

describe('PythonDecisionsLint', () => {
  let project: string;
  let tree: string;
  let featureDir: string;

  beforeEach(() => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-lint-'));
    new FsProjectRepository().scaffoldDefaults(project);
    tree = path.join(project, '.aeos');
    featureDir = path.join(tree, 'features', 'feature-sample');
    fs.cpSync(fixture, featureDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(project, { recursive: true, force: true });
  });

  const edit = (file: string, from: string, to: string): void => {
    const target = path.join(featureDir, file);
    const before = fs.readFileSync(target, 'utf-8');
    expect(before).toContain(from);
    fs.writeFileSync(target, before.replace(from, to));
  };

  it('lists which of spec.md and decisions.yaml are missing', () => {
    const lint = new PythonDecisionsLint();
    expect(lint.missingFiles(featureDir)).toEqual([]);

    fs.rmSync(path.join(featureDir, 'spec.md'));
    fs.rmSync(path.join(featureDir, 'decisions.yaml'));

    expect(lint.missingFiles(featureDir)).toEqual(['spec.md', 'decisions.yaml']);
  });

  it('names python3 when it is not on PATH', () => {
    const notFound: PythonRunner = () => ({ status: null, stdout: '', stderr: '', notFound: true });

    expect(() => new PythonDecisionsLint(notFound).lint(tree, 'feature-sample')).toThrow(
      /python3 is not on PATH/,
    );
  });

  it('names the python modules when they cannot be imported', () => {
    const noModules: PythonRunner = () => ({
      status: 1,
      stdout: '',
      stderr: "ModuleNotFoundError: No module named 'jsonschema'",
      notFound: false,
    });

    expect(() => new PythonDecisionsLint(noModules).lint(tree, 'feature-sample')).toThrow(
      /PyYAML.*jsonschema/,
    );
  });

  it('runs the seeded linter from the tree root, as the schemas README documents', () => {
    const calls: Array<{ args: string[]; cwd: string }> = [];
    const runner: PythonRunner = (args, cwd) => {
      calls.push({ args, cwd });
      return { status: 0, stdout: 'clean (0 warning(s))\n', stderr: '', notFound: false };
    };

    const result = new PythonDecisionsLint(runner).lint(tree, 'feature-sample');

    expect(result).toEqual({ schemaErrors: [], lintErrors: [], escalated: [] });
    expect(calls[1]).toEqual({
      args: [
        path.join('schemas', 'lint_decisions.py'),
        path.join('features', 'feature-sample'),
        '--register',
        'assumption-register.yaml',
        '--schemas',
        'schemas',
      ],
      cwd: tree,
    });
  });

  it('separates schema errors from lint errors, and ignores warnings', () => {
    const runner: PythonRunner = (args) => ({
      status: args[0] === '-c' ? 0 : 1,
      stdout: [
        '  warn: 1 UNMAPPED glossary terms in inventory',
        " ERROR: decisions.schema.json: meta: 'feature' is a required property",
        ' ERROR: ABS-2 (high) is unaddressed in decisions.yaml',
        '',
        '2 error(s), 1 warning(s)',
      ].join('\n'),
      stderr: '',
      notFound: false,
    });

    expect(new PythonDecisionsLint(runner).lint(tree, 'feature-sample')).toMatchObject({
      schemaErrors: ["decisions.schema.json: meta: 'feature' is a required property"],
      lintErrors: ['ABS-2 (high) is unaddressed in decisions.yaml'],
    });
  });

  it('reports a linter that crashed as a lint error, not a pass', () => {
    const runner: PythonRunner = (args) =>
      args[0] === '-c'
        ? { status: 0, stdout: '', stderr: '', notFound: false }
        : { status: 1, stdout: '', stderr: 'Traceback: boom', notFound: false };

    expect(new PythonDecisionsLint(runner).lint(tree, 'feature-sample').lintErrors).toEqual([
      'Traceback: boom',
    ]);
  });

  it('says so when the seeded linter is missing from the tree', () => {
    fs.rmSync(path.join(tree, 'schemas', 'lint_decisions.py'));

    expect(() => new PythonDecisionsLint().lint(tree, 'feature-sample')).toThrow(
      /lint_decisions\.py.*aeos project sync/s,
    );
  });

  it('names every ESCALATED decision, conflict and question', () => {
    const ok: PythonRunner = () => ({ status: 0, stdout: 'clean', stderr: '', notFound: false });
    fs.appendFileSync(
      path.join(featureDir, 'decisions.yaml'),
      [
        'conflict_resolutions:',
        '  - { conflict: CON-1, outcome: ESCALATED, resolution: open, owner: kris, due: "2026-12-01" }',
        'question_resolutions:',
        '  - { question: Q-1, outcome: ESCALATED, owner: kris, due: "2026-12-01" }',
        '  - { question: Q-2, outcome: DROPPED, reason: moot }',
        '',
      ].join('\n'),
    );
    edit('decisions.yaml', 'outcome: DECIDED', 'outcome: ESCALATED');

    expect(new PythonDecisionsLint(ok).lint(tree, 'feature-sample').escalated).toEqual([
      'CON-1',
      'ABS-1',
      'Q-1',
    ]);
  });

  describe.skipIf(!pythonReady)('with the real python3', () => {
    it('passes the fixture feature', () => {
      expect(new PythonDecisionsLint().lint(tree, 'feature-sample')).toEqual({
        schemaErrors: [],
        lintErrors: [],
        escalated: [],
      });
    });

    it("returns the validator's message for a decisions.yaml that fails the schema", () => {
      edit('decisions.yaml', 'mode: paired-live', 'mode: by-telepathy');

      const result = new PythonDecisionsLint().lint(tree, 'feature-sample');

      expect(result.schemaErrors).toHaveLength(1);
      expect(result.schemaErrors[0]).toMatch(/decisions\.schema\.json: meta\/mode: 'by-telepathy'/);
    });

    it('returns a cross-file lint error', () => {
      edit('decisions.yaml', 'absence: ABS-1', 'absence: ABS-9');

      expect(new PythonDecisionsLint().lint(tree, 'feature-sample').lintErrors).toContain(
        'ABS-1 (high) is unaddressed in decisions.yaml',
      );
    });
  });
});
