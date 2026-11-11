import { describe, expect, it } from 'vitest';

import { Column, displayOrder } from '../model/column.js';
import { templatePipelines } from '../../infrastructure/spec-loader/yaml-pipeline-loader.adapter.js';
import {
  columnLabels,
  defaultLabel,
  labelErrors,
  labelFor,
  resolveColumn,
  withColumnLabels,
} from './column-labels.js';

// Every column of the shipped pipelines.
const COLUMNS = displayOrder(templatePipelines());

describe('defaultLabel', () => {
  it('is the identifier in sentence case', () => {
    expect(defaultLabel('SPEC_REVIEW')).toBe('Spec review');
    expect(defaultLabel('QA')).toBe('Qa');
    expect(defaultLabel(Column.DONE)).toBe('Done');
  });
});

describe('labelFor', () => {
  const specs = { TECH_SPEC: { label: 'Shaping' }, QA: {} };
  const project = { labels: { BACKLOG: 'Inbox' } };

  it("takes the column spec's label first", () => {
    expect(labelFor('TECH_SPEC', specs, project)).toBe('Shaping');
  });

  it('takes the labels map of project.json for a column with no spec', () => {
    expect(labelFor(Column.BACKLOG, specs, project)).toBe('Inbox');
  });

  it('falls back to the default', () => {
    expect(labelFor('QA', specs, project)).toBe('Qa');
    expect(labelFor(Column.DONE, specs, null)).toBe('Done');
  });

  it('gives every column a label', () => {
    expect(columnLabels(COLUMNS, specs, project)).toMatchObject({
      BACKLOG: 'Inbox',
      SPEC_REVIEW: 'Spec review',
      TECH_SPEC: 'Shaping',
      DONE: 'Done',
    });
    expect(Object.keys(columnLabels(COLUMNS, {}, null))).toEqual(COLUMNS);
  });
});

describe('resolveColumn', () => {
  const labels = columnLabels(COLUMNS, { TECH_SPEC: { label: 'Shaping' } }, null);

  it('accepts an identifier or a label, in any case', () => {
    expect(resolveColumn('tech_spec', labels)).toBe('TECH_SPEC');
    expect(resolveColumn('shaping', labels)).toBe('TECH_SPEC');
    expect(resolveColumn(' Spec Review ', labels)).toBe('SPEC_REVIEW');
  });

  it('prefers the identifier when a label says the same', () => {
    expect(resolveColumn('qa', { ...labels, TECH_SPEC: 'qa' })).toBe('QA');
  });

  it('is null for anything else', () => {
    expect(resolveColumn('nowhere', labels)).toBeNull();
  });
});

describe('labelErrors', () => {
  const source = (column: Column, label: string, file: string) => ({ column, label, source: file });

  it('accepts distinct labels, and a label that is its own identifier', () => {
    expect(
      labelErrors([
        source('TECH_SPEC', 'Shaping', 'column-specs/tech-spec.yaml'),
        source('QA', 'qa', 'column-specs/qa.yaml'),
      ]),
    ).toEqual([]);
  });

  it('names both files when two columns share a label, whatever the case', () => {
    const [error] = labelErrors([
      source('TECH_SPEC', 'Shaping', 'column-specs/tech-spec.yaml'),
      source('QA', 'shaping', 'column-specs/qa.yaml'),
    ]);

    expect(error).toContain('column-specs/tech-spec.yaml');
    expect(error).toContain('column-specs/qa.yaml');
  });

  it('refuses an empty label, one over 40 characters, and the identifier of another column', () => {
    expect(labelErrors([source('QA', '  ', 'column-specs/qa.yaml')])).toHaveLength(1);
    expect(labelErrors([source('QA', 'x'.repeat(41), 'column-specs/qa.yaml')])).toHaveLength(1);
    expect(labelErrors([source('QA', 'x'.repeat(40), 'column-specs/qa.yaml')])).toEqual([]);
    expect(labelErrors([source('TECH_SPEC', 'Done', 'column-specs/tech-spec.yaml')])).toEqual([
      expect.stringContaining('DONE'),
    ]);
  });
});

describe('withColumnLabels', () => {
  it('replaces column identifiers in a message, and nothing else', () => {
    const labels = columnLabels(COLUMNS, { TECH_SPEC: { label: 'Shaping' } }, null);

    expect(withColumnLabels('advanced SPEC_REVIEW → TECH_SPEC; AEOS-1 is SIGNED_OFF', labels)).toBe(
      'advanced Spec review → Shaping; AEOS-1 is SIGNED_OFF',
    );
  });
});
