import { describe, it, expect } from 'vitest';
import { Column, displayOrder, isValidColumn, type Pipelines } from './column.js';

const pipelines: Pipelines = {
  EPIC: ['BACKLOG', 'SPEC_REVIEW', 'TASK_BREAKDOWN', 'DONE'],
  TASK: ['BACKLOG', 'IMPLEMENTATION', 'QA', 'DONE'],
};

describe('Column', () => {
  it('names only the two structural columns', () => {
    expect(Column).toEqual({ BACKLOG: 'BACKLOG', DONE: 'DONE' });
  });
});

describe('displayOrder', () => {
  it('lists every column of every pipeline once, BACKLOG first and DONE last', () => {
    expect(displayOrder(pipelines)).toEqual([
      'BACKLOG',
      'SPEC_REVIEW',
      'TASK_BREAKDOWN',
      'IMPLEMENTATION',
      'QA',
      'DONE',
    ]);
  });
});

describe('isValidColumn', () => {
  it('is true for a column of any loaded pipeline', () => {
    expect(isValidColumn('QA', pipelines)).toBe(true);
    expect(isValidColumn('SPEC_REVIEW', pipelines)).toBe(true);
    expect(isValidColumn('DONE', pipelines)).toBe(true);
  });

  it('is false for anything else, whatever the case', () => {
    expect(isValidColumn('NOT_A_COLUMN', pipelines)).toBe(false);
    expect(isValidColumn('', pipelines)).toBe(false);
    expect(isValidColumn('backlog', pipelines)).toBe(false);
  });
});
