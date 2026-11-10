import { describe, expect, it } from 'vitest';

import type { ColumnRole } from '../model/column-spec.js';
import type { Pipelines } from '../model/column.js';
import { pipelineErrors } from './pipeline-validation.js';

const ROLES: Record<string, ColumnRole> = {
  SPEC_REVIEW: 'spec-review',
  TECH_SPEC: 'standard',
  TASK_BREAKDOWN: 'decomposition',
  INTEGRATION_REVIEW: 'integration',
  DOD_GATE: 'final-gate',
  IMPLEMENTATION: 'standard',
  CODE_REVIEW: 'standard',
  QA: 'standard',
};
const roleOf = (column: string): ColumnRole | null => ROLES[column] ?? null;

const EPIC = [
  'BACKLOG',
  'SPEC_REVIEW',
  'TECH_SPEC',
  'TASK_BREAKDOWN',
  'INTEGRATION_REVIEW',
  'DOD_GATE',
  'DONE',
];
const TASK = ['BACKLOG', 'IMPLEMENTATION', 'CODE_REVIEW', 'QA', 'DONE'];
const errors = (pipelines: Partial<Pipelines>): string[] =>
  pipelineErrors({ EPIC, TASK, ...pipelines }, roleOf);

describe('pipelineErrors', () => {
  it('accepts the template pipelines, and a reordered task pipeline', () => {
    expect(errors({})).toEqual([]);
    expect(errors({ TASK: ['BACKLOG', 'IMPLEMENTATION', 'QA', 'CODE_REVIEW', 'DONE'] })).toEqual(
      [],
    );
  });

  it('requires a pipeline to start at BACKLOG and end at DONE', () => {
    expect(errors({ TASK: ['IMPLEMENTATION', 'DONE'] })).toEqual([
      expect.stringMatching(/TASK pipeline must start at BACKLOG/),
    ]);
    expect(errors({ TASK: ['BACKLOG', 'IMPLEMENTATION'] })).toEqual([
      expect.stringMatching(/TASK pipeline must .*end at DONE/),
    ]);
  });

  it('refuses a column listed twice, naming the kind and the column', () => {
    expect(errors({ TASK: ['BACKLOG', 'QA', 'QA', 'DONE'] })).toEqual([
      expect.stringMatching(/QA.*twice.*TASK/),
    ]);
  });

  it('refuses a column with no column spec, naming it', () => {
    expect(errors({ TASK: ['BACKLOG', 'IMPLEMENTATION', 'SECURITY_REVIEW', 'DONE'] })).toEqual([
      expect.stringMatching(/SECURITY_REVIEW.*TASK.*no column spec/),
    ]);
  });

  it('requires exactly one decomposition column in an EPIC pipeline', () => {
    expect(
      errors({ EPIC: ['BACKLOG', 'SPEC_REVIEW', 'TECH_SPEC', 'INTEGRATION_REVIEW', 'DONE'] }),
    ).toEqual([expect.stringMatching(/EPIC pipeline has no column with role `decomposition`/)]);
  });

  it('requires the decomposition column before any integration or final-gate column', () => {
    expect(
      errors({
        EPIC: [
          'BACKLOG',
          'SPEC_REVIEW',
          'INTEGRATION_REVIEW',
          'TASK_BREAKDOWN',
          'DOD_GATE',
          'DONE',
        ],
      }),
    ).toEqual([expect.stringMatching(/TASK_BREAKDOWN.*before INTEGRATION_REVIEW/)]);
  });

  it('allows at most one final-gate, and only as the last column before DONE', () => {
    expect(
      errors({
        EPIC: [
          'BACKLOG',
          'SPEC_REVIEW',
          'TASK_BREAKDOWN',
          'DOD_GATE',
          'INTEGRATION_REVIEW',
          'DONE',
        ],
      }),
    ).toEqual([expect.stringMatching(/DOD_GATE.*EPIC.*last column before DONE/)]);
    expect(
      pipelineErrors({ EPIC, TASK: ['BACKLOG', 'GATE_A', 'GATE_B', 'DONE'] }, (column) =>
        column.startsWith('GATE') ? 'final-gate' : roleOf(column),
      ),
    ).toEqual([expect.stringMatching(/TASK pipeline has 2 columns with role `final-gate`/)]);
  });
});
