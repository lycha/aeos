import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

import type { ConformanceReport } from '../../domain/model/conformance-report.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';
import type { TicketDodApprovePort } from '../../domain/ports/driving/ticket-dod-approve.port.js';
import { programWith } from './program.fixture.js';

// What the person types, in order; every question asked is logged with the output.
const answers: string[] = [];
const printed: string[] = [];
const person = {
  interactive: true,
  ask: async (question: string): Promise<string> => {
    printed.push(question);
    return answers.shift() ?? '';
  },
};

const report = {
  criteria: [
    {
      id: 'AC-1',
      verdict: 'pass',
      instruments: [{ kind: 'test', name: 'a.test.ts: AC-1', result: 'pass' }],
    },
    { id: 'AC-2', verdict: 'unverified', instruments: [] },
  ],
  summary: { total: 2, pass: 1, fail: 0, unverified: 1 },
} as unknown as ConformanceReport;
const review = { report, prUrl: 'https://github.com/o/r/pull/7', reviewHash: 'HASH-1' };

describe('the ticket dod-approve handler', () => {
  let program: Command;
  let useCase: Record<'refusal' | 'review' | 'execute', ReturnType<typeof vi.fn>>;
  const run = (...args: string[]): Promise<Command> =>
    program.parseAsync(['node', 'aeos', 'ticket', 'dod-approve', 'AEOS-1', ...args]);

  beforeEach(() => {
    answers.length = 0;
    printed.length = 0;
    program = new Command();
    program.exitOverride();
    useCase = {
      refusal: vi.fn().mockReturnValue(null),
      review: vi.fn().mockResolvedValue({ ok: true, review }),
      execute: vi.fn().mockReturnValue({ status: 'approved', ticketId: 'AEOS-1', totalCostUsd: 0 }),
    };
    programWith(
      {
        ticketDodApprove: useCase as TicketDodApprovePort,
        projectRepo: {
          findRoot: () => '/test',
          read: () => ({ id: 'proj-1' }),
        } as unknown as ProjectRepository,
      },
      program,
      person,
    );
    for (const method of ['log', 'error'] as const) {
      vi.spyOn(console, method).mockImplementation((...parts) => printed.push(parts.join(' ')));
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('shows the summary and the table, then the pull request, then asks', async () => {
    answers.push('y');

    await run('--reason', 'AC-2 is accepted as a known gap.', '--verified', 'AC-2, AC-3');

    expect(useCase.review).toHaveBeenCalledWith('proj-1', '/test', 'AEOS-1', ['AC-2', 'AC-3']);
    // The report is shown with the question, on stderr: nothing before the answer is on stdout.
    expect(printed[0]).toContain('Approve ticket AEOS-1 as DONE? [y/N] ');
    const position = (text: string): number => printed[0].indexOf(text);
    expect(position('1 pass, 0 fail, 1 unverified of 2.')).toBeGreaterThanOrEqual(0);
    expect(position('| AC-1 | pass | test: a.test.ts: AC-1 (pass)')).toBeGreaterThanOrEqual(0);
    expect(position('https://github.com/o/r/pull/7')).toBeGreaterThan(position('| AC-1 | pass'));
    expect(position('[y/N]')).toBeGreaterThan(position('https://github.com/o/r/pull/7'));
    expect(useCase.execute).toHaveBeenCalledWith(
      'proj-1',
      '/test',
      'AEOS-1',
      true,
      'AC-2 is accepted as a known gap.',
      review,
    );
  });

  it('asks why on a no, and exits needs_human when the decision is refused', async () => {
    answers.push('n', 'AC-2 is not demonstrated.');
    useCase.execute.mockReturnValue({
      status: 'error',
      ticketId: 'AEOS-1',
      error: 'needs --reason',
    });

    await run();

    expect(useCase.execute).toHaveBeenCalledWith(
      'proj-1',
      '/test',
      'AEOS-1',
      false,
      'AC-2 is not demonstrated.',
      review,
    );
    expect(printed.join('\n')).toContain('needs --reason');
    expect(process.exitCode).toBe(3);
  });

  it('asks nothing when the report cannot be shown', async () => {
    useCase.review.mockResolvedValue({ ok: false, error: 'not in DOD_GATE' });

    await run();

    expect(printed.join('\n')).not.toContain('[y/N]');
    expect(useCase.execute).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('--dry-run previews the report and review hash, asks nothing, and records nothing', async () => {
    await run('--dry-run');

    expect(useCase.review).toHaveBeenCalledWith('proj-1', '/test', 'AEOS-1', []);
    expect(useCase.execute).not.toHaveBeenCalled();
    expect(printed.join('\n')).not.toContain('[y/N]');
    expect(process.exitCode).toBe(0);
  });

  it('--decision approve with a matching --review-hash proceeds without asking', async () => {
    await run('--decision', 'approve', '--review-hash', 'HASH-1');

    expect(useCase.execute).toHaveBeenCalledWith(
      'proj-1',
      '/test',
      'AEOS-1',
      true,
      undefined,
      review,
    );
    expect(printed.join('\n')).not.toContain('[y/N]');
    expect(process.exitCode).toBe(0);
  });

  it('--decision reject with a matching --review-hash records the given reason', async () => {
    await run('--decision', 'reject', '--reason', 'Not ready.', '--review-hash', 'HASH-1');

    expect(useCase.execute).toHaveBeenCalledWith(
      'proj-1',
      '/test',
      'AEOS-1',
      false,
      'Not ready.',
      review,
    );
  });

  it('refuses a stale --review-hash as CONFORMANCE_CHANGED, and records nothing', async () => {
    await run('--decision', 'approve', '--review-hash', 'STALE');

    expect(useCase.execute).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(3);
  });
});
