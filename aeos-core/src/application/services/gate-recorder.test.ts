import { describe, expect, it, vi } from 'vitest';

import type { GateRecord } from '../../domain/model/gate-record.js';
import type { RunRecord } from '../../domain/model/run-record.js';
import type { Ticket } from '../../domain/model/ticket.js';
import type { GateRecordStore } from '../../domain/ports/driven/gate-record-store.port.js';
import type { GitGateway } from '../../domain/ports/driven/git-gateway.port.js';
import type { RunRecordStore } from '../../domain/ports/driven/run-record-store.port.js';
import type { TicketRepository } from '../../domain/ports/driven/ticket-repository.port.js';
import { GateRecorder } from './gate-recorder.js';

const PIN = { repo: 'AEOS-aeos', commit: 'c0ffee1', path: 'features/checkout' };

const epic: Ticket = {
  id: 'AEOS-1',
  projectId: 'p',
  title: 'Checkout',
  kind: 'EPIC',
  parentId: null,
  column: 'SPEC_REVIEW',
  subState: 'SIGNED_OFF',
  createdAt: '2026-11-10T09:00:00.000Z',
  updatedAt: '2026-11-10T09:00:00.000Z',
  specPin: PIN,
};
const task: Ticket = { ...epic, id: 'AEOS-2', kind: 'TASK', parentId: 'AEOS-1', specPin: null };

const run = (run_id: string, role: RunRecord['role'], rest: Partial<RunRecord> = {}): RunRecord =>
  ({ run_id, role, ticket: 'AEOS-1', column: 'SPEC_REVIEW', output: null, ...rest }) as RunRecord;

function setUp(runs: RunRecord[] = [], identity: string | null = 'Kris <kris@example.com>') {
  const store = {
    append: vi.fn((_path: string, record: Omit<GateRecord, 'id'>) => ({ id: 'GATE-1', ...record })),
    list: vi.fn(),
  } satisfies GateRecordStore;
  const gitGateway = {
    userIdentity: vi.fn().mockReturnValue(identity),
    headCommit: vi.fn().mockReturnValue('abc1234'),
  } as unknown as GitGateway;
  const ticketRepo = { findById: vi.fn().mockReturnValue(epic) } as unknown as TicketRepository;
  const runRecordStore = { write: vi.fn(), list: vi.fn().mockReturnValue(runs) } as RunRecordStore;
  return {
    store,
    gitGateway,
    recorder: new GateRecorder(store, gitGateway, ticketRepo, runRecordStore),
  };
}

