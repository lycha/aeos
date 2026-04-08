import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TicketAnswerUseCase } from './ticket-answer.use-case.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
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
    updateColumn: vi.fn(),
    updateSubState: vi.fn(),
  };
}

function createMockArtifactStore(): ArtifactStore {
  return {
    artifactExists: vi.fn().mockReturnValue(true),
    readArtifact: vi.fn().mockReturnValue(''),
    getArtifactMtime: vi.fn().mockReturnValue(new Date('2025-01-01T12:00:00Z')),
    writeArtifact: vi.fn(),
    removeArtifact: vi.fn(),
    listArtifacts: vi.fn().mockReturnValue([]),
  };
}

function createMockGitGateway(): GitGateway {
  return {
    init: vi.fn(),
    commit: vi.fn(),
    commitFiles: vi.fn(),
  };
}

function createMockStateMachine() {
  // Only 'transition' and 'setSubState' are used by TicketAnswerUseCase
  const mock: Pick<StateMachineService, 'transition' | 'setSubState'> = {
    transition: vi.fn().mockReturnValue({ ok: true }),
    setSubState: vi.fn().mockReturnValue({ ok: true }),
  };
  return mock as unknown as StateMachineService;
}

const PROJECT_ID = 'startup-a';
const PROJECT_PATH = path.join(os.tmpdir(), 'aeos-test-project');
const TICKET_ID = 'AEOS-1';

function blockedTicket(updatedAt = '2025-01-01T10:00:00Z'): Ticket {
  return {
    id: TICKET_ID,
    projectId: PROJECT_ID,
    title: 'Test ticket',
    column: 'IMPLEMENTATION' as Ticket['column'],
    subState: 'BLOCKED',
    createdAt: '2025-01-01T09:00:00Z',
    updatedAt,
  };
}

describe('TicketAnswerUseCase', () => {
  let ticketRepo: ReturnType<typeof createMockTicketRepo>;
  let artifactStore: ReturnType<typeof createMockArtifactStore>;
  let gitGateway: ReturnType<typeof createMockGitGateway>;
  let stateMachine: ReturnType<typeof createMockStateMachine>;
  let useCase: TicketAnswerUseCase;

  const defaultInput = { projectId: PROJECT_ID, projectPath: PROJECT_PATH, ticketId: TICKET_ID };

  beforeEach(() => {
    ticketRepo = createMockTicketRepo();
    artifactStore = createMockArtifactStore();
    gitGateway = createMockGitGateway();
    stateMachine = createMockStateMachine();
    useCase = new TicketAnswerUseCase(ticketRepo, artifactStore, stateMachine, gitGateway);
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(blockedTicket());
  });

  it('should unblock a BLOCKED ticket with modified questions file', () => {
    const result = useCase.execute(defaultInput);
    expect(result).toEqual({ ok: true, ticketId: TICKET_ID });
  });

  it('should call setSubState with WORKING', () => {
    useCase.execute(defaultInput);
    expect(stateMachine.setSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'WORKING');
  });

  it('should commit the answered questions file', () => {
    useCase.execute(defaultInput);
    expect(gitGateway.commitFiles).toHaveBeenCalledWith(
      path.join(PROJECT_PATH, '.aeos'),
      [path.join(PROJECT_PATH, '.aeos', 'tickets', TICKET_ID, `${TICKET_ID}-questions.md`)],
      `[${TICKET_ID}][QUESTIONS][v1][human][answered]`,
    );
  });

  it('should return error when ticket is not found', () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const result = useCase.execute(defaultInput);
    expect(result).toEqual({ ok: false, error: `Ticket ${TICKET_ID} not found` });
  });

  it('should return error when ticket is not BLOCKED', () => {
    const ticket = blockedTicket();
    ticket.subState = 'WORKING';
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(ticket);
    const result = useCase.execute(defaultInput);
    expect(result).toMatchObject({ ok: false });
    expect('error' in result && result.error).toContain('not blocked');
  });

  it('should return error when questions file does not exist', () => {
    (artifactStore.artifactExists as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const result = useCase.execute(defaultInput);
    expect(result).toMatchObject({ ok: false });
    expect('error' in result && result.error).toContain('Questions file not found');
  });

  it('should return needsConfirmation when file is not modified', () => {
    // mtime <= updatedAt → unmodified
    (artifactStore.getArtifactMtime as ReturnType<typeof vi.fn>).mockReturnValue(
      new Date('2025-01-01T09:00:00Z'),
    );
    const result = useCase.execute(defaultInput);
    expect(result).toEqual({
      ok: false,
      needsConfirmation: true,
      reason: 'questions file not modified',
    });
  });

  it('should skip mtime check when confirmed is true', () => {
    (artifactStore.getArtifactMtime as ReturnType<typeof vi.fn>).mockReturnValue(
      new Date('2025-01-01T09:00:00Z'),
    );
    const result = useCase.execute({ ...defaultInput, confirmed: true });
    expect(result).toEqual({ ok: true, ticketId: TICKET_ID });
  });

  it('should revert sub-state to BLOCKED when git commit fails', () => {
    (gitGateway.commitFiles as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('git commit failed');
    });
    expect(() => useCase.execute(defaultInput)).toThrow('git commit failed');
    expect(stateMachine.setSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'BLOCKED');
  });

  it('should return error when ticket subState is null', () => {
    const ticket = blockedTicket();
    ticket.subState = null;
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(ticket);
    const result = useCase.execute(defaultInput);
    expect(result).toMatchObject({ ok: false });
    expect('error' in result && result.error).toContain('not blocked');
  });
});
