import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CostsUseCase } from './costs.use-case.js';
import type { CostRecord } from '../domain/model/cost-record.js';
import type { CostRepository } from '../domain/ports/driven/cost-repository.port.js';
import type { ConfigStore } from '../domain/ports/driven/config-store.port.js';

function cost(overrides: Partial<CostRecord>): CostRecord {
  return {
    ticketId: 'AEOS-1',
    projectId: 'aeos',
    column: 'TECH_SPEC',
    agent: 'architect-agent',
    executor: 'claude-cli',
    model: 'm',
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0.1,
    recordedAt: '2026-11-10T00:00:00.000Z',
    role: 'worker',
    ...overrides,
  };
}

describe('CostsUseCase', () => {
  let findByFilters: ReturnType<typeof vi.fn>;
  let useCase: CostsUseCase;

  beforeEach(() => {
    findByFilters = vi.fn().mockReturnValue([]);
    useCase = new CostsUseCase(
      { findByFilters } as unknown as CostRepository,
      {
        readRegistry: () => [{ id: 'aeos', key: 'AEOS' }],
      } as unknown as ConfigStore,
    );
  });

  it('reports nothing when there are no records', () => {
    expect(useCase.execute({})).toEqual({
      ok: true,
      report: { totalUsd: 0, unknownRecords: 0, byProject: [] },
    });
  });

  it('totals per project, per ticket, per column and per role', () => {
    findByFilters.mockReturnValue([
      cost({ costUsd: 0.25, column: 'TECH_SPEC', role: 'preflight' }),
      cost({ costUsd: 0.5, column: 'TECH_SPEC', role: 'worker' }),
      cost({ costUsd: 0.25, column: 'TECH_SPEC', role: 'reviewer' }),
      cost({ costUsd: 1, column: 'TASK_BREAKDOWN', role: 'worker' }),
      cost({ costUsd: 2, ticketId: 'AEOS-2', column: 'QA', role: undefined }),
      cost({ costUsd: 4, projectId: 'other', ticketId: 'OT-1', column: 'QA' }),
    ]);

    expect(useCase.execute({})).toEqual({
      ok: true,
      report: {
        totalUsd: 8,
        unknownRecords: 0,
        byProject: [
          {
            projectId: 'aeos',
            totalUsd: 4,
            byTicket: [
              {
                ticketId: 'AEOS-1',
                totalUsd: 2,
                byColumn: { TECH_SPEC: 1, TASK_BREAKDOWN: 1 },
                byRole: { preflight: 0.25, worker: 1.5, reviewer: 0.25 },
              },
              {
                ticketId: 'AEOS-2',
                totalUsd: 2,
                byColumn: { QA: 2 },
                byRole: { unrecorded: 2 },
              },
            ],
          },
          {
            projectId: 'other',
            totalUsd: 4,
            byTicket: [
              { ticketId: 'OT-1', totalUsd: 4, byColumn: { QA: 4 }, byRole: { worker: 4 } },
            ],
          },
        ],
      },
    });
  });

  it('sums known costs and counts unknown ones without folding them in as zero', () => {
    findByFilters.mockReturnValue([
      cost({ costUsd: 0.4, role: 'worker' }),
      cost({ costUsd: null, role: 'reviewer' }),
      cost({ costUsd: null, ticketId: 'AEOS-2' }),
    ]);

    const result = useCase.execute({});

    expect(result.ok && result.report).toMatchObject({
      totalUsd: 0.4,
      unknownRecords: 2,
      byProject: [
        {
          totalUsd: 0.4,
          byTicket: [
            { ticketId: 'AEOS-1', totalUsd: 0.4, byRole: { worker: 0.4, reviewer: null } },
            // Every record unknown: the total is unknown, not zero.
            { ticketId: 'AEOS-2', totalUsd: null },
          ],
        },
      ],
    });
  });

  it('passes the filters on, resolving the project key through the registry', () => {
    useCase.execute({
      projectKey: 'aeos',
      epicId: 'AEOS-1',
      ticketId: 'AEOS-2',
      since: '2026-11-01',
    });

    expect(findByFilters).toHaveBeenCalledWith({
      projectId: 'aeos',
      epicId: 'AEOS-1',
      ticketId: 'AEOS-2',
      since: '2026-11-01',
    });
  });

  it('refuses a project key that is not registered', () => {
    expect(useCase.execute({ projectKey: 'NOPE' })).toEqual({
      ok: false,
      reason: 'PROJECT_NOT_FOUND',
    });
    expect(findByFilters).not.toHaveBeenCalled();
  });
});
