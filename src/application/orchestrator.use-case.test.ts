import { describe, it, expect, vi, beforeEach } from 'vitest';

import { OrchestratorUseCase } from './orchestrator.use-case.js';
import { Column } from '../domain/model/column.js';
import { SubState } from '../domain/model/sub-state.js';
import { TicketKind } from '../domain/model/ticket-kind.js';
import { OrchestratorStatus } from '../domain/model/orchestrator-state.js';
import { HaltReason } from '../domain/services/orchestrator-policy.js';
import type { Ticket } from '../domain/model/ticket.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { CostRepository } from '../domain/ports/driven/cost-repository.port.js';
import type { ConfigStore } from '../domain/ports/driven/config-store.port.js';
import type { ColumnSpecLoader } from '../domain/ports/driven/column-spec-loader.port.js';
import type { OrchestratorStateRepository } from '../domain/ports/driven/orchestrator-state-repository.port.js';
import type { TicketRunPort } from '../domain/ports/driving/ticket-run.port.js';
import type { TicketApprovePort } from '../domain/ports/driving/ticket-approve.port.js';

const PROJECT_ID = 'p';
const PROJECT_PATH = '/tmp/proj';
const EPIC_ID = 'AEOS-1';

function epic(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: EPIC_ID,
    projectId: PROJECT_ID,
    title: 'Epic',
    kind: TicketKind.EPIC,
    parentId: null,
    column: Column.PRODUCT_SCOPING,
    subState: SubState.READY,
    createdAt: 'x',
    updatedAt: 'y',
    ...overrides,
  };
}

