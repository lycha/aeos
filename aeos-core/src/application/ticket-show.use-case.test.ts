// Criteria traced here: @AC-8 (ticket column, sub-state, pinned spec + moved warning, children, runs with cost, gates).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TicketShowUseCase } from './ticket-show.use-case.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { CostRepository } from '../domain/ports/driven/cost-repository.port.js';
import type { Ticket } from '../domain/model/ticket.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type { RunRecordStore } from '../domain/ports/driven/run-record-store.port.js';
import type { ColumnSpecLoader } from '../domain/ports/driven/column-spec-loader.port.js';
import type { PipelineLoader } from '../domain/ports/driven/pipeline-loader.port.js';
import type { GateRecordStore } from '../domain/ports/driven/gate-record-store.port.js';
import { templatePipelines } from '../infrastructure/spec-loader/yaml-pipeline-loader.adapter.js';

function createMockTicketRepo(): TicketRepository {
  return {
    nextId: vi.fn().mockReturnValue(1),
    save: vi.fn(),
    createAtomic: vi.fn(),
    deleteById: vi.fn(),
    findById: vi.fn().mockReturnValue(null),
    findByProject: vi.fn().mockReturnValue([]),
    findChildren: vi.fn().mockReturnValue([]),
    updateColumn: vi.fn(),
    updateSubState: vi.fn(),
    setEscalation: vi.fn(),
    setPrUrl: vi.fn(),
    setSpecCommit: vi.fn(),
    setContractChange: vi.fn(),
  };
}

function createMockArtifactStore(): ArtifactStore {
  return {
    artifactExists: vi.fn().mockReturnValue(false),
    readArtifact: vi.fn().mockReturnValue(''),
    getArtifactMtime: vi.fn().mockReturnValue(null),
    writeArtifact: vi.fn(),
    removeArtifact: vi.fn(),
    listArtifacts: vi.fn().mockReturnValue([]),
  };
}

