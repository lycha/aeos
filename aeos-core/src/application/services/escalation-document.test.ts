import { describe, it, expect } from 'vitest';

import {
  buildEscalationDocument,
  parseEscalationResponse,
  buildResolutionDocument,
  escalationFilename,
} from './escalation-document.js';

describe('escalation-document', () => {
  it('builds a document with an empty response block and a resolve hint', () => {
    const doc = buildEscalationDocument({
      ticketId: 'STAN-4',
      column: 'CODE_REVIEW',
      reason: 'NOT_CONVERGING',
      message: 'Attempt 2 reproduced the same blockers.',
      artifactPath: 'STAN-4-code-review-review.md',
    });

    expect(doc).toContain('Reason: NOT_CONVERGING');
    expect(doc).toContain('Attempt 2 reproduced the same blockers.');
    expect(doc).toContain('See: STAN-4-code-review-review.md');
    expect(doc).toContain('aeos ticket resolve STAN-4');
    // Round-trips to null: nothing written yet.
    expect(parseEscalationResponse(doc)).toBeNull();
  });

  it('parses the operator response, ignoring guidance comments', () => {
    const doc = buildEscalationDocument({
      ticketId: 'STAN-4',
      column: 'CODE_REVIEW',
      reason: 'NOT_CONVERGING',
      message: 'stuck',
    });
    const filled = doc.replace(
      /```text\n\n```/,
      '```text\nUse response_url per D-6, not chat.update.\n```',
    );

    expect(parseEscalationResponse(filled)).toBe('Use response_url per D-6, not chat.update.');
  });

  it('returns null when the response block is only whitespace', () => {
    const doc = buildEscalationDocument({
      ticketId: 'X-1',
      column: 'QA',
      reason: 'ITERATIONS_EXHAUSTED',
      message: 'm',
    });
    expect(parseEscalationResponse(doc.replace(/```text\n\n```/, '```text\n   \n```'))).toBeNull();
  });

  it('names the artifact file', () => {
    expect(escalationFilename('STAN-4')).toBe('STAN-4-escalation.md');
  });

  it('renders the resolution as authoritative guidance', () => {
    const res = buildResolutionDocument('STAN-4', 'NOT_CONVERGING', 'do X');
    expect(res).toContain('Operator Resolution: STAN-4');
    expect(res).toContain('do X');
    expect(res).toContain('overrides earlier assumptions');
  });
});
