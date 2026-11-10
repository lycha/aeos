import { describe, expect, it } from 'vitest';

import {
  buildPullRequestBody,
  buildTaskCommitMessage,
  fillConformance,
} from './pull-request-text.js';

describe('buildTaskCommitMessage', () => {
  it('carries a Ticket trailer for a standalone task', () => {
    expect(buildTaskCommitMessage({ id: 'AEOS-12', title: 'Title', parentId: null })).toBe(
      '[AEOS-12] Title\n\nTicket: AEOS-12',
    );
  });

  it('adds the Epic trailer for a child task', () => {
    expect(buildTaskCommitMessage({ id: 'AEOS-12', title: 'Title', parentId: 'AEOS-10' })).toBe(
      '[AEOS-12] Title\n\nTicket: AEOS-12\nEpic: AEOS-10',
    );
  });

  it('appends extra trailers after its own', () => {
    expect(
      buildTaskCommitMessage({ id: 'AEOS-12', title: 'Title', parentId: 'AEOS-10' }, [
        ['Spec', 'abc123'],
        ['Implements', 'AC-1'],
      ]),
    ).toBe('[AEOS-12] Title\n\nTicket: AEOS-12\nEpic: AEOS-10\nSpec: abc123\nImplements: AC-1');
  });
});

describe('buildPullRequestBody', () => {
  const base = {
    ticketId: 'AEOS-10',
    title: 'Checkout flow',
    reviewLabel: 'Integration review',
    reviewPath: '.aeos/tickets/AEOS-10/AEOS-10-integration-review.md',
    reviewSummary: 'APPROVED, 0 blockers, 1 warnings',
    checksTable: '| Check | Result | Duration |\n| --- | --- | --- |\n| test | passed | 1.2s |',
    costs: [0.5, 0.25, null],
  };

  it('names the ticket, the review, the checks and the known cost', () => {
    const body = buildPullRequestBody(base);

    expect(body).toContain('AEOS-10');
    expect(body).toContain('Checkout flow');
    expect(body).toContain(
      'Integration review: `.aeos/tickets/AEOS-10/AEOS-10-integration-review.md` (APPROVED, 0 blockers, 1 warnings)',
    );
    expect(body).toContain('| test | passed | 1.2s |');
    expect(body).toContain('$0.7500');
    expect(body).toContain('1 run with unknown cost not included');
  });

  it('leaves marked placeholders for the spec pin and the conformance summary', () => {
    const body = buildPullRequestBody(base);

    expect(body).toContain('<!-- aeos:spec-pin -->');
    expect(body).toContain('<!-- aeos:conformance -->');
  });

  it('fills the spec-pin placeholder for a spec-backed ticket', () => {
    const body = buildPullRequestBody({
      ...base,
      specPin: { repo: 'AEOS-aeos', commit: 'c0ffee1', path: 'features/checkout' },
    });

    expect(body).toContain(
      '<!-- aeos:spec-pin -->\nSpec: `AEOS-aeos@c0ffee1`, `features/checkout`',
    );
    expect(body).not.toContain('Spec pin: not recorded yet');
  });

  it('says so when there is no review, no checks table and no known cost', () => {
    const body = buildPullRequestBody({
      ...base,
      reviewPath: null,
      reviewSummary: null,
      checksTable: null,
      costs: [null],
    });

    expect(body).toContain('Integration review: not found');
    expect(body).toContain('No checks were recorded');
    expect(body).toContain('Total cost: unknown');
  });

  it('has its conformance placeholder filled, and filled again, without touching the rest', () => {
    const body = buildPullRequestBody(base);

    const filled = fillConformance(body, '1 pass, 0 fail, 0 unverified of 1.\n\n| AC-1 | pass |');
    const refilled = fillConformance(filled, '0 pass, 1 fail, 0 unverified of 1.');

    expect(filled).toContain(
      '<!-- aeos:conformance -->\n1 pass, 0 fail, 0 unverified of 1.\n\n| AC-1 | pass |\n\n## Cost',
    );
    expect(filled).not.toContain('not recorded yet._\n\n## Cost');
    expect(refilled).toContain(
      '<!-- aeos:conformance -->\n0 pass, 1 fail, 0 unverified of 1.\n\n## Cost',
    );
    expect(refilled).not.toContain('AC-1');
    expect(filled.split('<!-- aeos:conformance -->')[0]).toBe(
      body.split('<!-- aeos:conformance -->')[0],
    );
  });

  it('shows the reproduction of a bug: the command, red, then green', () => {
    const repro = '# Reproduction\n\nCommand: `npx vitest run a.test.ts`\n\n| Run | Exit code |';

    expect(buildPullRequestBody({ ...base, repro })).toContain(
      `## Reproduction\n\n${repro.split('\n').slice(2).join('\n')}`,
    );
    expect(buildPullRequestBody(base)).not.toContain('## Reproduction');
  });
});
