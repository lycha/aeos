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
      errors({
        EPIC: ['BACKLOG', 'SPEC_REVIEW', 'TECH_SPEC', 'INTEGRATION_REVIEW', 'DOD_GATE', 'DONE'],
      }),
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

  it('requires a final-gate column in an EPIC pipeline, and says how to get one', () => {
    // A project scaffolded before column roles: specs with no role are standard.
    expect(pipelineErrors({ EPIC, TASK }, () => 'standard')).toContainEqual(
      expect.stringMatching(
        /EPIC pipeline has no column with role `final-gate`; it needs exactly one.*aeos project sync/,
      ),
    );
  });

  it('allows only one final-gate, and only as the last column before DONE', () => {
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
      pipelineErrors(
        { EPIC: ['BACKLOG', 'SPEC_REVIEW', 'TASK_BREAKDOWN', 'GATE_A', 'GATE_B', 'DONE'], TASK },
        (column) => (column.startsWith('GATE') ? 'final-gate' : roleOf(column)),
      ),
    ).toEqual([expect.stringMatching(/EPIC pipeline has 2 columns with role `final-gate`/)]);
  });

  it('requires exactly one spec-review column in an EPIC pipeline', () => {
    expect(
      errors({ EPIC: ['BACKLOG', 'TECH_SPEC', 'TASK_BREAKDOWN', 'DOD_GATE', 'DONE'] }),
    ).toEqual([expect.stringMatching(/EPIC pipeline has no column with role `spec-review`/)]);
    expect(
      pipelineErrors(
        {
          EPIC: ['BACKLOG', 'SPEC_REVIEW', 'SPEC_AGAIN', 'TASK_BREAKDOWN', 'DOD_GATE', 'DONE'],
          TASK,
        },
        (column) => (column === 'SPEC_AGAIN' ? 'spec-review' : roleOf(column)),
      ),
    ).toEqual([expect.stringMatching(/EPIC pipeline has 2 columns with role `spec-review`/)]);
  });

  it('requires the spec-review column before the decomposition column', () => {
    expect(
      errors({ EPIC: ['BACKLOG', 'TASK_BREAKDOWN', 'SPEC_REVIEW', 'DOD_GATE', 'DONE'] }),
    ).toEqual([expect.stringMatching(/SPEC_REVIEW.*EPIC.*before TASK_BREAKDOWN/)]);
  });

  it.each(['SPEC_REVIEW', 'TASK_BREAKDOWN', 'DOD_GATE'])(
    'refuses %s, by its role, in a TASK pipeline',
    (column) => {
      expect(errors({ TASK: ['BACKLOG', 'IMPLEMENTATION', column, 'DONE'] })).toEqual([
        expect.stringMatching(new RegExp(`${column} \\(.*\\).*TASK pipeline`)),
      ]);
    },
  );
});
