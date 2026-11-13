import { describe, expect, it } from 'vitest';

import type { ConformanceReport } from '../../cli/generated/types.gen.js';
import { buildDecisionParameters, unverifiedCriteriaIds } from './dod-gate-data.js';

function report(
  criteria: Array<{ id: string; verdict: 'pass' | 'fail' | 'unverified' }>,
): ConformanceReport {
  return {
    schema_version: 0,
    meta: {
      feature: 'web-ui',
      epic: 'WEB-1',
      spec: { repo: 'aeos-aeos', commit: 'abc', path: 'features/web-ui' },
      code: { repo: 'aeos-aeos', commit: 'def' },
      generated_at: '2026-11-13T00:00:00.000Z',
    },
    criteria: criteria.map((c) => ({ id: c.id, verdict: c.verdict, instruments: [] })),
    summary: { total: criteria.length, pass: 0, fail: 0, unverified: 0 },
  };
}

describe('unverifiedCriteriaIds', () => {
  it('returns [] for a null report', () => {
    expect(unverifiedCriteriaIds(null)).toEqual([]);
  });

  it('keeps only still-unverified criteria, not passed or failed ones', () => {
    const r = report([
      { id: 'AC-1', verdict: 'pass' },
      { id: 'AC-2', verdict: 'unverified' },
      { id: 'AC-3', verdict: 'fail' },
      { id: 'AC-4', verdict: 'unverified' },
    ]);
    expect(unverifiedCriteriaIds(r)).toEqual(['AC-2', 'AC-4']);
  });
});

describe('buildDecisionParameters', () => {
  it('always sends id and decision, omits reason/verified/review-hash when empty', () => {
    const parameters = buildDecisionParameters({
      ticketId: 'WEB-14',
      decision: 'approve',
      reviewHash: null,
      reason: '',
      verified: new Set(),
    });
    expect(parameters).toEqual({ id: 'WEB-14', decision: 'approve' });
  });

  it('includes review-hash, reason and verified when present', () => {
    const parameters = buildDecisionParameters({
      ticketId: 'WEB-14',
      decision: 'reject',
      reviewHash: 'deadbeef',
      reason: 'not done',
      verified: new Set(['AC-2', 'AC-4']),
    });
    expect(parameters).toEqual({
      id: 'WEB-14',
      decision: 'reject',
      'review-hash': 'deadbeef',
      reason: 'not done',
      verified: ['AC-2', 'AC-4'],
    });
  });
});
