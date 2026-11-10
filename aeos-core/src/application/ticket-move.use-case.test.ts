import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TicketMoveUseCase } from './ticket-move.use-case.js';
import type { GateRecorder } from './services/gate-recorder.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type { StateMachineService } from '../domain/services/state-machine.js';
import type { Ticket } from '../domain/model/ticket.js';

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

// Shared by every describe below: the recorder is a mock, reset per test.
const gateRecorder = { decidedBy: vi.fn(), record: vi.fn() };
const recorder = gateRecorder as unknown as GateRecorder;
const callOrder = (mock: unknown): number =>
  (mock as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
beforeEach(() => {
  gateRecorder.decidedBy.mockReset();
  gateRecorder.record.mockReset();
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
    column: 'SPEC_REVIEW',
    subState: 'WORKING',
    createdAt: '2025-01-01T09:00:00Z',
    updatedAt: '2025-01-01T10:00:00Z',
    ...overrides,
  };
}

describe('TicketMoveUseCase', () => {
  let ticketRepo: ReturnType<typeof createMockTicketRepo>;
  let artifactStore: ReturnType<typeof createMockArtifactStore>;
  let gitGateway: ReturnType<typeof createMockGitGateway>;
  let stateMachine: ReturnType<typeof createMockStateMachine>;
  let useCase: TicketMoveUseCase;

  beforeEach(() => {
    ticketRepo = createMockTicketRepo();
    artifactStore = createMockArtifactStore();
    gitGateway = createMockGitGateway();
    stateMachine = createMockStateMachine();
    useCase = new TicketMoveUseCase(ticketRepo, artifactStore, stateMachine, gitGateway, recorder);
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(makeTicket());
  });

  describe('gate record', () => {
    const input = {
      projectId: PROJECT_ID,
      projectPath: PROJECT_PATH,
      ticketId: TICKET_ID,
      targetColumn: 'QA' as const,
      reason: 'Skipping ahead: built by hand.',
    };

    it('records the override with its reason before the ticket moves', () => {
      useCase.execute(input);

      expect(gateRecorder.record).toHaveBeenCalledExactlyOnceWith(PROJECT_PATH, makeTicket(), {
        gate: 'move-override',
        verdict: 'overridden',
        fromColumn: 'SPEC_REVIEW',
        toColumn: 'QA',
        reason: 'Skipping ahead: built by hand.',
      });
      expect(callOrder(gateRecorder.record)).toBeLessThan(callOrder(stateMachine.transition));
    });

    it('does not move the ticket when the record is refused or cannot be written', () => {
      gateRecorder.record.mockImplementation(() => {
        throw new Error('needs a written reason');
      });

      expect(() => useCase.execute(input)).toThrow('needs a written reason');
      expect(stateMachine.transition).not.toHaveBeenCalled();
      expect(gitGateway.commit).not.toHaveBeenCalled();
    });

    it('records nothing for a move to the column the ticket is already in', () => {
      const result = useCase.execute({ ...input, targetColumn: 'SPEC_REVIEW' });

      expect(result).toMatchObject({ status: 'error', error: 'Already in SPEC_REVIEW' });
      expect(gateRecorder.record).not.toHaveBeenCalled();
    });
  });

  it('moves a ticket to any non-terminal column and sets READY', () => {
    const result = useCase.execute({
      projectId: PROJECT_ID,
      projectPath: PROJECT_PATH,
      ticketId: TICKET_ID,
      targetColumn: 'QA',
      reason: 'A reason that is long enough.',
    });
    expect(result).toEqual({
      status: 'moved',
      ticketId: TICKET_ID,
      fromColumn: 'SPEC_REVIEW',
      toColumn: 'QA',
    });
    expect(stateMachine.transition).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'QA');
    expect(stateMachine.setSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'READY');
  });

  it('moves a ticket to DONE and clears sub-state', () => {
    useCase.execute({
      projectId: PROJECT_ID,
      projectPath: PROJECT_PATH,
      ticketId: TICKET_ID,
      targetColumn: 'DONE',
      reason: 'A reason that is long enough.',
    });
    expect(ticketRepo.updateSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, null);
    expect(stateMachine.setSubState).not.toHaveBeenCalled();
  });

  it('updates the ticket document metadata for the new target state', () => {
    useCase.execute({
      projectId: PROJECT_ID,
      projectPath: PROJECT_PATH,
      ticketId: TICKET_ID,
      targetColumn: 'QA',
      reason: 'A reason that is long enough.',
    });
    expect(artifactStore.writeArtifact).toHaveBeenCalledWith(
      PROJECT_PATH,
      TICKET_ID,
      `${TICKET_ID}-ticket.md`,
      expect.stringContaining('- Column: QA'),
    );
    expect(artifactStore.writeArtifact).toHaveBeenCalledWith(
      PROJECT_PATH,
      TICKET_ID,
      `${TICKET_ID}-ticket.md`,
      expect.stringContaining('- Sub-state: READY'),
    );
  });

  it('commits the human move to git', () => {
    useCase.execute({
      projectId: PROJECT_ID,
      projectPath: PROJECT_PATH,
      ticketId: TICKET_ID,
      targetColumn: 'TECH_SPEC',
      reason: 'A reason that is long enough.',
    });
    expect(gitGateway.commit).toHaveBeenCalledWith(
      path.join(PROJECT_PATH, '.aeos'),
      `[${TICKET_ID}][HUMAN][v1][move: SPEC_REVIEW → TECH_SPEC]`,
    );
  });

  it('returns error when ticket is not found', () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const result = useCase.execute({
      projectId: PROJECT_ID,
      projectPath: PROJECT_PATH,
      ticketId: TICKET_ID,
      targetColumn: 'QA',
      reason: 'A reason that is long enough.',
    });
    expect(result).toEqual({
      status: 'error',
      ticketId: TICKET_ID,
      error: `Ticket ${TICKET_ID} not found`,
    });
  });

  it('returns error when transition fails', () => {
    (stateMachine.transition as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: false,
      reason: 'Already in SPEC_REVIEW',
    });
    const result = useCase.execute({
      projectId: PROJECT_ID,
      projectPath: PROJECT_PATH,
      ticketId: TICKET_ID,
      targetColumn: 'SPEC_REVIEW',
      reason: 'A reason that is long enough.',
    });
    expect(result).toEqual({
      status: 'error',
      ticketId: TICKET_ID,
      error: 'Already in SPEC_REVIEW',
    });
  });

  it('returns error when READY state cannot be set', () => {
    (stateMachine.setSubState as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: false,
      reason: 'Ticket not found',
    });
    const result = useCase.execute({
      projectId: PROJECT_ID,
      projectPath: PROJECT_PATH,
      ticketId: TICKET_ID,
      targetColumn: 'QA',
      reason: 'A reason that is long enough.',
    });
    expect(result).toEqual({
      status: 'error',
      ticketId: TICKET_ID,
      error: 'Failed to set READY state: Ticket not found',
    });
  });

  it('compensates on git commit failure by restoring the original column and sub-state', () => {
    (gitGateway.commit as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('git commit failed');
    });
    expect(() =>
      useCase.execute({
        projectId: PROJECT_ID,
        projectPath: PROJECT_PATH,
        ticketId: TICKET_ID,
        targetColumn: 'QA',
        reason: 'A reason that is long enough.',
      }),
    ).toThrow('git commit failed');
    expect(stateMachine.transition).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'SPEC_REVIEW');
    expect(stateMachine.setSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'WORKING');
  });
});
