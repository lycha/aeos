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
    createAtomic: vi
      .fn()
      .mockImplementation((_projectId: string, buildTicket: (n: number) => Ticket) => {
        const nextNum = 1;
        const ticket = buildTicket(nextNum);
        return ticket;
      }),
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
    commitFiles: vi.fn(),
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

  it('should call createAtomic with the project ID', () => {
    useCase.execute(defaultInput);

    expect(ticketRepo.createAtomic).toHaveBeenCalledWith('startup-a', expect.any(Function));
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

  it('should build ticket with column BACKLOG and null sub_state via createAtomic', () => {
    let capturedTicket: Ticket | null = null;
    (ticketRepo.createAtomic as ReturnType<typeof vi.fn>).mockImplementation(
      (_pid: string, build: (n: number) => Ticket) => {
        capturedTicket = build(1);
        return capturedTicket;
      },
    );

    useCase.execute(defaultInput);

    expect(capturedTicket).not.toBeNull();
    expect(capturedTicket!.id).toBe('AEOS-1');
    expect(capturedTicket!.projectId).toBe('startup-a');
    expect(capturedTicket!.title).toBe('Add rate limiting');
    expect(capturedTicket!.column).toBe('BACKLOG');
    expect(capturedTicket!.subState).toBeNull();
    expect(capturedTicket!.createdAt).toBeTruthy();
    expect(capturedTicket!.updatedAt).toBeTruthy();
  });

  it('should commit with structured message', () => {
    useCase.execute(defaultInput);

    expect(gitGateway.commit).toHaveBeenCalledWith(
      path.join(defaultInput.projectPath, '.aeos'),
      '[AEOS-1][TICKET][v1][human][create]',
    );
  });

  it('should auto-increment ticket ID', () => {
    (ticketRepo.createAtomic as ReturnType<typeof vi.fn>).mockImplementation(
      (_pid: string, build: (n: number) => Ticket) => build(5),
    );

    const result = useCase.execute(defaultInput);

    expect(result.ticketId).toBe('AEOS-5');
  });

  it('should call operations in correct order', () => {
    const callOrder: string[] = [];
    (ticketRepo.createAtomic as ReturnType<typeof vi.fn>).mockImplementation(
      (_pid: string, build: (n: number) => Ticket) => {
        callOrder.push('createAtomic');
        return build(1);
      },
    );
    (artifactStore.writeArtifact as ReturnType<typeof vi.fn>).mockImplementation(() =>
      callOrder.push('writeArtifact'),
    );
    (gitGateway.commit as ReturnType<typeof vi.fn>).mockImplementation(() =>
      callOrder.push('commit'),
    );

    useCase.execute(defaultInput);

    expect(callOrder).toEqual(['createAtomic', 'writeArtifact', 'commit']);
  });

  it('should produce two distinct tickets when called twice', () => {
    let callCount = 0;
    (ticketRepo.createAtomic as ReturnType<typeof vi.fn>).mockImplementation(
      (_pid: string, build: (n: number) => Ticket) => {
        callCount++;
        return build(callCount);
      },
    );

    const r1 = useCase.execute(defaultInput);
    const r2 = useCase.execute({ ...defaultInput, title: 'Second ticket' });

    expect(r1.ticketId).toBe('AEOS-1');
    expect(r2.ticketId).toBe('AEOS-2');
    expect(artifactStore.writeArtifact).toHaveBeenCalledTimes(2);
    expect(ticketRepo.createAtomic).toHaveBeenCalledTimes(2);
  });
});
