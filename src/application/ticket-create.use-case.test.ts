import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TicketCreateUseCase } from './ticket-create.use-case.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type { Ticket } from '../domain/model/ticket.js';

function createMockTicketRepo(): TicketRepository {
  return {
    nextId: vi.fn().mockReturnValue(1),
    save: vi.fn(),
    deleteById: vi.fn(),
    findById: vi.fn().mockReturnValue(null),
    findByProject: vi.fn().mockReturnValue([]),
    updateColumn: vi.fn(),
    updateSubState: vi.fn(),
  };
}

function createMockArtifactStore(): ArtifactStore {
  return {
    writeArtifact: vi.fn(),
    removeArtifact: vi.fn(),
    listArtifacts: vi.fn().mockReturnValue([]),
  };
}

function createMockGitGateway(): GitGateway {
  return {
    init: vi.fn(),
    commit: vi.fn(),
    commitFiles: vi.fn().mockResolvedValue(undefined),
  };
}

describe('TicketCreateUseCase', () => {
  let ticketRepo: ReturnType<typeof createMockTicketRepo>;
  let artifactStore: ReturnType<typeof createMockArtifactStore>;
  let gitGateway: ReturnType<typeof createMockGitGateway>;
  let useCase: TicketCreateUseCase;

  const defaultInput = {
    title: 'Add rate limiting',
    projectId: 'startup-a',
    projectKey: 'AEOS',
    projectPath: path.join(os.tmpdir(), 'aeos-test-project'),
  };

  beforeEach(() => {
    ticketRepo = createMockTicketRepo();
    artifactStore = createMockArtifactStore();
    gitGateway = createMockGitGateway();
    useCase = new TicketCreateUseCase(ticketRepo, artifactStore, gitGateway);
  });

  it('should return the generated ticket ID and title', () => {
    const result = useCase.execute(defaultInput);

    expect(result).toEqual({ ticketId: 'AEOS-1', title: 'Add rate limiting' });
  });

  it('should query nextId with the project ID', () => {
    useCase.execute(defaultInput);

    expect(ticketRepo.nextId).toHaveBeenCalledWith('startup-a');
  });

  it('should write artifact with correct filename and path', () => {
    useCase.execute(defaultInput);

    expect(artifactStore.writeArtifact).toHaveBeenCalledWith(
      defaultInput.projectPath,
      'AEOS-1',
      'AEOS-1-ticket.md',
      expect.any(String),
    );
  });

  it('should generate ticket file with all four required sections', () => {
    useCase.execute(defaultInput);

    const content = (artifactStore.writeArtifact as ReturnType<typeof vi.fn>).mock
      .calls[0][3] as string;

    expect(content).toContain('# Ticket: AEOS-1');
    expect(content).toContain('## Title');
    expect(content).toContain('Add rate limiting');
    expect(content).toContain('## Description');
    expect(content).toContain('## Definition of Done');
    expect(content).toContain('## Notes');
  });

  it('should save ticket to DB with column BACKLOG and null sub_state', () => {
    useCase.execute(defaultInput);

    expect(ticketRepo.save).toHaveBeenCalledOnce();
    const savedTicket = (ticketRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Ticket;

    expect(savedTicket.id).toBe('AEOS-1');
    expect(savedTicket.projectId).toBe('startup-a');
    expect(savedTicket.title).toBe('Add rate limiting');
    expect(savedTicket.column).toBe('BACKLOG');
    expect(savedTicket.subState).toBeNull();
    expect(savedTicket.createdAt).toBeTruthy();
    expect(savedTicket.updatedAt).toBeTruthy();
  });

  it('should commit with structured message', () => {
    useCase.execute(defaultInput);

    expect(gitGateway.commit).toHaveBeenCalledWith(
      path.join(defaultInput.projectPath, '.aeos'),
      '[AEOS-1][TICKET][v1][human][create]',
    );
  });

  it('should auto-increment ticket ID', () => {
    (ticketRepo.nextId as ReturnType<typeof vi.fn>).mockReturnValue(5);

    const result = useCase.execute(defaultInput);

    expect(result.ticketId).toBe('AEOS-5');
  });

  it('should call operations in correct order', () => {
    const callOrder: string[] = [];
    (artifactStore.writeArtifact as ReturnType<typeof vi.fn>).mockImplementation(() =>
      callOrder.push('writeArtifact'),
    );
    (ticketRepo.save as ReturnType<typeof vi.fn>).mockImplementation(() => callOrder.push('save'));
    (gitGateway.commit as ReturnType<typeof vi.fn>).mockImplementation(() =>
      callOrder.push('commit'),
    );

    useCase.execute(defaultInput);

    expect(callOrder).toEqual(['save', 'writeArtifact', 'commit']);
  });

  it('should produce two distinct tickets when called twice', () => {
    (ticketRepo.nextId as ReturnType<typeof vi.fn>).mockReturnValueOnce(1).mockReturnValueOnce(2);

    const r1 = useCase.execute(defaultInput);
    const r2 = useCase.execute({ ...defaultInput, title: 'Second ticket' });

    expect(r1.ticketId).toBe('AEOS-1');
    expect(r2.ticketId).toBe('AEOS-2');
    expect(artifactStore.writeArtifact).toHaveBeenCalledTimes(2);
    expect(ticketRepo.save).toHaveBeenCalledTimes(2);
  });
});
