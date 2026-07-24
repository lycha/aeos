import { describe, it, expect } from 'vitest';
import { Column, COLUMN_ORDER, isValidColumn } from './column.js';

describe('Column', () => {
  it('Column.BACKLOG equals the string "BACKLOG"', () => {
    expect(Column.BACKLOG).toBe('BACKLOG');
  });

  it('all 10 column values are distinct strings', () => {
    const values = Object.values(Column);
    expect(values).toHaveLength(10);
    expect(new Set(values).size).toBe(10);
  });
});

describe('COLUMN_ORDER', () => {
  it('contains all 10 columns in correct pipeline order', () => {
    expect(COLUMN_ORDER).toHaveLength(10);
    expect([...COLUMN_ORDER]).toEqual([
      'BACKLOG',
      'PRODUCT_SCOPING',
      'TECH_SPEC',
      'TASK_BREAKDOWN',
      'IMPLEMENTATION',
      'CODE_REVIEW',
      'QA',
      'INTEGRATION_REVIEW',
      'DOD_GATE',
      'DONE',
    ]);
  });

  it('contains every Column value exactly once', () => {
    const allColumns = Object.values(Column);
    for (const col of allColumns) {
      expect(COLUMN_ORDER).toContain(col);
    }
    expect(COLUMN_ORDER).toHaveLength(allColumns.length);
  });
});

describe('isValidColumn', () => {
  it.each(Object.values(Column))('returns true for valid column "%s"', (col) => {
    expect(isValidColumn(col)).toBe(true);
  });

  it('returns false for an invalid string', () => {
    expect(isValidColumn('NOT_A_COLUMN')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidColumn('')).toBe(false);
  });

  it('returns false for lowercase variant', () => {
    expect(isValidColumn('backlog')).toBe(false);
  });
});
