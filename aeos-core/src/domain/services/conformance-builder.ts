// Domain service — builds the conformance report from deterministic sources:
// the criteria trace and the results of the project's own test run. No model
// and no person has a say here; what no instrument answered stays unverified.

import type {
  ConformanceCriterion,
  ConformanceInstrument,
  ConformanceReport,
  ConformanceVerdict,
} from '../model/conformance-report.js';
import type { SpecPin } from '../model/spec-pin.js';
import type { TestResult } from '../ports/driven/test-report-reader.port.js';
import type { CriteriaTrace } from './criteria-trace.js';

export interface ConformanceInput {
  readonly feature: string;
  readonly epic: string;
  /** Criteria, non-goals, claims and the names of the tagged instruments. */
  readonly trace: CriteriaTrace;
  /** `file` relative to the project root, as in the trace. */
  readonly tests: readonly TestResult[];
  readonly spec: SpecPin;
  readonly code: { readonly repo: string; readonly commit: string; readonly base?: string };
  readonly generatedAt: string;
  /** Path of the test report, cited on every instrument. */
  readonly evidence?: string;
}

/** The scenario name of a trace instrument `features/pay.feature: Pays by card`. */
const SCENARIO = /\.feature: (.+)$/;

export function buildConformanceReport(input: ConformanceInput): ConformanceReport {
  // A skipped test answered nothing: it is not an instrument.
  const ran = input.tests.filter((test) => test.status !== 'skipped');
  const evidence = input.evidence ? { evidence: input.evidence } : {};

  const criteria = input.trace.rows.map((row): ConformanceCriterion => {
    const inTitle = new RegExp(`\\b${row.id}\\b`);
    const tests = ran
      // Tagged in its title, or in a comment of its file (then the file is the instrument).
      .filter((test) => inTitle.test(test.name) || row.instruments.includes(test.file))
      .map(
        (test): ConformanceInstrument => ({
          kind: 'test',
          name: `${test.file}: ${test.name}`,
          result: test.status === 'fail' ? 'fail' : 'pass',
          ...evidence,
        }),
      );
    // A tagged scenario counts only when the test run reports a result for it.
    const scenarios = row.instruments.flatMap((name): ConformanceInstrument[] => {
      const scenario = SCENARIO.exec(name)?.[1];
      const results = scenario ? ran.filter((test) => test.name.includes(scenario)) : [];
      if (results.length === 0) return [];
      const failed = results.some((test) => test.status === 'fail');
      return [{ kind: 'scenario', name, result: failed ? 'fail' : 'pass', ...evidence }];
    });
    const instruments = [...tests, ...scenarios];
    const verdict: ConformanceVerdict = instruments.some((i) => i.result === 'fail')
      ? 'fail'
      : instruments.length > 0
        ? 'pass'
        : 'unverified';
    return { id: row.id, verdict, claimed_by: row.claimedBy, instruments };
  });

  const count = (verdict: ConformanceVerdict): number =>
    criteria.filter((criterion) => criterion.verdict === verdict).length;
  return {
    schema_version: 0,
    meta: {
      feature: input.feature,
      epic: input.epic,
      spec: input.spec,
      code: input.code,
      generated_at: input.generatedAt,
    },
    criteria,
    non_goals: input.trace.nonGoals,
    summary: {
      total: criteria.length,
      pass: count('pass'),
      fail: count('fail'),
      unverified: count('unverified'),
    },
  };
}

export function renderConformanceMarkdown(report: ConformanceReport): string {
  const { summary, meta } = report;
  return [
    `# Conformance report: ${meta.feature}`,
    '',
    `Epic ${meta.epic}. Spec ${meta.spec.repo}@${meta.spec.commit}. Code ${meta.code.repo}@${meta.code.commit}.`,
    '',
    `${summary.pass} pass, ${summary.fail} fail, ${summary.unverified} unverified of ${summary.total}.`,
    '',
    '| Criterion | Verdict | Instruments | Claimed by |',
    '| --- | --- | --- | --- |',
    ...report.criteria.map((criterion) => {
      const instruments = criterion.instruments
        .map((instrument) => `${instrument.kind}: ${instrument.name} (${instrument.result})`)
        .join('<br>');
      return `| ${criterion.id} | ${criterion.verdict} | ${instruments || '—'} | ${criterion.claimed_by?.join(', ') || '—'} |`;
    }),
    '',
    `Non-goals (not built, by decision): ${report.non_goals?.join(', ') || 'none'}`,
    '',
  ].join('\n');
}

/**
 * Block-style YAML with JSON-quoted strings, which YAML reads as written.
 * shortcut: enough for this report's shape (objects, lists, strings, numbers);
 * the domain may not import a YAML library.
 */
function toYaml(value: unknown, indent: string): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return ' []\n';
    return (
      '\n' +
      value
        .map((item) => {
          const body = toYaml(item, `${indent}  `);
          // An object starts on the dash's line: "- key: value".
          return `${indent}-${body.startsWith('\n') ? ` ${body.trimStart()}` : body}`;
        })
        .join('')
    );
  }
  if (typeof value === 'object' && value !== null) {
    return (
      '\n' +
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => `${indent}${key}:${toYaml(item, `${indent}  `)}`)
        .join('')
    );
  }
  return ` ${JSON.stringify(value)}\n`;
}

export function conformanceYaml(report: ConformanceReport): string {
  return toYaml(report, '').trimStart();
}
