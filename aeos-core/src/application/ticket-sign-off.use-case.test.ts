import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TicketSignOffUseCase } from './ticket-sign-off.use-case.js';
import type { GateRecorder } from './services/gate-recorder.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type { StateMachineService } from '../domain/services/state-machine.js';
import type { Ticket } from '../domain/model/ticket.js';

function createMockTicketRepo(): TicketRepository {
  return {
    nextId: vi.fn(),
    save: vi.fn(),
    createAtomic: vi.fn(),
    deleteById: vi.fn(),
    findById: vi.fn(),
    findByProject: vi.fn(),
    findChildren: vi.fn().mockReturnValue([]),
    updateColumn: vi.fn(),
    updateSubState: vi.fn(),
    setEscalation: vi.fn(),
    setPrUrl: vi.fn(),
    setSpecCommit: vi.fn(),
  };
}
function createMockArtifactStore(): ArtifactStore {
  return {
    artifactExists: vi.fn(),
    readArtifact: vi.fn().mockReturnValue('# Ticket: AEOS-1\n\n## Title\nTest'),
    getArtifactMtime: vi.fn(),
    writeArtifact: vi.fn(),
    removeArtifact: vi.fn(),
    listArtifacts: vi.fn(),
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
    diff: vi.fn(),
  };
}
function createMockStateMachine() {
  const mock: Pick<StateMachineService, 'transition' | 'setSubState'> = {
    transition: vi.fn(),
    setSubState: vi.fn().mockReturnValue({ ok: true }),
  };
  return mock as unknown as StateMachineService;
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

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: TICKET_ID,
    projectId: PROJECT_ID,
    title: 'Test ticket',
    kind: 'EPIC',
    parentId: null,
    column: 'TECH_SPEC',
    subState: 'FAILED',
    createdAt: '2025-01-01T09:00:00Z',
    updatedAt: '2025-01-01T10:00:00Z',
    ...overrides,
  };
}

describe('TicketSignOffUseCase', () => {
  let ticketRepo: ReturnType<typeof createMockTicketRepo>;
  let artifactStore: ReturnType<typeof createMockArtifactStore>;
  let gitGateway: ReturnType<typeof createMockGitGateway>;
  let stateMachine: ReturnType<typeof createMockStateMachine>;
  let useCase: TicketSignOffUseCase;

  beforeEach(() => {
    ticketRepo = createMockTicketRepo();
    artifactStore = createMockArtifactStore();
    gitGateway = createMockGitGateway();
    stateMachine = createMockStateMachine();
    useCase = new TicketSignOffUseCase(ticketRepo, artifactStore, stateMachine, recorder);
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(makeTicket());
  });

  describe('gate record', () => {
    const input = {
      projectId: PROJECT_ID,
      projectPath: PROJECT_PATH,
      ticketId: TICKET_ID,
      reason: 'The reviewer misread AC-2.',
    };

    it('records the override with its reason before the ticket is signed off', () => {
      useCase.execute(input);

      expect(gateRecorder.record).toHaveBeenCalledExactlyOnceWith(PROJECT_PATH, makeTicket(), {
        gate: 'sign-off-override',
        verdict: 'overridden',
        reason: 'The reviewer misread AC-2.',
      });
      expect(callOrder(gateRecorder.record)).toBeLessThan(callOrder(stateMachine.setSubState));
    });

    it('leaves the ticket as it is when the record is refused or cannot be written', () => {
      gateRecorder.record.mockImplementation(() => {
        throw new Error('needs a written reason');
      });

      expect(() => useCase.execute(input)).toThrow('needs a written reason');
      expect(stateMachine.setSubState).not.toHaveBeenCalled();
    });

    it('records nothing for a sign-off that is refused', () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        makeTicket({ subState: 'SIGNED_OFF' }),
      );

      expect(useCase.execute(input).status).toBe('error');
      expect(gateRecorder.record).not.toHaveBeenCalled();
    });
  });

  it('marks a ticket SIGNED_OFF and mirrors it to disk without committing', () => {
    const result = useCase.execute({
      projectId: PROJECT_ID,
      projectPath: PROJECT_PATH,
      ticketId: TICKET_ID,
      reason: 'A reason that is long enough.',
    });
    expect(result).toEqual({
      status: 'signed_off',
      ticketId: TICKET_ID,
      gateRecordId: 'GATE-1',
      previousSubState: 'FAILED',
    });
    expect(stateMachine.setSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'SIGNED_OFF');
    expect(artifactStore.writeArtifact).toHaveBeenCalledWith(
      PROJECT_PATH,
      TICKET_ID,
      `${TICKET_ID}-ticket.md`,
      expect.stringContaining('- Sub-state: SIGNED_OFF'),
    );
    // Sub-state is authoritative in SQLite; git carries artifacts only.
    expect(gitGateway.commitFiles).not.toHaveBeenCalled();
  });

  it('returns an error when the ticket is not found', () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(null);
    expect(
      useCase.execute({
        projectId: PROJECT_ID,
        projectPath: PROJECT_PATH,
        ticketId: TICKET_ID,
        reason: 'A reason that is long enough.',
      }),
    ).toEqual({
      status: 'error',
      ticketId: TICKET_ID,
      error: `Ticket ${TICKET_ID} not found`,
    });
  });

  it('returns an error for BACKLOG or DONE tickets', () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTicket({ column: 'BACKLOG', subState: null }),
    );
    expect(
      useCase.execute({
        projectId: PROJECT_ID,
        projectPath: PROJECT_PATH,
        ticketId: TICKET_ID,
        reason: 'A reason that is long enough.',
      }),
    ).toEqual({
      status: 'error',
      ticketId: TICKET_ID,
      error: `Ticket ${TICKET_ID} cannot be signed off in BACKLOG`,
    });
  });

  it('returns an error when the ticket is already SIGNED_OFF', () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTicket({ subState: 'SIGNED_OFF' }),
    );
    expect(
      useCase.execute({
        projectId: PROJECT_ID,
        projectPath: PROJECT_PATH,
        ticketId: TICKET_ID,
        reason: 'A reason that is long enough.',
      }),
    ).toEqual({
      status: 'error',
      ticketId: TICKET_ID,
      error: `Ticket ${TICKET_ID} is already SIGNED_OFF`,
    });
  });

  it('returns an error when setting SIGNED_OFF fails', () => {
    (stateMachine.setSubState as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: false,
      reason: 'Ticket not found',
    });
    expect(
      useCase.execute({
        projectId: PROJECT_ID,
        projectPath: PROJECT_PATH,
        ticketId: TICKET_ID,
        reason: 'A reason that is long enough.',
      }),
    ).toEqual({
      status: 'error',
      ticketId: TICKET_ID,
      error: 'Failed to set SIGNED_OFF state: Ticket not found',
    });
  });

  // The git-commit rollback that used to live here is gone with the commit
  // itself: there is no longer a second write to fail after the state change.
});
