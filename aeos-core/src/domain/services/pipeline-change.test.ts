import { describe, expect, it } from 'vitest';

import { isInFlight, pipelineChanged } from './pipeline-change.js';

describe('isInFlight', () => {
  it('is true for every column but BACKLOG and DONE', () => {
    expect(isInFlight('CODE_REVIEW')).toBe(true);
    expect(isInFlight('BACKLOG')).toBe(false);
    expect(isInFlight('DONE')).toBe(false);
  });
});

describe('pipelineChanged', () => {
  it('is false for the same columns in the same order', () => {
    expect(pipelineChanged(['BACKLOG', 'QA', 'DONE'], ['BACKLOG', 'QA', 'DONE'])).toBe(false);
  });

  it('is true for a reordered, added or dropped column', () => {
    const accepted = ['BACKLOG', 'CODE_REVIEW', 'QA', 'DONE'];

    expect(pipelineChanged(accepted, ['BACKLOG', 'QA', 'CODE_REVIEW', 'DONE'])).toBe(true);
    expect(pipelineChanged(accepted, ['BACKLOG', 'CODE_REVIEW', 'QA', 'AUDIT', 'DONE'])).toBe(true);
    expect(pipelineChanged(accepted, ['BACKLOG', 'QA', 'DONE'])).toBe(true);
  });
});