describe('OrchestratorUseCase', () => {
  let ticketRepo: TicketRepository;
  let costRepo: CostRepository;
  let stateRepo: OrchestratorStateRepository;
  let columnSpecLoader: ColumnSpecLoader;
  let configStore: ConfigStore;
  let ticketRun: TicketRunPort;
  let ticketApprove: TicketApprovePort;
  let useCase: OrchestratorUseCase;

  beforeEach(() => {
    ticketRepo = {
      nextId: vi.fn(),
      save: vi.fn(),
      createAtomic: vi.fn(),
      deleteById: vi.fn(),
      findById: vi.fn().mockReturnValue(epic()),
      findByProject: vi.fn().mockReturnValue([]),
      findChildren: vi.fn().mockReturnValue([]),
      updateColumn: vi.fn(),
      updateSubState: vi.fn(),
    };
    costRepo = {
      record: vi.fn(),
      findByProject: vi.fn().mockReturnValue([]),
      findByTicket: vi.fn().mockReturnValue([]),
    };
    stateRepo = {
      find: vi.fn().mockReturnValue(null),
      upsert: vi.fn(),
      findByProject: vi.fn().mockReturnValue([]),
    };
    columnSpecLoader = {
      load: vi.fn().mockReturnValue({ advanceMode: 'auto' }),
    } as unknown as ColumnSpecLoader;
    configStore = {
      readConfig: vi.fn().mockReturnValue({
        model: 'claude-opus-4-8',
        currency: 'USD',
        advanceMode: 'auto',
        reviewLoop: { enabled: true, maxIterations: 5 },
      }),
    } as unknown as ConfigStore;
    ticketRun = {
      execute: vi.fn().mockResolvedValue({
        status: 'success',
        ticketId: EPIC_ID,
        artifactPath: '/a',
        reviewPath: '/r',
        attempts: 1,
      }),
      interrupt: vi.fn(),
    };
    ticketApprove = {
      execute: vi.fn().mockReturnValue({
        status: 'advanced',
        ticketId: EPIC_ID,
        fromColumn: 'PRODUCT_SCOPING',
        toColumn: 'TECH_SPEC',
      }),
    };

    useCase = new OrchestratorUseCase(
      ticketRepo,
      costRepo,
      stateRepo,
      columnSpecLoader,
      configStore,
      ticketRun,
      ticketApprove,
    );
  });

  it('refuses to drive a task — tasks are scheduled through their parent', async () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
      epic({ kind: TicketKind.TASK, parentId: 'AEOS-1' }),
    );

    await expect(useCase.run(PROJECT_ID, PROJECT_PATH, 'AEOS-2')).rejects.toThrow(
      'The orchestrator drives epics',
    );
  });

  it('runs a READY epic, then halts at the human gate', async () => {
    let column: Column = Column.PRODUCT_SCOPING;
    let subState: SubState = SubState.READY;
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockImplementation(() =>
      epic({ column, subState }),
    );
    (ticketRun.execute as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      subState = SubState.SIGNED_OFF;
      return {
        status: 'success',
        ticketId: EPIC_ID,
        artifactPath: '',
        reviewPath: '',
        attempts: 1,
      };
    });
    (ticketApprove.execute as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const from = column;
      column = Column.DOD_GATE;
      subState = SubState.READY;
      return { status: 'advanced', ticketId: EPIC_ID, fromColumn: from, toColumn: column };
    });

    const result = await useCase.run(PROJECT_ID, PROJECT_PATH, EPIC_ID);

    expect(result.haltReason).toBe(HaltReason.HUMAN_GATE);
    expect(result.steps.map((s) => s.action)).toEqual(['run', 'advance']);
    expect(result.message).toContain('dod-approve');
  });

  it('halts immediately when the budget is already spent', async () => {
    (costRepo.findByTicket as ReturnType<typeof vi.fn>).mockReturnValue([{ costUsd: 12.5 }]);

    const result = await useCase.run(PROJECT_ID, PROJECT_PATH, EPIC_ID, { budgetUsd: 10 });

    expect(result.haltReason).toBe(HaltReason.BUDGET_EXCEEDED);
    expect(result.steps).toHaveLength(0);
    expect(ticketRun.execute).not.toHaveBeenCalled();
  });

  it('sums spend across the epic and its children', async () => {
    (ticketRepo.findChildren as ReturnType<typeof vi.fn>).mockReturnValue([
      epic({ id: 'AEOS-2', kind: TicketKind.TASK, parentId: EPIC_ID }),
    ]);
    (costRepo.findByTicket as ReturnType<typeof vi.fn>).mockReturnValue([{ costUsd: 3 }]);

    const result = await useCase.run(PROJECT_ID, PROJECT_PATH, EPIC_ID, { budgetUsd: 5 });

    // 3 (epic) + 3 (one child) = 6, over the 5 ceiling.
    expect(result.haltReason).toBe(HaltReason.BUDGET_EXCEEDED);
    expect(result.spentUsd).toBe(6);
  });

  it('refuses to run a paused epic', async () => {
    (stateRepo.find as ReturnType<typeof vi.fn>).mockReturnValue({
      projectId: PROJECT_ID,
      epicId: EPIC_ID,
      status: OrchestratorStatus.PAUSED,
      haltReason: null,
      message: null,
      budgetUsd: null,
      updatedAt: 'x',
    });

    const result = await useCase.run(PROJECT_ID, PROJECT_PATH, EPIC_ID);

    expect(result.message).toContain('orchestrator resume');
    expect(ticketRun.execute).not.toHaveBeenCalled();
  });

  it('stops scheduling once a run escalates', async () => {
    let subState: SubState = SubState.READY;
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockImplementation(() => epic({ subState }));
    (ticketRun.execute as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      subState = SubState.ESCALATED;
      return {
        status: 'escalated',
        ticketId: EPIC_ID,
        reason: 'ITERATIONS_EXHAUSTED',
        message: 'nope',
        attempts: 5,
      };
    });

    const result = await useCase.run(PROJECT_ID, PROJECT_PATH, EPIC_ID);

    expect(result.haltReason).toBe(HaltReason.NEEDS_HUMAN);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].outcome).toContain('escalated');
    // One run attempted, then the escalated sub-state stops the loop.
    expect(ticketRun.execute).toHaveBeenCalledTimes(1);
  });

  it('honours a manual column even when the global mode is auto', async () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
      epic({ subState: SubState.SIGNED_OFF }),
    );
    (columnSpecLoader.load as ReturnType<typeof vi.fn>).mockReturnValue({ advanceMode: 'manual' });

    const result = await useCase.run(PROJECT_ID, PROJECT_PATH, EPIC_ID);

    expect(result.haltReason).toBe(HaltReason.AWAITING_APPROVAL);
    expect(ticketApprove.execute).not.toHaveBeenCalled();
  });

  it('bounds the loop so a cycling ticket cannot spin forever', async () => {
    // Never changes state: the policy keeps asking for a run.
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
      epic({ subState: SubState.READY }),
    );

    const result = await useCase.run(PROJECT_ID, PROJECT_PATH, EPIC_ID, { maxSteps: 3 });

    expect(result.steps).toHaveLength(3);
    expect(result.message).toContain('Stopped after 3 actions');
  });

  it('reports each step to the observer as it happens', async () => {
    const seen: string[] = [];
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
      epic({ subState: SubState.READY }),
    );

    await useCase.run(
      PROJECT_ID,
      PROJECT_PATH,
      EPIC_ID,
      { maxSteps: 2 },
      { onStep: (step) => seen.push(`${step.action}:${step.ticketId}`) },
    );

    expect(seen).toEqual([`run:${EPIC_ID}`, `run:${EPIC_ID}`]);
  });

  describe('pause and resume', () => {
    it('pause records PAUSED and preserves the budget', () => {
      (stateRepo.find as ReturnType<typeof vi.fn>).mockReturnValue({
        projectId: PROJECT_ID,
        epicId: EPIC_ID,
        status: OrchestratorStatus.IDLE,
        haltReason: null,
        message: null,
        budgetUsd: 25,
        updatedAt: 'x',
      });

      const state = useCase.pause(PROJECT_ID, EPIC_ID);

      expect(state.status).toBe(OrchestratorStatus.PAUSED);
      expect(state.budgetUsd).toBe(25);
      expect(stateRepo.upsert).toHaveBeenCalled();
    });

    it('resume clears the halt reason', () => {
      (stateRepo.find as ReturnType<typeof vi.fn>).mockReturnValue({
        projectId: PROJECT_ID,
        epicId: EPIC_ID,
        status: OrchestratorStatus.PAUSED,
        haltReason: HaltReason.BUDGET_EXCEEDED,
        message: 'over budget',
        budgetUsd: 25,
        updatedAt: 'x',
      });

      const state = useCase.resume(PROJECT_ID, EPIC_ID);

      expect(state.status).toBe(OrchestratorStatus.IDLE);
      expect(state.haltReason).toBeNull();
    });
  });
});
