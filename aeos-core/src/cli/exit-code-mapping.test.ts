import { describe, expect, it } from 'vitest';

import { exitCodeFor } from './exit-code-mapping.js';
import { EXIT } from './generated/exit-codes.gen.js';

describe('exitCodeFor', () => {
  it('keeps an interrupted orchestrator run at 130, and any other early stop off it', () => {
    expect(exitCodeFor({ haltReason: 'INTERRUPTED' })).toBe(130);
    expect(exitCodeFor({ haltReason: 'FAILED' })).toBe(EXIT.failure);
    expect(exitCodeFor({ haltReason: 'COMPLETE' })).toBe(EXIT.success);
  });

  it.each([
    'NEEDS_HUMAN',
    'AWAITING_APPROVAL',
    'HUMAN_GATE',
    'AWAITING_DECOMPOSITION',
    'BUDGET_EXCEEDED',
    'COST_UNKNOWN',
  ] as const)('maps the halt %s to needs_human', (haltReason) => {
    expect(exitCodeFor({ haltReason })).toBe(EXIT.needs_human);
  });

  it('maps a sub-state: escalation and a block are not failure', () => {
    expect(exitCodeFor({ subState: 'SIGNED_OFF' })).toBe(EXIT.success);
    expect(exitCodeFor({ subState: 'FAILED' })).toBe(EXIT.failure);
    expect(exitCodeFor({ subState: 'ESCALATED' })).toBe(EXIT.needs_human);
    expect(exitCodeFor({ subState: 'BLOCKED' })).toBe(EXIT.needs_human);
    expect(exitCodeFor({ subState: 'INTERRUPTED' })).toBe(EXIT.interrupted);
  });

  it('maps the situations a command names itself', () => {
    expect(exitCodeFor('done')).toBe(0);
    expect(exitCodeFor('error')).toBe(1);
    expect(exitCodeFor('usage')).toBe(2);
    expect(exitCodeFor('gate-refused')).toBe(3);
    expect(exitCodeFor('missing-resource')).toBe(4);
    expect(exitCodeFor('interrupted')).toBe(130);
  });
});
