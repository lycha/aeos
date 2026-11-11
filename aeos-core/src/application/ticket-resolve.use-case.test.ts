import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TicketResolveUseCase } from './ticket-resolve.use-case.js';
import { buildEscalationDocument } from './services/escalation-document.js';
import type { GateRecorder } from './services/gate-recorder.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type { StateMachineService } from '../domain/services/state-machine.js';
import type { Ticket } from '../domain/model/ticket.js';

// Shared by every describe below: the recorder is a mock, reset per test.
const gateRecorder = { decidedBy: vi.fn(), record: vi.fn() };
const recorder = gateRecorder as unknown as GateRecorder;
const callOrder = (mock: unknown): number =>
  (mock as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
beforeEach(() => {
  gateRecorder.decidedBy.mockReset();
  gateRecorder.record.mockReset();
});

const PROJECT_ID = 'p';
const PROJECT_PATH = '/proj';
const TICKET_ID = 'STAN-4';

function mockArtifactStore(): ArtifactStore {
  return {
    artifactExists: vi.fn().mockReturnValue(true),
    readArtifact: vi.fn().mockReturnValue(''),
    getArtifactMtime: vi.fn().mockReturnValue(new Date('2030-01-01T00:00:00Z')),
    writeArtifact: vi.fn(),
    removeArtifact: vi.fn(),
    listArtifacts: vi.fn().mockReturnValue([]),
  };
}

function mockGit(): GitGateway {
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

function mockRepo(ticket: Ticket | null): TicketRepository {
  return {
    nextId: vi.fn(),
    save: vi.fn(),
    createAtomic: vi.fn(),
    deleteById: vi.fn(),
    findById: vi.fn().mockReturnValue(ticket),
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

function mockStateMachine(): StateMachineService {
  return {
    transition: vi.fn().mockReturnValue({ ok: true }),
    setSubState: vi.fn().mockReturnValue({ ok: true }),
  } as unknown as StateMachineService;
}

function escalatedTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: TICKET_ID,
    projectId: PROJECT_ID,
    title: 'A task',
    kind: 'TASK',
    parentId: 'STAN-1',
    column: 'CODE_REVIEW',
    subState: 'ESCALATED',
    createdAt: '2020-01-01T00:00:00Z',
    updatedAt: '2020-01-01T00:00:00Z',
    escalation: { reason: 'NOT_CONVERGING', message: 'stuck', artifactPath: null },
    ...overrides,
  };
}

const filledEscalation = buildEscalationDocument({
  ticketId: TICKET_ID,
  column: 'CODE_REVIEW',
  reason: 'NOT_CONVERGING',
  message: 'stuck',
}).replace(/```text\n\n```/, '```text\nUse response_url per D-6.\n```');

describe('TicketResolveUseCase', () => {
  let artifactStore: ReturnType<typeof mockArtifactStore>;
  let git: ReturnType<typeof mockGit>;
  let stateMachine: StateMachineService;

  beforeEach(() => {
    artifactStore = mockArtifactStore();
    git = mockGit();
    stateMachine = mockStateMachine();
  });

  function run(ticket: Ticket | null) {
    const useCase = new TicketResolveUseCase(
      mockRepo(ticket),
      artifactStore,
      stateMachine,
      git,
      recorder,
    );
    return useCase.execute({
      projectId: PROJECT_ID,
      projectPath: PROJECT_PATH,
      ticketId: TICKET_ID,
    });
  }

  describe('gate record', () => {
    const resolvable = (): Ticket => {
      (artifactStore.artifactExists as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue(filledEscalation);
      (artifactStore.getArtifactMtime as ReturnType<typeof vi.fn>).mockReturnValue(new Date());
      return escalatedTicket();
    };

    it('records the resolution before the ticket is READY again', () => {
      const ticket = resolvable();

      expect(run(ticket)).toMatchObject({ ok: true });

      expect(gateRecorder.record).toHaveBeenCalledExactlyOnceWith(PROJECT_PATH, ticket, {
        gate: 'escalation-resolution',
        verdict: 'approved',
      });
      expect(callOrder(gateRecorder.record)).toBeLessThan(callOrder(stateMachine.setSubState));
    });

    it('leaves the ticket ESCALATED when the record cannot be written', () => {
      gateRecorder.record.mockImplementation(() => {
        throw new Error('disk full');
      });

      expect(() => run(resolvable())).toThrow('disk full');
      expect(stateMachine.setSubState).not.toHaveBeenCalled();
    });

    it('records nothing for a ticket that is not escalated', () => {
      run(escalatedTicket({ subState: 'READY' }));

      expect(gateRecorder.record).not.toHaveBeenCalled();
    });
  });

  it('rejects a ticket that is not escalated', () => {
    const result = run(escalatedTicket({ subState: 'READY' }));
    expect(result).toMatchObject({ ok: false });
    if (!result.ok && 'error' in result) expect(result.error).toContain('not escalated');
  });

  it('writes the response as a resolution artifact and sets READY', () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue(filledEscalation);

    const result = run(escalatedTicket());

    expect(result).toEqual({ ok: true, ticketId: TICKET_ID });
    // Resolution artifact captured the operator's guidance.
    expect(artifactStore.writeArtifact).toHaveBeenCalledWith(
      PROJECT_PATH,
      TICKET_ID,
      'STAN-4-resolution.md',
      expect.stringContaining('Use response_url per D-6.'),
    );
    // Sub-state returned to READY (which also clears the stored escalation).
    expect(stateMachine.setSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'READY');
    expect(git.commitFiles).toHaveBeenCalled();
  });

  it('errors when the response block is empty', () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue(
      buildEscalationDocument({ ticketId: TICKET_ID, column: 'QA', reason: 'X', message: 'm' }),
    );

    const result = run(escalatedTicket());

    expect(result).toMatchObject({ ok: false });
    if (!result.ok && 'error' in result) expect(result.error).toContain('No response found');
    expect(stateMachine.setSubState).not.toHaveBeenCalled();
  });

  it('asks for confirmation when the file was not modified since escalation', () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue(filledEscalation);
    (artifactStore.getArtifactMtime as ReturnType<typeof vi.fn>).mockReturnValue(
      new Date('2019-01-01T00:00:00Z'), // older than ticket.updatedAt
    );

    const result = run(escalatedTicket({ updatedAt: '2020-06-01T00:00:00Z' }));

    expect(result).toMatchObject({ ok: false, needsConfirmation: true });
  });
});