describe('GateRecorder', () => {
  it('records who decided what, when, under which pin and on what evidence', () => {
    const { recorder, store, gitGateway } = setUp([
      run('RUN-1', 'worker', { output: 'tickets/AEOS-1/AEOS-1-spec-review.md' }),
      run('RUN-2', 'reviewer', { output: 'tickets/AEOS-1/AEOS-1-spec-review-review.md' }),
      run('RUN-0', 'reviewer', { column: 'TECH_SPEC', output: 'tickets/AEOS-1/other-review.md' }),
    ]);

    const record = recorder.record('/project', epic, {
      gate: 'spec',
      verdict: 'approved',
      fromColumn: 'SPEC_REVIEW',
      toColumn: 'TECH_SPEC',
    });

    const ref = (path: string) => ({ repo: 'AEOS-aeos', commit: 'abc1234', path });
    expect(record).toEqual({
      id: 'GATE-1',
      gate: 'spec',
      ticket: 'AEOS-1',
      column: 'SPEC_REVIEW',
      from_column: 'SPEC_REVIEW',
      to_column: 'TECH_SPEC',
      decided_by: 'Kris <kris@example.com>',
      decided_at: expect.stringMatching(/^\d{4}-\d\d-\d\dT[\d:.]+Z$/),
      verdict: 'approved',
      overrides: null,
      // The review of this column, then this column's run records. Not TECH_SPEC's.
      evidence: [
        ref('tickets/AEOS-1/AEOS-1-spec-review-review.md'),
        ref('tickets/AEOS-1/runs/RUN-1.json'),
        ref('tickets/AEOS-1/runs/RUN-2.json'),
      ],
      spec_pin: PIN,
    });
    expect(record).not.toHaveProperty('reason');
    expect(store.append).toHaveBeenCalledWith(
      '/project',
      expect.objectContaining({ gate: 'spec' }),
    );
    expect(gitGateway.userIdentity).toHaveBeenCalledWith('/project');
    expect(gitGateway.headCommit).toHaveBeenCalledWith('/project/.aeos');
  });

  it("uses the parent epic's pin for a task, and cites the checks artefact", () => {
    const { recorder } = setUp([
      run('RUN-3', 'checks', {
        ticket: 'AEOS-2',
        column: 'IMPLEMENTATION',
        output: 'tickets/AEOS-2/AEOS-2-checks.md',
      }),
    ]);

    const record = recorder.record(
      '/project',
      { ...task, column: 'IMPLEMENTATION' },
      { gate: 'column-approval', verdict: 'approved' },
    );

    expect(record.spec_pin).toEqual(PIN);
    expect(record.evidence.map((ref) => ref.path)).toEqual([
      'tickets/AEOS-2/AEOS-2-checks.md',
      'tickets/AEOS-2/runs/RUN-3.json',
    ]);
    expect(record).toMatchObject({ from_column: null, to_column: null });
  });

  it('names the latest review or checks run of the column as what a sign-off overrode', () => {
    const { recorder } = setUp([
      run('RUN-1', 'reviewer', { verdict: 'REJECTED' }),
      run('RUN-2', 'worker'),
      run('RUN-3', 'reviewer', { verdict: 'REJECTED' }),
      run('RUN-4', 'preflight'),
      run('RUN-9', 'reviewer', { column: 'TECH_SPEC' }),
    ]);

    const record = recorder.record('/project', epic, {
      gate: 'sign-off-override',
      verdict: 'overridden',
      reason: '  The reviewer misread AC-2.  ',
    });

    expect(record).toMatchObject({ overrides: 'RUN-3', reason: 'The reviewer misread AC-2.' });
  });

  it('overrides nothing when the column was never reviewed, and only a sign-off overrides', () => {
    const { recorder } = setUp([run('RUN-1', 'reviewer')]);
    const reason = 'Parked until the spec is amended.';

    expect(
      recorder.record(
        '/project',
        { ...epic, column: 'TECH_SPEC' },
        {
          gate: 'sign-off-override',
          verdict: 'overridden',
          reason,
        },
      ).overrides,
    ).toBeNull();
    expect(
      recorder.record('/project', epic, { gate: 'move-override', verdict: 'overridden', reason })
        .overrides,
    ).toBeNull();
  });

  it.each(['overridden', 'rejected'] as const)(
    'refuses a decision that is %s without a reason of ten characters',
    (verdict) => {
      const { recorder, store } = setUp();

      for (const reason of [undefined, '', 'too short', '   padded   ']) {
        expect(() =>
          recorder.record('/project', epic, { gate: 'move-override', verdict, reason }),
        ).toThrow(/reason.*ten characters/);
      }
      expect(store.append).not.toHaveBeenCalled();
    },
  );

  it('refuses, with the fix, when the project repository has no git identity', () => {
    const { recorder, store } = setUp([], null);

    expect(() => recorder.record('/project', epic, { gate: 'spec', verdict: 'approved' })).toThrow(
      /git config user\.name[\s\S]*git config user\.email/,
    );
    expect(() => recorder.decidedBy('/project')).toThrow(/git identity/);
    expect(store.append).not.toHaveBeenCalled();
  });

  it('hands the store what is to be committed with the record, and keeps a reason on an approval', () => {
    const { recorder, store } = setUp();
    const alongside = () => ({ 'conformance.md': '# Report' });

    const record = recorder.record(
      '/project',
      epic,
      {
        gate: 'definition-of-done',
        verdict: 'approved',
        reason: 'AC-2 is accepted as a known gap.',
      },
      alongside,
    );

    expect(record.reason).toBe('AC-2 is accepted as a known gap.');
    expect(store.append).toHaveBeenCalledWith('/project', expect.anything(), alongside);
  });
});
