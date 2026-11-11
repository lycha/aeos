import * as fs from 'node:fs';
import * as path from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

import type { TestResult } from '../ports/driven/test-report-reader.port.js';
import {
  addInstruments,
  buildConformanceReport,
  conformanceYaml,
  renderConformanceMarkdown,
  renderConformanceTable,
} from './conformance-builder.js';
import { traceCriteria } from './criteria-trace.js';

// The approved contract lives with the plugin, outside this package.
const validate = new Ajv2020({
  // shortcut: one format in use, so a pattern instead of the ajv-formats package.
  formats: { 'date-time': /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/ },
}).compile(
  JSON.parse(
    fs.readFileSync(
      path.resolve(
        import.meta.dirname,
        '../../../../plugins/artefact-tree-pipeline/schemas/conformance.schema.json',
      ),
      'utf-8',
    ),
  ) as object,
);

const test = (name: string, status: TestResult['status'], file = 'src/a.test.ts'): TestResult => ({
  name,
  file,
  status,
});

function build(tests: TestResult[], base?: string) {
  return buildConformanceReport({
    feature: 'checkout',
    epic: 'EE-1',
    trace: traceCriteria({
      criteria: ['AC-1', 'AC-2', 'AC-3', 'AC-4', 'AC-5', 'AC-12a'],
      nonGoals: ['NON-GOAL-1'],
      claims: new Map([
        ['EE-2', ['AC-1', 'AC-2']],
        ['EE-3', ['AC-2']],
      ]),
      instruments: new Map([
        ['AC-4', ['src/tagged.test.ts']],
        ['AC-5', ['features/pay.feature: Pays by card']],
      ]),
    }),
    tests,
    spec: { repo: 'EE-aeos', commit: 'c0ffee1', path: 'features/checkout' },
    code: { repo: 'shop', commit: 'deadbee', ...(base ? { base } : {}) },
    generatedAt: '2026-11-10T12:00:00.000Z',
    evidence: '.aeos/tmp/test-report.json',
  });
}
const criterion = (report: ReturnType<typeof build>, id: string) =>
  report.criteria.find((entry) => entry.id === id)!;

describe('buildConformanceReport', () => {
  const tests = [
    test('greeting AC-1 greets a stranger', 'pass'),
    test('AC-2 greets by name', 'pass'),
    test('AC-2 greets at night', 'fail', 'src/b.test.ts'),
    test('AC-3 remembers', 'skipped'),
    test('AC-12 shows a time', 'pass'),
    test('any test of a comment-tagged file', 'pass', 'src/tagged.test.ts'),
    test('Checkout Pays by card', 'pass', 'tests/e2e/pay.spec.ts'),
  ];

  it('passes a criterion tagged on a passing test, and names the test', () => {
    expect(criterion(build(tests), 'AC-1')).toEqual({
      id: 'AC-1',
      verdict: 'pass',
      claimed_by: ['EE-2'],
      instruments: [
        {
          kind: 'test',
          name: 'src/a.test.ts: greeting AC-1 greets a stranger',
          result: 'pass',
          evidence: '.aeos/tmp/test-report.json',
        },
      ],
    });
  });

  it('fails a criterion with one passing and one failing test, and lists both', () => {
    const ac2 = criterion(build(tests), 'AC-2');

    expect(ac2.verdict).toBe('fail');
    expect(ac2.claimed_by).toEqual(['EE-2', 'EE-3']);
    expect(ac2.instruments.map((instrument) => [instrument.name, instrument.result])).toEqual([
      ['src/a.test.ts: AC-2 greets by name', 'pass'],
      ['src/b.test.ts: AC-2 greets at night', 'fail'],
    ]);
  });

  it('leaves a criterion with no result unverified, with no instruments', () => {
    expect(criterion(build([]), 'AC-1')).toMatchObject({ verdict: 'unverified', instruments: [] });
    // A suffix is part of the id: a test of AC-12 says nothing about AC-12a.
    expect(criterion(build(tests), 'AC-12a')).toMatchObject({ verdict: 'unverified' });
  });

  it('does not count a skipped test as an instrument', () => {
    expect(criterion(build(tests), 'AC-3')).toMatchObject({
      verdict: 'unverified',
      instruments: [],
    });
  });

  it('counts every test of a file tagged in a comment, and a tagged scenario that has a result', () => {
    expect(criterion(build(tests), 'AC-4').instruments).toMatchObject([
      { kind: 'test', name: 'src/tagged.test.ts: any test of a comment-tagged file' },
    ]);
    expect(criterion(build(tests), 'AC-5')).toMatchObject({
      verdict: 'pass',
      instruments: [
        { kind: 'scenario', name: 'features/pay.feature: Pays by card', result: 'pass' },
      ],
    });
    // The scenario was not run: it is not an instrument.
    expect(criterion(build([]), 'AC-5')).toMatchObject({ verdict: 'unverified', instruments: [] });
  });

  it('sums up: pass + fail + unverified = total', () => {
    const { summary } = build(tests);

    expect(summary).toEqual({ total: 6, pass: 3, fail: 1, unverified: 2 });
    expect(summary.pass + summary.fail + summary.unverified).toBe(summary.total);
  });

  it('matches the approved schema, whatever the results', () => {
    for (const report of [build(tests, 'abc1234'), build([]), build(tests.slice(1, 3))]) {
      expect(validate(report), JSON.stringify(validate.errors)).toBe(true);
    }
    expect(build(tests).non_goals).toEqual(['NON-GOAL-1']);
    expect(build(tests, 'abc1234').meta.code).toEqual({
      repo: 'shop',
      commit: 'deadbee',
      base: 'abc1234',
    });
  });

  it('serialises to YAML that reads back as the same report', () => {
    const report = build(tests);
    const parsed = yaml.load(conformanceYaml(report));

    expect(parsed).toEqual(report);
    expect(validate(parsed), JSON.stringify(validate.errors)).toBe(true);
  });

  it('renders a table of id, verdict, instruments and claimed by', () => {
    const markdown = renderConformanceMarkdown(build(tests));

    expect(markdown).toContain('| Criterion | Verdict | Instruments | Claimed by |');
    expect(markdown).toContain(
      '| AC-2 | fail | test: src/a.test.ts: AC-2 greets by name (pass)<br>test: src/b.test.ts: AC-2 greets at night (fail) | EE-2, EE-3 |',
    );
    expect(markdown).toContain('| AC-3 | unverified | — | — |');
    expect(markdown).toContain('3 pass, 1 fail, 2 unverified of 6');
  });
});

