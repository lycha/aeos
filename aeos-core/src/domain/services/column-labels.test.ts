import { describe, expect, it } from 'vitest';

import { Column, COLUMN_ORDER } from '../model/column.js';
import {
  columnLabels,
  defaultLabel,
  labelErrors,
  labelFor,
  resolveColumn,
  withColumnLabels,
} from './column-labels.js';

describe('defaultLabel', () => {
  it('is the identifier in sentence case', () => {
    expect(defaultLabel(Column.SPEC_REVIEW)).toBe('Spec review');
    expect(defaultLabel(Column.QA)).toBe('Qa');
    expect(defaultLabel(Column.DONE)).toBe('Done');
  });
});

describe('labelFor', () => {
  const specs = { [Column.TECH_SPEC]: { label: 'Shaping' }, [Column.QA]: {} };
  const project = { labels: { BACKLOG: 'Inbox' } };

  it("takes the column spec's label first", () => {
    expect(labelFor(Column.TECH_SPEC, specs, project)).toBe('Shaping');
  });

  it('takes the labels map of project.json for a column with no spec', () => {
    expect(labelFor(Column.BACKLOG, specs, project)).toBe('Inbox');
  });

  it('falls back to the default', () => {
    expect(labelFor(Column.QA, specs, project)).toBe('Qa');
    expect(labelFor(Column.DONE, specs, null)).toBe('Done');
  });

  it('gives every column a label', () => {
    expect(columnLabels(specs, project)).toMatchObject({
      BACKLOG: 'Inbox',
      SPEC_REVIEW: 'Spec review',
      TECH_SPEC: 'Shaping',
      DONE: 'Done',
    });
    expect(Object.keys(columnLabels({}, null))).toEqual([...COLUMN_ORDER]);
  });
});

describe('resolveColumn', () => {
  const labels = columnLabels({ [Column.TECH_SPEC]: { label: 'Shaping' } }, null);

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
        source(Column.TECH_SPEC, 'Shaping', 'column-specs/tech-spec.yaml'),
        source(Column.QA, 'qa', 'column-specs/qa.yaml'),
      ]),
    ).toEqual([]);
  });

  it('names both files when two columns share a label, whatever the case', () => {
    const [error] = labelErrors([
      source(Column.TECH_SPEC, 'Shaping', 'column-specs/tech-spec.yaml'),
      source(Column.QA, 'shaping', 'column-specs/qa.yaml'),
    ]);

    expect(error).toContain('column-specs/tech-spec.yaml');
    expect(error).toContain('column-specs/qa.yaml');
  });

  it('refuses an empty label, one over 40 characters, and the identifier of another column', () => {
    expect(labelErrors([source(Column.QA, '  ', 'column-specs/qa.yaml')])).toHaveLength(1);
    expect(labelErrors([source(Column.QA, 'x'.repeat(41), 'column-specs/qa.yaml')])).toHaveLength(
      1,
    );
    expect(labelErrors([source(Column.QA, 'x'.repeat(40), 'column-specs/qa.yaml')])).toEqual([]);
    expect(labelErrors([source(Column.TECH_SPEC, 'Done', 'column-specs/tech-spec.yaml')])).toEqual([
      expect.stringContaining('DONE'),
    ]);
  });
});

describe('withColumnLabels', () => {
  it('replaces column identifiers in a message, and nothing else', () => {
    const labels = columnLabels({ [Column.TECH_SPEC]: { label: 'Shaping' } }, null);

    expect(withColumnLabels('advanced SPEC_REVIEW → TECH_SPEC; AEOS-1 is SIGNED_OFF', labels)).toBe(
      'advanced Spec review → Shaping; AEOS-1 is SIGNED_OFF',
    );
  });
});
