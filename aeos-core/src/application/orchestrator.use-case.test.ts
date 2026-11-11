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
import type { AgentSpecLoader } from '../domain/ports/driven/agent-spec-loader.port.js';
import type { ExecutorConfigResolver } from './services/executor-config-resolver.js';
import type { OrchestratorStateRepository } from '../domain/ports/driven/orchestrator-state-repository.port.js';
import type { TicketRunPort } from '../domain/ports/driving/ticket-run.port.js';
import type { TicketApprovePort } from '../domain/ports/driving/ticket-approve.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';

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
  let agentSpecLoader: AgentSpecLoader;
  let executorConfigResolver: ExecutorConfigResolver;
  let configStore: ConfigStore;
  let ticketRun: TicketRunPort;
  let ticketApprove: TicketApprovePort;
  let gitGateway: GitGateway;
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
      setEscalation: vi.fn(),
      setPrUrl: vi.fn(),
    };
    costRepo = {
      record: vi.fn(),
      findByProject: vi.fn().mockReturnValue([]),
      findByTicket: vi.fn().mockReturnValue([]),
      findByFilters: vi.fn().mockReturnValue([]),
    };
    stateRepo = {
      find: vi.fn().mockReturnValue(null),
      upsert: vi.fn(),
      findByProject: vi.fn().mockReturnValue([]),
      touch: vi.fn(),
    };
    columnSpecLoader = {
      load: vi.fn().mockReturnValue({
        advanceMode: 'auto',
        workerAgentFile: 'agents/worker.yaml',
        reviewerAgentFile: 'agents/reviewer.yaml',
      }),
    } as unknown as ColumnSpecLoader;
    agentSpecLoader = {
      load: vi.fn((file: string) => ({ name: file.includes('worker') ? 'worker' : 'reviewer' })),
    } as unknown as AgentSpecLoader;
    executorConfigResolver = {
      resolveExecutorConfig: vi.fn().mockReturnValue({ executorType: 'claude-cli' }),
    } as unknown as ExecutorConfigResolver;
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

    gitGateway = {
      init: vi.fn(),
      commit: vi.fn(),
      commitFiles: vi.fn(),
      stageAll: vi.fn(),
      commitAll: vi.fn().mockReturnValue(false),
      diff: vi.fn().mockReturnValue(''),
      isRepo: vi.fn().mockReturnValue(false),
      ensureOnBranch: vi.fn(),
      tagHere: vi.fn(),
      diffRange: vi.fn().mockReturnValue(''),
      refExists: vi.fn().mockReturnValue(false),
      changedFiles: vi.fn().mockReturnValue([]),
      restoreFiles: vi.fn(),
      push: vi.fn(),
      currentBranch: vi.fn().mockReturnValue('aeos/AEOS-1'),
      defaultBranch: vi.fn().mockReturnValue('main'),
      hasRemote: vi.fn().mockReturnValue(true),
    };

    useCase = new OrchestratorUseCase(
      ticketRepo,
      costRepo,
      stateRepo,
      columnSpecLoader,
      configStore,
      ticketRun,
      ticketApprove,
      gitGateway,
      agentSpecLoader,
      executorConfigResolver,
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

  it('halts for a human when an approval fails, instead of retrying it', async () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
      epic({ column: Column.INTEGRATION_REVIEW, subState: SubState.SIGNED_OFF }),
    );
    (ticketApprove.execute as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'error',
      ticketId: EPIC_ID,
      error: 'Cannot open a pull request for AEOS-1: `gh` is not authenticated.',
    });

    const result = await useCase.run(PROJECT_ID, PROJECT_PATH, EPIC_ID);

    expect(result.haltReason).toBe(HaltReason.NEEDS_HUMAN);
    expect(result.message).toContain('`gh` is not authenticated');
    expect(ticketApprove.execute).toHaveBeenCalledTimes(1);
    expect(result.steps).toHaveLength(1);
  });

  it('halts immediately when the budget is already spent', async () => {
    (costRepo.findByTicket as ReturnType<typeof vi.fn>).mockReturnValue([{ costUsd: 12.5 }]);

    const result = await useCase.run(PROJECT_ID, PROJECT_PATH, EPIC_ID, { budgetUsd: 10 });

    expect(result.haltReason).toBe(HaltReason.BUDGET_EXCEEDED);
    expect(result.steps).toHaveLength(0);
    expect(ticketRun.execute).not.toHaveBeenCalled();
  });

  describe('budget on an executor that cannot report cost', () => {
    const reviewerOnOllama = (): void => {
      (executorConfigResolver.resolveExecutorConfig as ReturnType<typeof vi.fn>).mockImplementation(
        (_path: string, agent: { name: string }) => ({
          executorType: agent.name === 'reviewer' ? 'ollama-cli' : 'claude-cli',
        }),
      );
    };

    it('refuses a new budget before any run, naming the agent and executor', async () => {
      reviewerOnOllama();

      await expect(
        useCase.run(PROJECT_ID, PROJECT_PATH, EPIC_ID, { budgetUsd: 5 }),
      ).rejects.toThrow(/'reviewer'.*'ollama-cli'/);

      expect(ticketRun.execute).not.toHaveBeenCalled();
      expect(stateRepo.upsert).not.toHaveBeenCalled();
    });

    it('refuses a persisted budget the same way', async () => {
      reviewerOnOllama();
      (stateRepo.find as ReturnType<typeof vi.fn>).mockReturnValue({
        projectId: PROJECT_ID,
        epicId: EPIC_ID,
        status: OrchestratorStatus.IDLE,
        haltReason: null,
        message: null,
        budgetUsd: 5,
        updatedAt: new Date().toISOString(),
      });

      await expect(useCase.run(PROJECT_ID, PROJECT_PATH, EPIC_ID)).rejects.toThrow(/'ollama-cli'/);
      expect(ticketRun.execute).not.toHaveBeenCalled();
    });

    it('runs without a budget whatever the executor', async () => {
      reviewerOnOllama();

      const result = await useCase.run(PROJECT_ID, PROJECT_PATH, EPIC_ID, { maxSteps: 1 });

      expect(result.steps).toHaveLength(1);
    });
  });

  describe('budget refusal looks only at columns still ahead', () => {
    // Puts the worker of one column on an executor that cannot report cost.
    const ollamaIn = (column: Column): void => {
      (columnSpecLoader.load as ReturnType<typeof vi.fn>).mockImplementation((c: Column) => ({
        advanceMode: 'auto',
        workerAgentFile: `agents/worker-${c}.yaml`,
        reviewerAgentFile: 'agents/reviewer.yaml',
      }));
      (agentSpecLoader.load as ReturnType<typeof vi.fn>).mockImplementation((file: string) => ({
        name: file,
      }));
      (executorConfigResolver.resolveExecutorConfig as ReturnType<typeof vi.fn>).mockImplementation(
        (_path: string, agent: { name: string }) => ({
          executorType: agent.name === `agents/worker-${column}.yaml` ? 'ollama-cli' : 'claude-cli',
        }),
      );
    };
    const at = (epicColumn: Column, childColumns: Column[]): void => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        epic({ column: epicColumn }),
      );
      (ticketRepo.findChildren as ReturnType<typeof vi.fn>).mockReturnValue(
        childColumns.map((column, i) =>
          epic({ id: `AEOS-${i + 2}`, kind: TicketKind.TASK, parentId: EPIC_ID, column }),
        ),
      );
    };
    const run = (): Promise<unknown> =>
      useCase.run(PROJECT_ID, PROJECT_PATH, EPIC_ID, { budgetUsd: 5, maxSteps: 1 });

    it('accepts a budget when the non-reporting executor is on an epic column already passed', async () => {
      at(Column.TECH_SPEC, []);
      ollamaIn(Column.PRODUCT_SCOPING);

      await expect(run()).resolves.toBeDefined();
    });

    it("refuses when it is on the epic's current column", async () => {
      at(Column.TECH_SPEC, []);
      ollamaIn(Column.TECH_SPEC);

      await expect(run()).rejects.toThrow(/TECH_SPEC.*'ollama-cli'/);
    });

    it('accepts when the epic is beyond decomposition and every child is past the task column', async () => {
      at(Column.INTEGRATION_REVIEW, [Column.DONE, Column.QA]);
      ollamaIn(Column.CODE_REVIEW);

      await expect(run()).resolves.toBeDefined();
    });

    it('refuses while a child still has the task column ahead', async () => {
      at(Column.INTEGRATION_REVIEW, [Column.DONE, Column.CODE_REVIEW]);
      ollamaIn(Column.QA);

      await expect(run()).rejects.toThrow(/QA.*'ollama-cli'/);
    });

    it('refuses on any task column while the epic can still decompose', async () => {
      at(Column.TASK_BREAKDOWN, [Column.DONE]);
      ollamaIn(Column.IMPLEMENTATION);

      await expect(run()).rejects.toThrow(/IMPLEMENTATION.*'ollama-cli'/);
    });
  });

  it('halts with COST_UNKNOWN when a budgeted epic has an unknown cost', async () => {
    (costRepo.findByTicket as ReturnType<typeof vi.fn>).mockReturnValue([
      { costUsd: 1 },
      { costUsd: null },
    ]);

    const result = await useCase.run(PROJECT_ID, PROJECT_PATH, EPIC_ID, { budgetUsd: 5 });

    expect(result.haltReason).toBe(HaltReason.COST_UNKNOWN);
    expect(result.spentUsd).toBe(1);
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

  it('sets up an isolated epic branch + base tag when the repo is git', async () => {
    (gitGateway.isRepo as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
      epic({ column: Column.DOD_GATE, subState: SubState.READY }),
    );

    await useCase.run(PROJECT_ID, PROJECT_PATH, EPIC_ID);

    expect(gitGateway.ensureOnBranch).toHaveBeenCalledWith(PROJECT_PATH, 'aeos/AEOS-1');
    expect(gitGateway.tagHere).toHaveBeenCalledWith(PROJECT_PATH, 'aeos-base/AEOS-1');
  });

  it('skips git isolation when the project path is not a repo', async () => {
    (gitGateway.isRepo as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
      epic({ column: Column.DOD_GATE, subState: SubState.READY }),
    );

    await useCase.run(PROJECT_ID, PROJECT_PATH, EPIC_ID);

    expect(gitGateway.ensureOnBranch).not.toHaveBeenCalled();
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
    // The step records the column it drove, so the progress log can show it.
    expect(result.steps[0].column).toBe(Column.PRODUCT_SCOPING);
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

  describe('concurrency guard', () => {
    function runningSince(updatedAt: string) {
      return {
        projectId: PROJECT_ID,
        epicId: EPIC_ID,
        status: OrchestratorStatus.RUNNING,
        haltReason: null,
        message: null,
        budgetUsd: null,
        updatedAt,
      };
    }

    it('refuses to start when another run is live', async () => {
      (stateRepo.find as ReturnType<typeof vi.fn>).mockReturnValue(
        runningSince(new Date().toISOString()),
      );

      const result = await useCase.run(PROJECT_ID, PROJECT_PATH, EPIC_ID);

      expect(result.message).toContain('already being driven');
      expect(ticketRun.execute).not.toHaveBeenCalled();
      // Critically, it must not stomp the live run's row.
      expect(stateRepo.upsert).not.toHaveBeenCalled();
    });

    it('takes over a RUNNING row that stopped heartbeating', async () => {
      // A crashed run leaves RUNNING behind; without a staleness window the
      // epic would be locked out permanently.
      (stateRepo.find as ReturnType<typeof vi.fn>).mockReturnValue(
        runningSince(new Date(Date.now() - 60 * 60 * 1000).toISOString()),
      );

      const result = await useCase.run(PROJECT_ID, PROJECT_PATH, EPIC_ID, { maxSteps: 1 });

      expect(result.steps.length).toBeGreaterThan(0);
      expect(ticketRun.execute).toHaveBeenCalled();
    });

    it('treats an unparseable heartbeat as stale rather than locking forever', async () => {
      (stateRepo.find as ReturnType<typeof vi.fn>).mockReturnValue(runningSince('not-a-date'));

      const result = await useCase.run(PROJECT_ID, PROJECT_PATH, EPIC_ID, { maxSteps: 1 });

      expect(result.steps.length).toBeGreaterThan(0);
    });

    it('leaves a paused epic paused rather than rewriting its state', async () => {
      (stateRepo.find as ReturnType<typeof vi.fn>).mockReturnValue({
        ...runningSince(new Date().toISOString()),
        status: OrchestratorStatus.PAUSED,
      });

      await useCase.run(PROJECT_ID, PROJECT_PATH, EPIC_ID);

      expect(stateRepo.upsert).not.toHaveBeenCalled();
    });

    it('heartbeats off the ticket run event stream', async () => {
      let emit: ((event: unknown) => void) | undefined;
      (ticketRun.execute as ReturnType<typeof vi.fn>).mockImplementation(
        async (_p, _pp, _t, _o, observer) => {
          emit = observer?.onEvent;
          // A long agentic run emits continuously; one event is enough to prove
          // the observer is wired through.
          emit?.({ type: 'executor.stdout.chunk' });
          return {
            status: 'escalated',
            ticketId: EPIC_ID,
            reason: 'ITERATIONS_EXHAUSTED',
            message: 'x',
            attempts: 1,
          };
        },
      );

      await useCase.run(PROJECT_ID, PROJECT_PATH, EPIC_ID, { maxSteps: 1 });

      expect(emit).toBeDefined();
      expect(stateRepo.touch).toHaveBeenCalled();
    });

    it('forwards ticket-run events to the caller ticketRunObserver for the live view', async () => {
      (ticketRun.execute as ReturnType<typeof vi.fn>).mockImplementation(
        async (_p, _pp, _t, _o, observer) => {
          observer?.onEvent?.({ type: 'stage.started', ticketId: EPIC_ID });
          return {
            status: 'escalated',
            ticketId: EPIC_ID,
            reason: 'ITERATIONS_EXHAUSTED',
            message: 'x',
            attempts: 1,
          };
        },
      );
      const seen: unknown[] = [];

      await useCase.run(
        PROJECT_ID,
        PROJECT_PATH,
        EPIC_ID,
        { maxSteps: 1 },
        { ticketRunObserver: { onEvent: (event) => seen.push(event) } },
      );

      expect(seen).toContainEqual({ type: 'stage.started', ticketId: EPIC_ID });
    });
  });

  describe('interrupt', () => {
    it('halts with INTERRUPTED and stops scheduling when interrupted mid-run', async () => {
      let subState: SubState = SubState.READY;
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockImplementation(() =>
        epic({ subState }),
      );
      (ticketRun.execute as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        // Operator hits Ctrl+C while this ticket run is in flight.
        useCase.interrupt();
        subState = SubState.INTERRUPTED;
        return {
          status: 'failed',
          ticketId: EPIC_ID,
          error: 'Execution interrupted by operator',
        };
      });

      const result = await useCase.run(PROJECT_ID, PROJECT_PATH, EPIC_ID, { maxSteps: 10 });

      expect(result.haltReason).toBe(HaltReason.INTERRUPTED);
      // Exactly one action ran; the loop did not schedule more.
      expect(result.steps).toHaveLength(1);
      expect(ticketRun.execute).toHaveBeenCalledTimes(1);
      // The in-flight run was told to stop.
      expect(ticketRun.interrupt).toHaveBeenCalled();
    });

    it('leaves the epic IDLE after an interrupt, not RUNNING', async () => {
      (ticketRun.execute as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        useCase.interrupt();
        return { status: 'failed', ticketId: EPIC_ID, error: 'Execution interrupted by operator' };
      });

      await useCase.run(PROJECT_ID, PROJECT_PATH, EPIC_ID);

      const lastWrite = (stateRepo.upsert as ReturnType<typeof vi.fn>).mock.calls
        .map((call) => call[0])
        .at(-1);
      expect(lastWrite).toMatchObject({ status: OrchestratorStatus.IDLE });
    });

    it('a stale interrupt flag does not carry into the next run', async () => {
      useCase.interrupt(); // interrupt fired with nothing running
      let ran = false;
      (ticketRun.execute as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        ran = true;
        return { status: 'escalated', ticketId: EPIC_ID, reason: 'X', message: 'x', attempts: 1 };
      });

      await useCase.run(PROJECT_ID, PROJECT_PATH, EPIC_ID, { maxSteps: 1 });

      // run() resets the flag, so this fresh run proceeds normally.
      expect(ran).toBe(true);
    });
  });

  describe('unexpected failure', () => {
    it('clears RUNNING so the epic is not locked out, and rethrows', async () => {
      (ticketRun.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('column spec missing'),
      );

      await expect(useCase.run(PROJECT_ID, PROJECT_PATH, EPIC_ID)).rejects.toThrow(
        'column spec missing',
      );

      const written = (stateRepo.upsert as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => call[0],
      );
      expect(written[written.length - 1]).toMatchObject({
        status: OrchestratorStatus.IDLE,
      });
      expect(written[written.length - 1].message).toContain('ended unexpectedly');
    });
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

  describe('clear budget', () => {
    const halted = {
      projectId: PROJECT_ID,
      epicId: EPIC_ID,
      status: OrchestratorStatus.IDLE,
      haltReason: HaltReason.COST_UNKNOWN,
      message: 'unknown cost',
      budgetUsd: 5,
      updatedAt: 'x',
    };

    it('removes the ceiling and leaves the status alone', () => {
      (stateRepo.find as ReturnType<typeof vi.fn>).mockReturnValue({
        ...halted,
        status: OrchestratorStatus.PAUSED,
      });

      const state = useCase.clearBudget(PROJECT_ID, EPIC_ID);

      expect(state.budgetUsd).toBeNull();
      expect(state.status).toBe(OrchestratorStatus.PAUSED);
      expect(stateRepo.upsert).toHaveBeenCalledWith(state);
    });

    it('refuses an epic the orchestrator has never driven', () => {
      expect(() => useCase.clearBudget(PROJECT_ID, EPIC_ID)).toThrow(/no orchestrator state/);
      expect(stateRepo.upsert).not.toHaveBeenCalled();
    });

    it('lets an epic halted on COST_UNKNOWN run again without a budget', async () => {
      let stored: unknown = halted;
      (stateRepo.find as ReturnType<typeof vi.fn>).mockImplementation(() => stored);
      (stateRepo.upsert as ReturnType<typeof vi.fn>).mockImplementation((state: unknown) => {
        stored = state;
      });
      (costRepo.findByTicket as ReturnType<typeof vi.fn>).mockReturnValue([{ costUsd: null }]);

      const before = await useCase.run(PROJECT_ID, PROJECT_PATH, EPIC_ID);
      expect(before.haltReason).toBe(HaltReason.COST_UNKNOWN);

      useCase.clearBudget(PROJECT_ID, EPIC_ID);
      const after = await useCase.run(PROJECT_ID, PROJECT_PATH, EPIC_ID, { maxSteps: 1 });

      expect(after.haltReason).not.toBe(HaltReason.COST_UNKNOWN);
      expect(ticketRun.execute).toHaveBeenCalled();
    });
  });
});
