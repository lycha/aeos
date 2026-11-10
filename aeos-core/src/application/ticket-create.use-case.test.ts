import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TicketCreateUseCase } from './ticket-create.use-case.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type { Ticket } from '../domain/model/ticket.js';
import type { ArtefactTree } from '../domain/ports/driven/artefact-tree.port.js';
import type { DecisionsLint } from '../domain/ports/driven/decisions-lint.port.js';

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
    setPrUrl: vi.fn(),
    setSpecCommit: vi.fn(),
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

function createMockArtefactTree(): ArtefactTree {
  return {
    root: vi.fn().mockReturnValue('/project/.aeos'),
    featureDir: vi.fn().mockReturnValue('/project/.aeos/features/checkout'),
    exists: vi.fn().mockReturnValue(true),
    listFeatures: vi.fn().mockReturnValue(['checkout']),
  };
}

function createMockDecisionsLint(): DecisionsLint {
  return {
    missingFiles: vi.fn().mockReturnValue([]),
    lint: vi.fn().mockReturnValue({ schemaErrors: [], lintErrors: [], escalated: [] }),
  };
}

describe('TicketCreateUseCase', () => {
  let ticketRepo: ReturnType<typeof createMockTicketRepo>;
  let artifactStore: ReturnType<typeof createMockArtifactStore>;
  let gitGateway: ReturnType<typeof createMockGitGateway>;
  let artefactTree: ReturnType<typeof createMockArtefactTree>;
  let decisionsLint: ReturnType<typeof createMockDecisionsLint>;
  let useCase: TicketCreateUseCase;

  const defaultInput = {
    title: 'Add rate limiting',
    projectId: 'startup-a',
    projectKey: 'AEOS',
    projectPath: path.join(os.tmpdir(), 'aeos-test-project'),
  };
  // An epic is always spec-backed; `defaultInput` plus a parent is a task.
  const epicInput = { ...defaultInput, spec: 'checkout' };

  beforeEach(() => {
    ticketRepo = createMockTicketRepo();
    artifactStore = createMockArtifactStore();
    gitGateway = createMockGitGateway();
    artefactTree = createMockArtefactTree();
    decisionsLint = createMockDecisionsLint();
    useCase = new TicketCreateUseCase(
      ticketRepo,
      artifactStore,
      gitGateway,
      artefactTree,
      decisionsLint,
    );
  });

  describe('--spec', () => {
    const withSpec = { ...defaultInput, spec: 'checkout' };

    it('pins the epic to the HEAD commit of the artefact tree', () => {
      const result = useCase.execute(withSpec);

      const pin = { repo: 'AEOS-aeos', commit: 'c0ffee1', path: 'features/checkout' };
      expect(result.specPin).toEqual(pin);
      expect(gitGateway.headCommit).toHaveBeenCalledWith('/project/.aeos');
      const saved = (ticketRepo.createAtomic as ReturnType<typeof vi.fn>).mock.results[0]!
        .value as Ticket;
      expect(saved.specPin).toEqual(pin);
      expect(decisionsLint.lint).toHaveBeenCalledWith('/project/.aeos', 'checkout');
    });

    it('is refused together with --parent', () => {
      expect(() => useCase.execute({ ...withSpec, parentId: 'AEOS-9' })).toThrow(
        /--spec.*--parent/,
      );
      expect(ticketRepo.createAtomic).not.toHaveBeenCalled();
    });

    it('is refused for a feature name that is not a plain directory name', () => {
      expect(() => useCase.execute({ ...withSpec, spec: '../tickets' })).toThrow(/feature name/);
    });

    it('is refused when the feature directory does not exist', () => {
      (artefactTree.exists as ReturnType<typeof vi.fn>).mockReturnValue(false);

      expect(() => useCase.execute(withSpec)).toThrow(
        'Feature "checkout" not found: /project/.aeos/features/checkout does not exist.',
      );
    });

    it('is refused when spec.md or decisions.yaml is missing', () => {
      (decisionsLint.missingFiles as ReturnType<typeof vi.fn>).mockReturnValue(['spec.md']);

      expect(() => useCase.execute(withSpec)).toThrow('Feature "checkout" is missing spec.md.');
      expect(decisionsLint.lint).not.toHaveBeenCalled();
    });

    it("is refused with the validator's message when decisions.yaml fails the schema", () => {
      (decisionsLint.lint as ReturnType<typeof vi.fn>).mockReturnValue({
        schemaErrors: ["decisions.schema.json: meta: 'feature' is a required property"],
        lintErrors: ['ABS-2 (high) is unaddressed in decisions.yaml'],
        escalated: ['ABS-3'],
      });

      expect(() => useCase.execute(withSpec)).toThrow(
        'decisions.yaml of feature "checkout" does not match its schema: decisions.schema.json: meta: \'feature\' is a required property',
      );
    });

    it('is refused when lint_decisions.py reports an error', () => {
      (decisionsLint.lint as ReturnType<typeof vi.fn>).mockReturnValue({
        schemaErrors: [],
        lintErrors: ['ABS-2 (high) is unaddressed in decisions.yaml'],
        escalated: ['ABS-3'],
      });

      expect(() => useCase.execute(withSpec)).toThrow(
        /lint_decisions\.py.*ABS-2 \(high\) is unaddressed/s,
      );
    });

    it('is refused, naming the decision, when one is ESCALATED', () => {
      (decisionsLint.lint as ReturnType<typeof vi.fn>).mockReturnValue({
        schemaErrors: [],
        lintErrors: [],
        escalated: ['ABS-3', 'CON-1'],
      });

      expect(() => useCase.execute(withSpec)).toThrow(/ABS-3, CON-1/);
      expect(ticketRepo.createAtomic).not.toHaveBeenCalled();
    });

    it('is refused when the feature directory has uncommitted changes', () => {
      (gitGateway.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue([
        'tickets/AEOS-1/AEOS-1-ticket.md',
        'features/checkout/spec.md',
      ]);

      expect(() => useCase.execute(withSpec)).toThrow(
        /uncommitted changes.*features\/checkout\/spec\.md/s,
      );
      expect(gitGateway.changedFiles).toHaveBeenCalledWith('/project/.aeos');
    });

    it('ignores uncommitted changes outside the feature directory', () => {
      (gitGateway.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue([
        'features/checkout-v2/spec.md',
      ]);

      expect(useCase.execute(withSpec).specPin).toBeDefined();
    });

    it('lets a missing python3 surface as the error', () => {
      (decisionsLint.lint as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('python3 is not on PATH.');
      });

      expect(() => useCase.execute(withSpec)).toThrow('python3 is not on PATH.');
    });

    it('refuses an epic with no --spec, pointing at the skills that produce one', () => {
      expect(() => useCase.execute(defaultInput)).toThrow(
        /--spec[\s\S]*prototype-harvest[\s\S]*gap-interrogation[\s\S]*spec-writer/,
      );
      expect(ticketRepo.createAtomic).not.toHaveBeenCalled();
    });

    it('does not ask a task for a spec: it inherits the pin of its epic', () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue({
        id: 'AEOS-1',
        kind: 'EPIC',
      });

      expect(useCase.execute({ ...defaultInput, parentId: 'AEOS-1' }).kind).toBe('TASK');
    });
  });

  it('should return the generated ticket ID and title', () => {
    const result = useCase.execute(epicInput);

    expect(result).toEqual({
      ticketId: 'AEOS-1',
      title: 'Add rate limiting',
      // No parent supplied, so this is a top-level epic.
      kind: 'EPIC',
      parentId: null,
      taskKey: null,
      alreadyExisted: false,
      specPin: { repo: 'AEOS-aeos', commit: 'c0ffee1', path: 'features/checkout' },
    });
  });

  it('should call createAtomic with the project ID', () => {
    useCase.execute(epicInput);

    expect(ticketRepo.createAtomic).toHaveBeenCalledWith('startup-a', expect.any(Function));
  });

  it('should write artifact with correct filename and path', () => {
    useCase.execute(epicInput);

    expect(artifactStore.writeArtifact).toHaveBeenCalledWith(
      defaultInput.projectPath,
      'AEOS-1',
      'AEOS-1-ticket.md',
      expect.any(String),
    );
  });

  it('should generate ticket file with all four required sections', () => {
    useCase.execute(epicInput);

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

  it('writes the provided body into the ticket document', () => {
    useCase.execute({ ...epicInput, body: '**Acceptance criteria**\n- [ ] rate cap enforced' });

    const content = (artifactStore.writeArtifact as ReturnType<typeof vi.fn>).mock
      .calls[0][3] as string;

    expect(content).toContain('rate cap enforced');
    expect(content).not.toContain('Fill in the ticket description here');
  });

  it('should build ticket with column BACKLOG and null sub_state via createAtomic', () => {
    let capturedTicket: Ticket | null = null;
    (ticketRepo.createAtomic as ReturnType<typeof vi.fn>).mockImplementation(
      (_pid: string, build: (n: number) => Ticket) => {
        capturedTicket = build(1);
        return capturedTicket;
      },
    );

    useCase.execute(epicInput);

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
    useCase.execute(epicInput);

    expect(gitGateway.commit).toHaveBeenCalledWith(
      path.join(defaultInput.projectPath, '.aeos'),
      '[AEOS-1][TICKET][v1][human][create]',
    );
  });

  it('should auto-increment ticket ID', () => {
    (ticketRepo.createAtomic as ReturnType<typeof vi.fn>).mockImplementation(
      (_pid: string, build: (n: number) => Ticket) => build(5),
    );

    const result = useCase.execute(epicInput);

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

    useCase.execute(epicInput);

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

    const r1 = useCase.execute(epicInput);
    const r2 = useCase.execute({ ...epicInput, title: 'Second ticket' });

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

    it('stores the criteria the task claims, and writes them into its document', () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(epic);

      useCase.execute({
        ...defaultInput,
        title: 'Hash passwords',
        parentId: 'AEOS-1',
        implements: ['AC-1', 'AC-12a'],
      });

      const saved = (ticketRepo.createAtomic as ReturnType<typeof vi.fn>).mock.results[0]!
        .value as Ticket;
      expect(saved.implements).toEqual(['AC-1', 'AC-12a']);
      expect(artifactStore.writeArtifact).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.stringContaining('- Implements: AC-1, AC-12a'),
      );
    });

    it('refuses a claim that is not a criterion id', () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(epic);

      expect(() =>
        useCase.execute({ ...defaultInput, parentId: 'AEOS-1', implements: ['AC-1', 'ac2'] }),
      ).toThrow(/"ac2" is not a criterion id/);
      expect(ticketRepo.createAtomic).not.toHaveBeenCalled();
    });

    it('refuses --implements on an epic: a task claims criteria, an epic has a spec', () => {
      expect(() => useCase.execute({ ...epicInput, implements: ['AC-1'] })).toThrow(
        /--implements.*--parent/,
      );
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
      const result = useCase.execute({ ...epicInput, taskKey: 'T-001' });

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
