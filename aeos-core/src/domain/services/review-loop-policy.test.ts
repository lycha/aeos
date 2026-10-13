import { describe, it, expect } from 'vitest';

import { decideNextAttempt, type LoopConfig } from './review-loop-policy.js';
import { Verdict, type ReviewVerdict } from '../model/review-verdict.js';
import { EscalationReason } from '../model/escalation.js';

const loopOn: LoopConfig = { enabled: true, maxIterations: 5, escalation: 'escalate_to_human' };

function verdict(overrides: Partial<ReviewVerdict> = {}): ReviewVerdict {
  return {
    verdict: Verdict.REJECTED,
    blockers: 1,
    warnings: 0,
    info: 0,
    blockerTopics: ['alpha'],
    ...overrides,
  };
}

describe('decideNextAttempt', () => {
  describe('severity gate', () => {
    it('advances on APPROVED', () => {
      const decision = decideNextAttempt({
        verdict: verdict({ verdict: Verdict.APPROVED, blockers: 0, blockerTopics: [] }),
        attempt: 1,
        config: loopOn,
        previousBlockerTopics: [],
      });

      expect(decision.action).toBe('advance');
    });

    it('advances on APPROVED_WITH_WARNINGS without consuming an attempt', () => {
      const decision = decideNextAttempt({
        verdict: verdict({
          verdict: Verdict.APPROVED_WITH_WARNINGS,
          blockers: 0,
          warnings: 4,
          blockerTopics: [],
        }),
        attempt: 1,
        config: loopOn,
        previousBlockerTopics: [],
      });

      expect(decision.action).toBe('advance');
      if (decision.action !== 'advance') return;
      expect(decision.reason).toContain('4 warning');
    });
  });

  describe('iteration ceiling', () => {
    it('retries a rejection while attempts remain', () => {
      const decision = decideNextAttempt({
        verdict: verdict(),
        attempt: 1,
        config: loopOn,
        previousBlockerTopics: [],
      });

      expect(decision.action).toBe('retry');
      if (decision.action !== 'retry') return;
      expect(decision.nextAttempt).toBe(2);
    });

    it('escalates once the cap is reached', () => {
      const decision = decideNextAttempt({
        verdict: verdict({ blockerTopics: ['epsilon'] }),
        attempt: 5,
        config: loopOn,
        previousBlockerTopics: [['alpha'], ['beta'], ['gamma'], ['delta']],
      });

      expect(decision.action).toBe('escalate');
      if (decision.action !== 'escalate') return;
      expect(decision.escalation.reason).toBe(EscalationReason.ITERATIONS_EXHAUSTED);
      expect(decision.escalation.attempt).toBe(5);
    });

    it('advances instead of escalating when the column policy is mark_done', () => {
      const decision = decideNextAttempt({
        verdict: verdict({ blockerTopics: ['epsilon'] }),
        attempt: 5,
        config: { ...loopOn, escalation: 'mark_done' },
        previousBlockerTopics: [['alpha'], ['beta'], ['gamma'], ['delta']],
      });

      expect(decision.action).toBe('advance');
      if (decision.action !== 'advance') return;
      expect(decision.reason).toContain('mark_done');
    });
  });

  describe('disabled loop', () => {
    it('escalates on the first rejection', () => {
      const decision = decideNextAttempt({
        verdict: verdict(),
        attempt: 1,
        config: { ...loopOn, enabled: false },
        previousBlockerTopics: [],
      });

      expect(decision.action).toBe('escalate');
      if (decision.action !== 'escalate') return;
      expect(decision.escalation.reason).toBe(EscalationReason.ITERATIONS_EXHAUSTED);
      expect(decision.escalation.message).toContain('disabled');
    });

    it('still advances an approval', () => {
      const decision = decideNextAttempt({
        verdict: verdict({ verdict: Verdict.APPROVED, blockers: 0, blockerTopics: [] }),
        attempt: 1,
        config: { ...loopOn, enabled: false },
        previousBlockerTopics: [],
      });

      expect(decision.action).toBe('advance');
    });
  });

  describe('convergence detection', () => {
    it('escalates when a retry reproduces the same blockers', () => {
      const decision = decideNextAttempt({
        verdict: verdict({ blockerTopics: ['alpha', 'beta'] }),
        attempt: 2,
        config: loopOn,
        previousBlockerTopics: [['alpha', 'beta']],
      });

      expect(decision.action).toBe('escalate');
      if (decision.action !== 'escalate') return;
      expect(decision.escalation.reason).toBe(EscalationReason.NOT_CONVERGING);
    });

    it('escalates when the blocker set shrinks but adds nothing new', () => {
      const decision = decideNextAttempt({
        verdict: verdict({ blockerTopics: ['alpha'] }),
        attempt: 2,
        config: loopOn,
        previousBlockerTopics: [['alpha', 'beta']],
      });

      expect(decision.action).toBe('escalate');
      if (decision.action !== 'escalate') return;
      expect(decision.escalation.reason).toBe(EscalationReason.NOT_CONVERGING);
    });

    it('retries when the retry surfaces a genuinely new blocker', () => {
      const decision = decideNextAttempt({
        verdict: verdict({ blockerTopics: ['alpha', 'gamma'] }),
        attempt: 2,
        config: loopOn,
        previousBlockerTopics: [['alpha', 'beta']],
      });

      expect(decision.action).toBe('retry');
    });

    it('does not claim a stall when the reviewer omitted topics', () => {
      const decision = decideNextAttempt({
        verdict: verdict({ blockerTopics: [] }),
        attempt: 2,
        config: loopOn,
        previousBlockerTopics: [['alpha']],
      });

      expect(decision.action).toBe('retry');
    });

    it('compares only against the immediately previous attempt', () => {
      // alpha reappears after being fixed in attempt 2 — a regression, not a stall.
      const decision = decideNextAttempt({
        verdict: verdict({ blockerTopics: ['alpha'] }),
        attempt: 3,
        config: loopOn,
        previousBlockerTopics: [['alpha'], ['beta']],
      });

      expect(decision.action).toBe('retry');
    });

    it('ignores convergence when the loop is disabled', () => {
      const decision = decideNextAttempt({
        verdict: verdict({ blockerTopics: ['alpha'] }),
        attempt: 1,
        config: { ...loopOn, enabled: false },
        previousBlockerTopics: [['alpha']],
      });

      expect(decision.action).toBe('escalate');
      if (decision.action !== 'escalate') return;
      expect(decision.escalation.reason).toBe(EscalationReason.ITERATIONS_EXHAUSTED);
    });
  });

  it('treats maxIterations below 1 as a single attempt', () => {
    const decision = decideNextAttempt({
      verdict: verdict(),
      attempt: 1,
      config: { ...loopOn, maxIterations: 0 },
      previousBlockerTopics: [],
    });

    expect(decision.action).toBe('escalate');
  });
});