function createMockCostRepo(): CostRepository {
  return {
    record: vi.fn(),
    findByProject: vi.fn().mockReturnValue([]),
    findByTicket: vi.fn().mockReturnValue([]),
    findByFilters: vi.fn().mockReturnValue([]),
  };
}

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'AEOS-1',
    projectId: 'proj-1',
    title: 'Add rate limiting',
    kind: 'EPIC',
    parentId: null,
    column: 'SPEC_REVIEW',
    subState: 'WORKING',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('TicketShowUseCase', () => {
  let ticketRepo: ReturnType<typeof createMockTicketRepo>;
  let artifactStore: ReturnType<typeof createMockArtifactStore>;
  let costRepo: ReturnType<typeof createMockCostRepo>;
  let runRecordStore: RunRecordStore;
  let gitGateway: {
    pathChangedSince: ReturnType<typeof vi.fn>;
    userIdentity: ReturnType<typeof vi.fn>;
  };
  let columnSpecLoader: ColumnSpecLoader;
  let pipelineLoader: PipelineLoader;
  let gateRecordStore: GateRecordStore;
  let useCase: TicketShowUseCase;

  const defaultInput = {
    projectId: 'proj-1',
    ticketId: 'AEOS-1',
    projectPath: '/test/project',
  };

  beforeEach(() => {
    ticketRepo = createMockTicketRepo();
    artifactStore = createMockArtifactStore();
    costRepo = createMockCostRepo();
    runRecordStore = { write: vi.fn(), list: vi.fn().mockReturnValue([]) };
    gitGateway = {
      pathChangedSince: vi.fn().mockReturnValue(false),
      userIdentity: vi.fn().mockReturnValue('Dev <dev@example.com>'),
    };
    columnSpecLoader = { load: vi.fn().mockReturnValue({ role: 'standard' }) };
    pipelineLoader = { load: vi.fn().mockReturnValue(templatePipelines()) };
    gateRecordStore = { append: vi.fn(), list: vi.fn().mockReturnValue([]) };
    useCase = new TicketShowUseCase(
      ticketRepo,
      artifactStore,
      costRepo,
      runRecordStore,
      gitGateway as unknown as GitGateway,
      {
        root: () => '/test/project/.aeos',
        featureDir: () => '',
        exists: () => true,
        listFeatures: () => [],
      },
      columnSpecLoader,
      pipelineLoader,
      gateRecordStore,
    );
  });

  describe('spec pin', () => {
    const pin = { repo: 'AEOS-aeos', commit: 'c0ffee1', path: 'features/checkout' };

    it('has no pin for a ticket without a spec', () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(makeTicket());

      expect(useCase.execute(defaultInput)).toMatchObject({ specPin: null, specMoved: false });
      expect(gitGateway.pathChangedSince).not.toHaveBeenCalled();
    });

    it("shows the parent epic's pin on a child task", () => {
      const epic = makeTicket({ id: 'AEOS-9', specPin: pin });
      const task = makeTicket({ kind: 'TASK', parentId: 'AEOS-9' });
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockImplementation(
        (_project: string, id: string) => (id === 'AEOS-9' ? epic : task),
      );

      expect(useCase.execute(defaultInput)).toMatchObject({ specPin: pin, specMoved: false });
    });

    it('reports that the spec has moved when the feature changed after the pinned commit', () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        makeTicket({ specPin: pin }),
      );
      gitGateway.pathChangedSince.mockReturnValue(true);

      expect(useCase.execute(defaultInput)).toMatchObject({ specPin: pin, specMoved: true });
      expect(gitGateway.pathChangedSince).toHaveBeenCalledWith(
        '/test/project/.aeos',
        'c0ffee1',
        'features/checkout',
        // Gate records and the conformance report live beside the spec and are not the spec moving.
        [
          'features/checkout/gates.yaml',
          'features/checkout/conformance.yaml',
          'features/checkout/conformance.md',
        ],
      );
    });
  });

  it('should return ticket and artifacts when ticket exists', () => {
    const ticket = makeTicket();
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(ticket);
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue([
      'AEOS-1-ticket.md',
      'AEOS-1-prd.md',
    ]);

    const result = useCase.execute(defaultInput);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ticket).toEqual(ticket);
      expect(result.artifacts).toEqual(['AEOS-1-ticket.md', 'AEOS-1-prd.md']);
      expect(result.executions).toEqual([]);
    }
  });

  it('carries each execution cost through, null when unknown', () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(makeTicket());
    (costRepo.findByTicket as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        executor: 'claude-cli',
        model: 'm',
        agent: 'a',
        column: 'TECH_SPEC',
        recordedAt: 't',
        costUsd: 0.5,
      },
      {
        executor: 'ollama-cli',
        model: 'm',
        agent: 'b',
        column: 'TECH_SPEC',
        recordedAt: 'u',
        costUsd: null,
      },
    ]);

    const result = useCase.execute(defaultInput);

    expect(result.ok && result.executions.map((e) => e.costUsd)).toEqual([0.5, null]);
  });

  it('should call findById with projectId and ticketId', () => {
    const ticket = makeTicket();
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(ticket);

    useCase.execute(defaultInput);

    expect(ticketRepo.findById).toHaveBeenCalledWith('proj-1', 'AEOS-1');
  });

  it('should call listArtifacts with projectPath and canonical ticket ID', () => {
    const ticket = makeTicket({ id: 'AEOS-1' });
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(ticket);

    useCase.execute(defaultInput);

    expect(artifactStore.listArtifacts).toHaveBeenCalledWith('/test/project', 'AEOS-1');
  });

  it('should return NOT_FOUND when ticket does not exist', () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const result = useCase.execute(defaultInput);

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('should return empty artifacts array when no artifacts exist', () => {
    const ticket = makeTicket();
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(ticket);
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue([]);

    const result = useCase.execute(defaultInput);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.artifacts).toEqual([]);
      expect(result.executions).toEqual([]);
    }
  });

  it('should preserve null subState from ticket', () => {
    const ticket = makeTicket({ subState: null, column: 'BACKLOG' });
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(ticket);

    const result = useCase.execute(defaultInput);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ticket.subState).toBeNull();
    }
  });

  it('lists the run ids recorded for the ticket', () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(makeTicket());
    (runRecordStore.list as ReturnType<typeof vi.fn>).mockReturnValue([
      { run_id: 'RUN-1' },
      { run_id: 'RUN-2' },
    ]);

    const result = useCase.execute(defaultInput);

    expect(runRecordStore.list).toHaveBeenCalledWith('/test/project', 'AEOS-1');
    expect(result.ok && result.runs).toEqual(['RUN-1', 'RUN-2']);
  });

  it('carries the full run records alongside the ids', () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(makeTicket());
    const records = [
      { run_id: 'RUN-1', cost_usd: 0.5 },
      { run_id: 'RUN-2', cost_usd: null },
    ];
    (runRecordStore.list as ReturnType<typeof vi.fn>).mockReturnValue(records);

    const result = useCase.execute(defaultInput);

    expect(result.ok && result.runRecords).toEqual(records);
  });

  it('carries the gate records of the ticket', () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(makeTicket());
    const records = [{ id: 'GATE-1', gate: 'column-approval' }];
    (gateRecordStore.list as ReturnType<typeof vi.fn>).mockReturnValue(records);

    const result = useCase.execute(defaultInput);

    expect(gateRecordStore.list).toHaveBeenCalledWith('/test/project', { ticketId: 'AEOS-1' });
    expect(result.ok && result.gateRecords).toEqual(records);
  });

  it('reports the git identity a decision would be recorded under', () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(makeTicket());
    (gitGateway.userIdentity as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const result = useCase.execute(defaultInput);

    expect(gitGateway.userIdentity).toHaveBeenCalledWith('/test/project');
    expect(result.ok && result.gitIdentity).toBeNull();
  });

  describe('availableActions', () => {
    it('at a final-gate column in SIGNED_OFF offers only ticketDodApprove (plus the standing move)', () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        makeTicket({ column: 'DOD_GATE', subState: 'SIGNED_OFF' }),
      );
      (columnSpecLoader.load as ReturnType<typeof vi.fn>).mockReturnValue({ role: 'final-gate' });

      const result = useCase.execute(defaultInput);

      expect(result.ok && result.availableActions).toEqual(['ticketDodApprove', 'ticketMove']);
    });

    it('the same sub-state at a standard-role column offers ticketApprove instead', () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        makeTicket({ column: 'INTEGRATION_REVIEW', subState: 'SIGNED_OFF' }),
      );
      (columnSpecLoader.load as ReturnType<typeof vi.fn>).mockReturnValue({ role: 'standard' });

      const result = useCase.execute(defaultInput);

      expect(result.ok && result.availableActions).toEqual(['ticketApprove', 'ticketMove']);
    });
  });

  describe('availableColumns', () => {
    it("excludes the ticket's current column and lists only its own pipeline", () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        makeTicket({ kind: 'EPIC', column: 'SPEC_REVIEW' }),
      );

      const result = useCase.execute(defaultInput);

      expect(result.ok && result.availableColumns).toEqual([
        'BACKLOG',
        'TECH_SPEC',
        'TASK_BREAKDOWN',
        'INTEGRATION_REVIEW',
        'DOD_GATE',
        'DONE',
      ]);
    });
  });

  describe('pendingAmendment, end to end through BLOCKED', () => {
    const pin = { repo: 'AEOS-aeos', commit: 'c0ffee1', path: 'features/checkout' };

    it('a BLOCKED ticket with no pending amendment offers ticketAnswer/ticketReady', () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        makeTicket({ column: 'TECH_SPEC', subState: 'BLOCKED', specPin: pin }),
      );
      (gateRecordStore.list as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const result = useCase.execute(defaultInput);

      expect(result.ok && result.pendingAmendment).toBe(false);
      expect(result.ok && result.availableActions).toEqual([
        'ticketAnswer',
        'ticketReady',
        'ticketMove',
      ]);
    });

    it('a BLOCKED ticket with a pending amendment offers ticketRepin/ticketReady instead', () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        makeTicket({ column: 'TECH_SPEC', subState: 'BLOCKED', specPin: pin }),
      );
      (gateRecordStore.list as ReturnType<typeof vi.fn>).mockReturnValue([
        { gate: 'amendment', spec_pin: pin },
      ]);

      const result = useCase.execute(defaultInput);

      expect(result.ok && result.pendingAmendment).toBe(true);
      expect(result.ok && result.availableActions).toEqual([
        'ticketRepin',
        'ticketReady',
        'ticketMove',
      ]);
    });
  });
});
