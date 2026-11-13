// Criteria traced here: @AC-10 (live run progress: stage/agent/executor/model/mode/attempts/rejections/cost/output) @AC-11 (interrupt a run).
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyJobEvent,
  createInitialRunViewState,
  formatRunCost,
  interruptJob,
  type RunViewState,
} from './run-view-data.js';
import type { TicketRunEvent } from '../../domain/model/ticket-run-event.js';

const BASE = {
  runId: 'run-1',
  projectId: 'P',
  ticketId: 'T-1',
  column: 'IMPLEMENTATION',
  at: '2026-11-13T00:00:00Z',
};

function event(
  partial: Partial<TicketRunEvent> & Pick<TicketRunEvent, 'type' | 'payload' | 'phase'>,
  sequence: number,
): TicketRunEvent {
  return { ...BASE, sequence, ...partial } as TicketRunEvent;
}

function fold(events: TicketRunEvent[]): RunViewState {
  return events.reduce(applyJobEvent, createInitialRunViewState());
}

describe('applyJobEvent', () => {
  it('starts from —/running defaults', () => {
    const state = createInitialRunViewState();
    expect(state).toMatchObject({ executor: '—', model: '—', mode: '—', finalStatus: 'running' });
  });

  it('records the executor and model from ticket-run.started', () => {
    const state = fold([
      event(
        {
          type: 'ticket-run.started',
          phase: 'eligibility',
          payload: { executor: 'claude-cli', model: 'opus' },
        },
        1,
      ),
    ]);
    expect(state.executor).toBe('claude-cli');
    expect(state.model).toBe('opus');
    expect(state.output).toEqual(['[run] started | executor=claude-cli']);
  });

  it('tracks stage, agent, executor, model and mode from stage.started', () => {
    const state = fold([
      event(
        {
          type: 'stage.started',
          phase: 'worker',
          payload: {
            stage: 'worker',
            message: 'running the worker',
            agent: 'architect-agent',
            executor: 'claude-cli',
            model: 'opus',
            mode: 'agentic',
          },
        },
        1,
      ),
    ]);
    expect(state).toMatchObject({
      stage: 'worker',
      stageStatus: 'active',
      agent: 'architect-agent',
      executor: 'claude-cli',
      model: 'opus',
      mode: 'agentic',
      statusMessage: 'running the worker',
    });
  });

  it('counts a revision attempt from run.attempt.started', () => {
    const state = fold([
      event(
        {
          type: 'run.attempt.started',
          phase: 'worker',
          payload: { attempt: 2, maxAttempts: 5, carryingFeedback: true },
        },
        1,
      ),
    ]);
    expect(state.attempt).toBe(2);
    expect(state.maxAttempts).toBe(5);
    expect(state.output).toEqual(['[run] revision attempt 2 of 5']);
  });

  it('does not log the first attempt (implied by the run)', () => {
    const state = fold([
      event(
        {
          type: 'run.attempt.started',
          phase: 'worker',
          payload: { attempt: 1, maxAttempts: 5, carryingFeedback: false },
        },
        1,
      ),
    ]);
    expect(state.output).toEqual([]);
  });

  it('counts each review.rejected as a rejection', () => {
    const state = fold([
      event(
        {
          type: 'review.rejected',
          phase: 'reviewer',
          payload: { reviewPath: 'r.md', reason: 'missing tests' },
        },
        1,
      ),
      event(
        {
          type: 'review.rejected',
          phase: 'reviewer',
          payload: { reviewPath: 'r.md', reason: 'wrong shape' },
        },
        2,
      ),
    ]);
    expect(state.rejections).toBe(2);
  });

  it('accumulates known cost and flags an unknown one without folding it into the total (AC-26 pattern)', () => {
    const state = fold([
      event(
        {
          type: 'cost.recorded',
          phase: 'worker',
          payload: { role: 'worker', inputTokens: 10, outputTokens: 20, costUsd: 0.5 },
        },
        1,
      ),
      event(
        {
          type: 'cost.recorded',
          phase: 'reviewer',
          payload: { role: 'reviewer', inputTokens: 5, outputTokens: 5, costUsd: null },
        },
        2,
      ),
    ]);
    expect(state.knownCostUsd).toBeCloseTo(0.5);
    expect(state.hasUnknownCost).toBe(true);
    expect(formatRunCost(state)).toBe('$0.5000 (+ unknown)');
  });

  it('shows no cost until a cost.recorded event arrives', () => {
    expect(formatRunCost(createInitialRunViewState())).toBe('—');
  });

  it('joins a chunk split across multiple executor.stdout.chunk events into output lines', () => {
    const state = fold([
      event(
        {
          type: 'executor.stdout.chunk',
          phase: 'worker',
          payload: { source: 'worker', chunk: 'line one\nline two\n' },
        },
        1,
      ),
    ]);
    expect(state.output).toEqual(['[worker/stdout] line one', '[worker/stdout] line two']);
  });

  it.each([
    ['ticket-run.completed', { artifactPath: 'a.md', reviewPath: 'r.md' }, 'completed'],
    ['ticket-run.blocked', { blockers: ['needs answers'] }, 'blocked'],
    ['ticket-run.failed', { message: 'boom' }, 'failed'],
    ['ticket-run.interrupted', { message: 'stopped' }, 'interrupted'],
    [
      'ticket-run.escalated',
      { reason: 'ITERATION_CAP', message: 'stuck', attempt: 3 },
      'escalated',
    ],
  ] as const)('sets finalStatus to %s -> %s', (type, payload, expected) => {
    const state = fold([event({ type, phase: 'complete', payload } as never, 1)]);
    expect(state.finalStatus).toBe(expected);
  });

  it('reflects the run ending after a replayed backlog followed by live events (AC-12 reconnect)', () => {
    // A reconnect's native EventSource replay and its resumed live stream
    // arrive through the same onmessage handler as one ordered sequence;
    // the reducer does not need to know which event was "missed" versus
    // "live" — folding the full sequence is enough to land on the right
    // final state either way.
    const missedWhileDisconnected: TicketRunEvent[] = [
      event(
        {
          type: 'stage.started',
          phase: 'worker',
          payload: { stage: 'worker', message: 'working' },
        },
        1,
      ),
      event(
        {
          type: 'review.rejected',
          phase: 'reviewer',
          payload: { reviewPath: 'r.md', reason: 'nope' },
        },
        2,
      ),
    ];
    const resumedLive: TicketRunEvent[] = [
      event(
        { type: 'stage.completed', phase: 'worker', payload: { stage: 'worker', message: 'done' } },
        3,
      ),
      event(
        {
          type: 'ticket-run.completed',
          phase: 'complete',
          payload: { artifactPath: 'a.md', reviewPath: 'r.md' },
        },
        4,
      ),
    ];

    const state = fold([...missedWhileDisconnected, ...resumedLive]);

    expect(state.rejections).toBe(1);
    expect(state.finalStatus).toBe('completed');
    expect(state.output).toEqual([
      '[stage:worker] started | working',
      '[review] rejected | nope',
      '[stage:worker] completed | done',
      '[run] completed',
    ]);
  });
});

describe('interruptJob', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts to the job interrupt endpoint and reports its outcome', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await interruptJob('job-1');

    expect(fetchMock).toHaveBeenCalledWith('/api/jobs/job-1/interrupt', { method: 'POST' });
    expect(result).toBe(true);
  });

  it('reports false when the request itself is refused', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }),
    );

    expect(await interruptJob('job-1')).toBe(false);
  });
});