describe('addInstruments', () => {
  const report = build([test('AC-1 greets', 'pass'), test('AC-2 greets at night', 'fail')]);
  const agent = (result: 'pass' | 'fail') =>
    ({ kind: 'agent', name: 'conformance-agent', result, evidence: 'runs/RUN-1.json' }) as const;
  const human = { kind: 'human', name: 'Kris <kris@example.com>', result: 'pass' } as const;

  it('gives an unverified criterion the verdict of the agent that judged it, with its justification', () => {
    const judged = addInstruments(report, [
      { id: 'AC-3', instrument: agent('pass'), notes: 'The diff stores the name.' },
      { id: 'AC-4', instrument: agent('fail'), notes: 'Nothing reads it back.' },
    ]);

    expect(criterion(judged, 'AC-3')).toMatchObject({
      verdict: 'pass',
      instruments: [agent('pass')],
      notes: 'The diff stores the name.',
    });
    expect(criterion(judged, 'AC-4').verdict).toBe('fail');
    expect(judged.summary).toEqual({ total: 6, pass: 2, fail: 2, unverified: 2 });
    expect(validate(judged), JSON.stringify(validate.errors)).toBe(true);
    // The report it was given is not changed.
    expect(criterion(report, 'AC-3').verdict).toBe('unverified');
  });

  it('does not let a person vouch a failed instrument away', () => {
    const vouched = addInstruments(report, [{ id: 'AC-2', instrument: human }]);

    expect(criterion(vouched, 'AC-2').verdict).toBe('fail');
    expect(criterion(vouched, 'AC-2').instruments).toContainEqual(human);
  });
});

describe('renderConformanceTable', () => {
  it('is the summary line and the table, as the full report shows them', () => {
    const report = build([test('AC-1 greets', 'pass')]);
    const table = renderConformanceTable(report);

    expect(table.split('\n')[0]).toBe('1 pass, 0 fail, 5 unverified of 6.');
    expect(table).toContain('| AC-1 | pass | test: src/a.test.ts: AC-1 greets (pass) | EE-2 |');
    expect(renderConformanceMarkdown(report)).toContain(table);
  });
});
