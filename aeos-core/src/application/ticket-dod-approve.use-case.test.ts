import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import { TicketDodApproveUseCase } from './ticket-dod-approve.use-case.js';
import type { GateRecorder } from './services/gate-recorder.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type { CostRepository } from '../domain/ports/driven/cost-repository.port.js';
import type { StateMachineService } from '../domain/services/state-machine.js';
import type { Ticket } from '../domain/model/ticket.js';
import type { ColumnSpecLoader } from '../domain/ports/driven/column-spec-loader.port.js';
import type { ConformanceReport } from '../domain/model/conformance-report.js';
import type { GateRecord } from '../domain/model/gate-record.js';
import type { RunRecord } from '../domain/model/run-record.js';
import type { PullRequestGateway } from '../domain/ports/driven/pull-request-gateway.port.js';
import type { RunRecordStore } from '../domain/ports/driven/run-record-store.port.js';
import type { DodReview } from '../domain/ports/driving/ticket-dod-approve.port.js';
import { buildConformanceReport } from '../domain/services/conformance-builder.js';
import { traceCriteria } from '../domain/services/criteria-trace.js';
import type { ConformanceService } from './services/conformance.service.js';

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
  };
}

function createMockGitGateway(): GitGateway {
  return {
    init: vi.fn(),
    commit: vi.fn(),
    commitFiles: vi.fn(),
    stageAll: vi.fn(),
    commitAll: vi.fn().mockReturnValue(false),
    isRepo: vi.fn().mockReturnValue(true),
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
    headCommit: vi.fn().mockReturnValue('c0ffee1'),
    showFile: vi.fn().mockReturnValue(''),
    pathChangedSince: vi.fn().mockReturnValue(false),
    userIdentity: vi.fn().mockReturnValue('Test <test@test.com>'),
    listFiles: vi.fn().mockReturnValue([]),
    diff: vi.fn().mockReturnValue(''),
  };
}

function createMockArtifactStore(): ArtifactStore {
  return {
    artifactExists: vi.fn().mockReturnValue(true),
    readArtifact: vi.fn().mockReturnValue('# Ticket: AEOS-1\n\n## Title\nTest ticket'),
    getArtifactMtime: vi.fn().mockReturnValue(null),
    writeArtifact: vi.fn(),
    removeArtifact: vi.fn(),
    listArtifacts: vi.fn().mockReturnValue([]),
  };
}

function createMockStateMachine() {
  const mock: Pick<StateMachineService, 'transition' | 'setSubState'> = {
    transition: vi.fn().mockReturnValue({ ok: true }),
    setSubState: vi.fn().mockReturnValue({ ok: true }),
  };
  return mock as unknown as StateMachineService;
}

function createMockCostRepo(): CostRepository {
  return {
    record: vi.fn(() => ({ id: 'GATE-1' })),
    findByProject: vi.fn().mockReturnValue([]),
    findByTicket: vi.fn().mockReturnValue([]),
    findByFilters: vi.fn().mockReturnValue([]),
  };
}

