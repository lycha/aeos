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
    findChildren: vi.fn().mockReturnValue([]),
    updateColumn: vi.fn(),
    updateSubState: vi.fn(),
    setEscalation: vi.fn(),
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

function createMockGitGateway(): GitGateway {
  return {
    init: vi.fn(),
    commit: vi.fn(),
    commitFiles: vi.fn(),
    diff: vi.fn().mockReturnValue(''),
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

    expect(result).toEqual({
      ticketId: 'AEOS-1',
      title: 'Add rate limiting',
      // No parent supplied, so this is a top-level epic.
      kind: 'EPIC',
      parentId: null,
      taskKey: null,
      alreadyExisted: false,
    });
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
    expect(content).toContain('## AEOS Metadata');
    expect(content).toContain('- Column: BACKLOG');
    expect(content).toContain('- Sub-state: NONE');
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

  describe('child tasks', () => {
    const epic = {
      id: 'AEOS-1',
      projectId: 'startup-a',
      title: 'Epic',
      kind: 'EPIC' as const,
      parentId: null,
      column: 'TASK_BREAKDOWN' as const,
      subState: 'WORKING' as const,
      createdAt: 'x',
      updatedAt: 'y',
    };

    it('creates a task under an epic', () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(epic);

      const result = useCase.execute({
        ...defaultInput,
        title: 'Hash passwords',
        parentId: 'AEOS-1',
      });

      expect(result).toMatchObject({
        kind: 'TASK',
        parentId: 'AEOS-1',
        alreadyExisted: false,
      });
    });

    it('rejects a task whose parent is another task (one level of nesting)', () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue({
        ...epic,
        id: 'AEOS-2',
        kind: 'TASK',
        parentId: 'AEOS-1',
      });

      expect(() =>
        useCase.execute({ ...defaultInput, title: 'Nested', parentId: 'AEOS-2' }),
      ).toThrow('tasks may only hang off an EPIC');
    });

    it('is idempotent — a matching child short-circuits without creating a duplicate', () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(epic);
      (ticketRepo.findChildren as ReturnType<typeof vi.fn>).mockReturnValue([
        {
          ...epic,
          id: 'AEOS-2',
          kind: 'TASK',
          parentId: 'AEOS-1',
          title: 'Hash passwords',
          column: 'IMPLEMENTATION',
        },
      ]);

      const result = useCase.execute({
        // Whitespace/case differences must still match — a retry rephrases nothing.
        ...defaultInput,
        title: '  hash passwords ',
        parentId: 'AEOS-1',
      });

      expect(result).toMatchObject({ ticketId: 'AEOS-2', alreadyExisted: true });
      // The whole point: no new row, no new artifact, no commit.
      expect(ticketRepo.createAtomic).not.toHaveBeenCalled();
      expect(artifactStore.writeArtifact).not.toHaveBeenCalled();
      expect(gitGateway.commit).not.toHaveBeenCalled();
    });

    it('creates a genuinely new task even when the epic has other children', () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(epic);
      (ticketRepo.findChildren as ReturnType<typeof vi.fn>).mockReturnValue([
        { ...epic, id: 'AEOS-2', kind: 'TASK', parentId: 'AEOS-1', title: 'Hash passwords' },
      ]);

      const result = useCase.execute({
        ...defaultInput,
        title: 'Add session middleware',
        parentId: 'AEOS-1',
      });

      expect(result.alreadyExisted).toBe(false);
      expect(ticketRepo.createAtomic).toHaveBeenCalledOnce();
    });

    it('matches on the task key, surviving a title rephrase on retry', () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(epic);
      (ticketRepo.findChildren as ReturnType<typeof vi.fn>).mockReturnValue([
        {
          ...epic,
          id: 'AEOS-2',
          kind: 'TASK',
          parentId: 'AEOS-1',
          title: 'Add password hashing',
          taskKey: 'T-001',
          column: 'IMPLEMENTATION',
        },
      ]);

      // A retry rephrases the title but keeps the key — must still match, which
      // title-based dedup would have missed and duplicated.
      const result = useCase.execute({
        ...defaultInput,
        title: 'Add password hashing to the login flow',
        parentId: 'AEOS-1',
        taskKey: 'T-001',
      });

      expect(result).toMatchObject({ ticketId: 'AEOS-2', alreadyExisted: true });
      expect(ticketRepo.createAtomic).not.toHaveBeenCalled();
    });

    it('persists the task key on a newly created task', () => {
      let built: import('../domain/model/ticket.js').Ticket | undefined;
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(epic);
      (ticketRepo.createAtomic as ReturnType<typeof vi.fn>).mockImplementation(
        (_projectId: string, build: (n: number) => import('../domain/model/ticket.js').Ticket) => {
          built = build(2);
          return built;
        },
      );

      const result = useCase.execute({
        ...defaultInput,
        title: 'Hash passwords',
        parentId: 'AEOS-1',
        taskKey: 'T-001',
      });

      expect(built?.taskKey).toBe('T-001');
      expect(result.taskKey).toBe('T-001');
    });

    it('bridges an unkeyed prior child: a keyed retry matches it by title, no duplicate', () => {
      // A pre-key attempt created the task title-only; the retry now supplies a
      // key. Without the keyless-title bridge, the keyed lookup would miss the
      // keyless child and duplicate.
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(epic);
      (ticketRepo.findChildren as ReturnType<typeof vi.fn>).mockReturnValue([
        {
          ...epic,
          id: 'AEOS-2',
          kind: 'TASK',
          parentId: 'AEOS-1',
          title: 'Hash passwords',
          taskKey: null,
        },
      ]);

      const result = useCase.execute({
        ...defaultInput,
        title: 'Hash passwords',
        parentId: 'AEOS-1',
        taskKey: 'T-001',
      });

      expect(result).toMatchObject({ ticketId: 'AEOS-2', alreadyExisted: true });
      expect(ticketRepo.createAtomic).not.toHaveBeenCalled();
    });

    it('the keyless bridge only matches keyless children, not a differently-keyed task', () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(epic);
      (ticketRepo.findChildren as ReturnType<typeof vi.fn>).mockReturnValue([
        // Same title, but already owns a different key — a distinct task.
        {
          ...epic,
          id: 'AEOS-2',
          kind: 'TASK',
          parentId: 'AEOS-1',
          title: 'Setup',
          taskKey: 'T-001',
        },
      ]);

      const result = useCase.execute({
        ...defaultInput,
        title: 'Setup',
        parentId: 'AEOS-1',
        taskKey: 'T-009',
      });

      expect(result.alreadyExisted).toBe(false);
      expect(ticketRepo.createAtomic).toHaveBeenCalledOnce();
    });

    it('does not store a stray key on an epic (no parent)', () => {
      let built: import('../domain/model/ticket.js').Ticket | undefined;
      (ticketRepo.createAtomic as ReturnType<typeof vi.fn>).mockImplementation(
        (_projectId: string, build: (n: number) => import('../domain/model/ticket.js').Ticket) => {
          built = build(1);
          return built;
        },
      );

      // --key with no --parent: the key is meaningless for an epic and must not persist.
      const result = useCase.execute({ ...defaultInput, taskKey: 'T-001' });

      expect(built?.taskKey).toBeNull();
      expect(result.taskKey).toBeNull();
    });

    it('a different key is a different task even with an identical title', () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(epic);
      (ticketRepo.findChildren as ReturnType<typeof vi.fn>).mockReturnValue([
        {
          ...epic,
          id: 'AEOS-2',
          kind: 'TASK',
          parentId: 'AEOS-1',
          title: 'Add endpoint',
          taskKey: 'T-001',
        },
      ]);

      const result = useCase.execute({
        ...defaultInput,
        title: 'Add endpoint',
        parentId: 'AEOS-1',
        taskKey: 'T-002',
      });

      expect(result.alreadyExisted).toBe(false);
      expect(ticketRepo.createAtomic).toHaveBeenCalledOnce();
    });
  });
});
