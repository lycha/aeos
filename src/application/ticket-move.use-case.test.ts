import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TicketMoveUseCase } from './ticket-move.use-case.js';
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
  };
}

function createMockGitGateway(): GitGateway {
  return {
    init: vi.fn(),
    commit: vi.fn(),
    commitFiles: vi.fn(),
    stageAll: vi.fn(),
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
    column: 'PRODUCT_SCOPING',
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
    useCase = new TicketMoveUseCase(ticketRepo, artifactStore, stateMachine, gitGateway);
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(makeTicket());
  });

  it('moves a ticket to any non-terminal column and sets READY', () => {
    const result = useCase.execute({
      projectId: PROJECT_ID,
      projectPath: PROJECT_PATH,
      ticketId: TICKET_ID,
      targetColumn: 'QA',
    });
    expect(result).toEqual({
      status: 'moved',
      ticketId: TICKET_ID,
      fromColumn: 'PRODUCT_SCOPING',
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
    });
    expect(gitGateway.commit).toHaveBeenCalledWith(
      path.join(PROJECT_PATH, '.aeos'),
      `[${TICKET_ID}][HUMAN][v1][move: PRODUCT_SCOPING → TECH_SPEC]`,
    );
  });

  it('returns error when ticket is not found', () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const result = useCase.execute({
      projectId: PROJECT_ID,
      projectPath: PROJECT_PATH,
      ticketId: TICKET_ID,
      targetColumn: 'QA',
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
      reason: 'Already in PRODUCT_SCOPING',
    });
    const result = useCase.execute({
      projectId: PROJECT_ID,
      projectPath: PROJECT_PATH,
      ticketId: TICKET_ID,
      targetColumn: 'PRODUCT_SCOPING',
    });
    expect(result).toEqual({
      status: 'error',
      ticketId: TICKET_ID,
      error: 'Already in PRODUCT_SCOPING',
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
      }),
    ).toThrow('git commit failed');
    expect(stateMachine.transition).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'PRODUCT_SCOPING');
    expect(stateMachine.setSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'WORKING');
  });
});