// Shared by every describe below: the recorder is a mock, reset per test.
const gateRecorder = { decidedBy: vi.fn(), record: vi.fn() };
const recorder = gateRecorder as unknown as GateRecorder;
const callOrder = (mock: unknown): number =>
  (mock as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
beforeEach(() => {
  gateRecorder.decidedBy.mockReset();
  gateRecorder.record.mockReset().mockReturnValue({ id: 'GATE-1' });
});

const PROJECT_ID = 'startup-a';
const PROJECT_PATH = path.join(os.tmpdir(), 'aeos-test-project');
const TICKET_ID = 'AEOS-1';

function dodGateTicket(): Ticket {
  return {
    id: TICKET_ID,
    projectId: PROJECT_ID,
    title: 'Test ticket',
    kind: 'EPIC',
    parentId: null,
    column: 'DOD_GATE',
    subState: 'SIGNED_OFF',
    createdAt: '2025-01-01T09:00:00Z',
    updatedAt: '2025-01-01T10:00:00Z',
  };
}

describe('TicketDodApproveUseCase', () => {
  let ticketRepo: ReturnType<typeof createMockTicketRepo>;
  let artifactStore: ReturnType<typeof createMockArtifactStore>;
  let gitGateway: ReturnType<typeof createMockGitGateway>;
  let stateMachine: ReturnType<typeof createMockStateMachine>;
  let costRepo: ReturnType<typeof createMockCostRepo>;
  let conformance: { buildConformance: ReturnType<typeof vi.fn> };
  let runRecordStore: RunRecordStore;
  let pullRequests: PullRequestGateway;
  let columnSpecLoader: { load: ReturnType<typeof vi.fn> };
  let useCase: TicketDodApproveUseCase;

  beforeEach(() => {
    ticketRepo = createMockTicketRepo();
    artifactStore = createMockArtifactStore();
    gitGateway = createMockGitGateway();
    stateMachine = createMockStateMachine();
    costRepo = createMockCostRepo();
    conformance = { buildConformance: vi.fn() };
    runRecordStore = { write: vi.fn(), list: vi.fn().mockReturnValue([]) };
    pullRequests = { isAvailable: vi.fn(), create: vi.fn(), updateBody: vi.fn() };
    // As the templates declare it: the column called DOD_GATE is the final gate.
    columnSpecLoader = {
      load: vi.fn((column: string) => ({
        role: column === 'DOD_GATE' ? 'final-gate' : 'standard',
      })),
    };
    useCase = new TicketDodApproveUseCase(
      ticketRepo,
      artifactStore,
      stateMachine,
      gitGateway,
      costRepo,
      recorder,
      conformance as unknown as ConformanceService,
      runRecordStore,
      pullRequests,
      columnSpecLoader as ColumnSpecLoader,
    );
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(dodGateTicket());
  });

  describe('the final gate is a role, not a name', () => {
    it('decides a ticket at a final gate called anything, and records that column', () => {
      columnSpecLoader.load.mockImplementation((column: string) => ({
        role: column === 'INTEGRATION_REVIEW' ? 'final-gate' : 'standard',
      }));
      const atRelease = { ...dodGateTicket(), column: 'INTEGRATION_REVIEW' as const };
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(atRelease);

      const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true);

      expect(result.status).toBe('approved');
      expect(gateRecorder.record).toHaveBeenCalledExactlyOnceWith(PROJECT_PATH, atRelease, {
        gate: 'definition-of-done',
        verdict: 'approved',
        fromColumn: 'INTEGRATION_REVIEW',
        toColumn: 'DONE',
      });
      expect(gitGateway.commit).toHaveBeenCalledWith(
        path.join(PROJECT_PATH, '.aeos'),
        `[${TICKET_ID}][HUMAN][v1][dod-approve: INTEGRATION_REVIEW → DONE]`,
      );
    });

    it('refuses a ticket in a column that is merely called DOD_GATE', () => {
      columnSpecLoader.load.mockReturnValue({ role: 'standard' });

      expect(useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true).status).toBe('error');
      expect(gateRecorder.record).not.toHaveBeenCalled();
    });
  });

  describe('conformance at the gate', () => {
    const PIN = { repo: 'AEOS-aeos', commit: 'c0ffee1', path: 'features/checkout' };
    const specBacked = (overrides: Partial<Ticket> = {}): Ticket => ({
      ...dodGateTicket(),
      specPin: PIN,
      ...overrides,
    });
    /** AC-1 passes by test, AC-2 fails by test (unless `green`), AC-3 and AC-4 have no instrument. */
    const built = (green = false): ConformanceReport =>
      buildConformanceReport({
        feature: 'checkout',
        epic: TICKET_ID,
        trace: traceCriteria({
          criteria: ['AC-1', 'AC-2', 'AC-3', 'AC-4'],
          nonGoals: [],
          claims: new Map(),
          instruments: new Map(),
        }),
        tests: [
          { name: 'AC-1 greets', file: 'a.test.ts', status: 'pass' },
          { name: 'AC-2 remembers', file: 'a.test.ts', status: green ? 'pass' : 'fail' },
        ],
        spec: PIN,
        code: { repo: 'shop', commit: 'deadbee' },
        generatedAt: '2026-11-10T12:00:00.000Z',
      });
    const verdictOf = (report: ConformanceReport, id: string) =>
      report.criteria.find((criterion) => criterion.id === id)!;
    const review = async (verified: string[] = []): Promise<DodReview> => {
      const result = await useCase.review(PROJECT_ID, PROJECT_PATH, TICKET_ID, verified);
      if (!result.ok) throw new Error(result.error);
      return result.review;
    };
    const REASON = 'AC-2 is a known gap, tracked as AEOS-9.';

    beforeEach(() => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(specBacked());
      conformance.buildConformance.mockResolvedValue({ report: built() });
      gateRecorder.decidedBy.mockReturnValue('Kris <kris@example.com>');
      gateRecorder.record.mockReturnValue({ id: 'GATE-7' });
    });

    it('rebuilds the report and adds the verdicts of the agent that judged the unverified criteria', async () => {
      (runRecordStore.list as ReturnType<typeof vi.fn>).mockReturnValue([
        { run_id: 'RUN-0', column: 'QA', role: 'worker', agent: 'qa-agent', output: 'x.md' },
        {
          run_id: 'RUN-1',
          column: 'DOD_GATE',
          role: 'worker',
          agent: 'conformance-agent',
          output: `tickets/${TICKET_ID}/${TICKET_ID}-dod-verification.md`,
        },
        {
          run_id: 'RUN-2',
          column: 'DOD_GATE',
          role: 'reviewer',
          agent: 'reviewer',
          output: 'r.md',
        },
      ] as RunRecord[]);
      (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue(
        // AC-2 already has a failed test: the agent's opinion of it is not asked for.
        '<!-- AEOS-CONFORMANCE\nAC-2: pass | Looks fine.\nAC-3: pass | The diff stores it.\nAC-4: fail | Never read back.\n-->',
      );

      const { report, prUrl } = await review();

      expect(conformance.buildConformance).toHaveBeenCalledWith(PROJECT_PATH, TICKET_ID);
      expect(artifactStore.readArtifact).toHaveBeenCalledWith(
        PROJECT_PATH,
        TICKET_ID,
        `${TICKET_ID}-dod-verification.md`,
      );
      expect(verdictOf(report!, 'AC-3')).toMatchObject({
        verdict: 'pass',
        notes: 'The diff stores it.',
        instruments: [
          {
            kind: 'agent',
            name: 'conformance-agent',
            result: 'pass',
            evidence: `tickets/${TICKET_ID}/runs/RUN-1.json`,
          },
        ],
      });
      expect(verdictOf(report!, 'AC-4').verdict).toBe('fail');
      expect(verdictOf(report!, 'AC-2').instruments).toHaveLength(1);
      expect(prUrl).toBeNull();
    });

    it('does not take the verdicts of a run that was not signed off', async () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        specBacked({ subState: 'ESCALATED' }),
      );
      (runRecordStore.list as ReturnType<typeof vi.fn>).mockReturnValue([
        { run_id: 'RUN-1', column: 'DOD_GATE', role: 'worker', agent: 'a', output: 'x.md' },
      ] as RunRecord[]);
      (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue(
        '<!-- AEOS-CONFORMANCE\nAC-3: pass | The diff stores it.\n-->',
      );

      expect(verdictOf((await review()).report!, 'AC-3').verdict).toBe('unverified');
    });

    it('refuses to vouch for a criterion the spec does not have', async () => {
      const result = await useCase.review(PROJECT_ID, PROJECT_PATH, TICKET_ID, ['AC-9']);

      expect(result).toEqual({ ok: false, error: expect.stringContaining('AC-9') });
    });

    it('refuses a yes with no reason while a criterion is failed or unverified', async () => {
      const shown = await review();

      const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true, undefined, shown);

      expect(result).toMatchObject({ status: 'error', error: expect.stringContaining('--reason') });
      expect(gateRecorder.record).not.toHaveBeenCalled();
      expect(stateMachine.transition).not.toHaveBeenCalled();
    });

    it('refuses a decision on a spec-backed ticket whose report was not reviewed', () => {
      const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true, REASON);

      expect(result.status).toBe('error');
      expect(gateRecorder.record).not.toHaveBeenCalled();
    });

    it('approves with a reason, which goes on the gate record, and hands over the report to commit with it', async () => {
      const shown = await review(['AC-3']);
      expect(verdictOf(shown.report!, 'AC-3').verdict).toBe('pass');

      const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true, REASON, shown);

      expect(result).toMatchObject({ status: 'approved', gateRecordId: 'GATE-7' });
      const [, , decision, alongside] = gateRecorder.record.mock.calls[0] as [
        string,
        Ticket,
        object,
        (record: GateRecord) => Record<string, string>,
      ];
      expect(decision).toEqual({
        gate: 'definition-of-done',
        verdict: 'approved',
        fromColumn: 'DOD_GATE',
        toColumn: 'DONE',
        reason: REASON,
      });
      const files = alongside({ id: 'GATE-7' } as GateRecord);
      expect(Object.keys(files).sort()).toEqual(['conformance.md', 'conformance.yaml']);
      // The person who vouched is an instrument, and cites the decision.
      expect(files['conformance.yaml']).toContain('kind: "human"');
      expect(files['conformance.yaml']).toContain('name: "Kris <kris@example.com>"');
      expect(files['conformance.yaml']).toContain(
        'evidence: "features/checkout/gates.yaml#GATE-7"',
      );
      expect(files['conformance.md']).toContain(
        '| AC-3 | pass | human: Kris <kris@example.com> (pass)',
      );
      expect(stateMachine.transition).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'DONE');
    });

    it('needs no reason when every criterion passes', async () => {
      conformance.buildConformance.mockResolvedValue({ report: built(true) });
      const shown = await review(['AC-3', 'AC-4']);

      const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true, undefined, shown);

      expect(result.status).toBe('approved');
    });

    it('records a no with its reason and writes no report', async () => {
      const shown = await review();

      const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, false, REASON, shown);

      expect(result).toEqual({
        status: 'cancelled',
        ticketId: TICKET_ID,
        gateRecordId: 'GATE-7',
      });
      expect(gateRecorder.record).toHaveBeenCalledExactlyOnceWith(PROJECT_PATH, specBacked(), {
        gate: 'definition-of-done',
        verdict: 'rejected',
        reason: REASON,
      });
      expect(stateMachine.transition).not.toHaveBeenCalled();
    });

    it("fills the conformance section of the epic's pull request; a host that refuses is a warning", async () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        specBacked({ prUrl: 'https://github.com/o/r/pull/7' }),
      );
      const shown = await review();
      expect(shown.prUrl).toBe('https://github.com/o/r/pull/7');

      useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true, REASON, shown);

      const request = (pullRequests.updateBody as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
        cwd: string;
        head: string;
        update: (body: string) => string;
      };
      expect(request).toMatchObject({ cwd: PROJECT_PATH, head: `aeos/${TICKET_ID}` });
      const body = request.update('## Conformance\n\n<!-- aeos:conformance -->\n_x_\n\n## Cost\n');
      expect(body).toContain('<!-- aeos:conformance -->\n1 pass, 1 fail, 2 unverified of 4.');
      expect(body).toContain('| AC-2 | fail |');

      (pullRequests.updateBody as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('gh: not found');
      });
      const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true, REASON, shown);
      expect(result).toMatchObject({
        status: 'approved',
        warning: expect.stringContaining('gh: not found'),
      });
    });
  });

  describe('gate record', () => {
    it('records the approval as the definition-of-done gate before the ticket is DONE', () => {
      useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true);

      expect(gateRecorder.record).toHaveBeenCalledExactlyOnceWith(PROJECT_PATH, dodGateTicket(), {
        gate: 'definition-of-done',
        verdict: 'approved',
        fromColumn: 'DOD_GATE',
        toColumn: 'DONE',
      });
      expect(callOrder(gateRecorder.record)).toBeLessThan(callOrder(stateMachine.transition));
    });

    it('records a no as a rejection, with its reason, and leaves the ticket in DOD_GATE', () => {
      const result = useCase.execute(
        PROJECT_ID,
        PROJECT_PATH,
        TICKET_ID,
        false,
        'AC-3 is not demonstrated.',
      );

      expect(result).toEqual({
        status: 'cancelled',
        ticketId: TICKET_ID,
        gateRecordId: 'GATE-1',
      });
      expect(gateRecorder.record).toHaveBeenCalledExactlyOnceWith(PROJECT_PATH, dodGateTicket(), {
        gate: 'definition-of-done',
        verdict: 'rejected',
        reason: 'AC-3 is not demonstrated.',
      });
      expect(stateMachine.transition).not.toHaveBeenCalled();
    });

    it('does not mark the ticket DONE when the record cannot be written', () => {
      gateRecorder.record.mockImplementation(() => {
        throw new Error('disk full');
      });

      expect(() => useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true)).toThrow('disk full');
      expect(stateMachine.transition).not.toHaveBeenCalled();
    });

    it('records nothing for a ticket that is not at the gate', () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue({
        ...dodGateTicket(),
        column: 'QA',
      });

      expect(useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true).status).toBe('error');
      expect(gateRecorder.record).not.toHaveBeenCalled();
    });
  });

  it('should approve a DOD_GATE ticket and return approved status with total cost', () => {
    (costRepo.findByTicket as ReturnType<typeof vi.fn>).mockReturnValue([
      { costUsd: 0.05 },
      { costUsd: 0.1 },
    ]);
    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true);
    expect(result.status).toBe('approved');
    expect(result.ticketId).toBe(TICKET_ID);
    if (result.status === 'approved') {
      expect(result.totalCostUsd).toBeCloseTo(0.15, 10);
    }
  });

  it('reports the total cost as unknown when any record is unknown', () => {
    (costRepo.findByTicket as ReturnType<typeof vi.fn>).mockReturnValue([
      { costUsd: 0.05 },
      { costUsd: null },
    ]);
    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true);
    expect(result).toMatchObject({ status: 'approved', totalCostUsd: null });
  });

  it('should transition column to DONE on approval', () => {
    useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true);
    expect(stateMachine.transition).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'DONE');
  });

  it('should set sub-state to null (terminal) on approval', () => {
    useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true);
    expect(ticketRepo.updateSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, null);
  });

  it('should update the ticket document metadata to DONE before commit', () => {
    useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true);
    expect(artifactStore.writeArtifact).toHaveBeenCalledWith(
      PROJECT_PATH,
      TICKET_ID,
      `${TICKET_ID}-ticket.md`,
      expect.stringContaining('- Column: DONE'),
    );
    expect(artifactStore.writeArtifact).toHaveBeenCalledWith(
      PROJECT_PATH,
      TICKET_ID,
      `${TICKET_ID}-ticket.md`,
      expect.stringContaining('- Sub-state: NONE'),
    );
  });

  it('should commit approval to git with correct message', () => {
    useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true);
    expect(gitGateway.commit).toHaveBeenCalledWith(
      path.join(PROJECT_PATH, '.aeos'),
      `[${TICKET_ID}][HUMAN][v1][dod-approve: DOD_GATE → DONE]`,
    );
  });

  it('should return cancelled when not approved', () => {
    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, false);
    expect(result).toEqual({
      status: 'cancelled',
      ticketId: TICKET_ID,
      gateRecordId: 'GATE-1',
    });
  });

  it('should not transition or commit when not approved', () => {
    useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, false);
    expect(stateMachine.transition).not.toHaveBeenCalled();
    expect(gitGateway.commit).not.toHaveBeenCalled();
  });

  it('should return error when ticket is not found', () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true);
    expect(result).toEqual({
      status: 'error',
      ticketId: TICKET_ID,
      error: `Ticket ${TICKET_ID} not found`,
    });
  });

  it('should return error when ticket is not in DOD_GATE column', () => {
    const ticket = dodGateTicket();
    ticket.column = 'QA';
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(ticket);
    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true);
    expect(result).toEqual({
      status: 'error',
      ticketId: TICKET_ID,
      error: `Ticket ${TICKET_ID} is not in DOD_GATE (current column: QA). Only DOD_GATE tickets can be approved via dod-approve.`,
    });
  });

  it('should return error when transition fails', () => {
    (stateMachine.transition as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: false,
      reason: 'Cannot transition',
    });
    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true);
    expect(result).toEqual({
      status: 'error',
      ticketId: TICKET_ID,
      error: 'Cannot transition',
    });
  });

  it('should compensate on git commit failure by reverting column and sub-state', () => {
    (gitGateway.commit as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('git commit failed');
    });
    expect(() => useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true)).toThrow(
      'git commit failed',
    );
    // Should revert to DOD_GATE
    expect(stateMachine.transition).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'DOD_GATE');
    // Should restore previous sub-state
    expect(stateMachine.setSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'SIGNED_OFF');
  });

  it('should return zero total cost when no cost records exist', () => {
    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true);
    expect(result).toEqual({
      status: 'approved',
      ticketId: TICKET_ID,
      gateRecordId: 'GATE-1',
      totalCostUsd: 0,
    });
  });

  it('should return error when ticket is in BACKLOG column', () => {
    const ticket = dodGateTicket();
    ticket.column = 'BACKLOG';
    ticket.subState = null;
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(ticket);
    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true);
    expect(result).toEqual({
      status: 'error',
      ticketId: TICKET_ID,
      error: `Ticket ${TICKET_ID} is not in DOD_GATE (current column: BACKLOG). Only DOD_GATE tickets can be approved via dod-approve.`,
    });
  });

  it('should return error when ticket is already DONE', () => {
    const ticket = dodGateTicket();
    ticket.column = 'DONE';
    ticket.subState = null;
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(ticket);
    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true);
    expect(result).toEqual({
      status: 'error',
      ticketId: TICKET_ID,
      error: `Ticket ${TICKET_ID} is not in DOD_GATE (current column: DONE). Only DOD_GATE tickets can be approved via dod-approve.`,
    });
  });
});
