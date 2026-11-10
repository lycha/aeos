import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TicketApproveUseCase } from './ticket-approve.use-case.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type { StateMachineService } from '../domain/services/state-machine.js';
import type { Ticket } from '../domain/model/ticket.js';
import type { PullRequestGateway } from '../domain/ports/driven/pull-request-gateway.port.js';
import type { CostRepository } from '../domain/ports/driven/cost-repository.port.js';
import type { ColumnSpecLoader } from '../domain/ports/driven/column-spec-loader.port.js';
import type { ProjectRepository } from '../domain/ports/driven/project-repository.port.js';

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

/** The collaborators pull requests need, all saying yes by default. */
function createPullRequestMocks() {
  return {
    prGateway: {
      isAvailable: vi.fn().mockReturnValue({ ok: true }),
      create: vi.fn().mockReturnValue({ url: 'https://example.test/pull/7' }),
    } satisfies PullRequestGateway,
    costRepo: {
      record: vi.fn(),
      findByProject: vi.fn().mockReturnValue([]),
      findByTicket: vi.fn().mockReturnValue([]),
      findByFilters: vi.fn().mockReturnValue([]),
    } satisfies CostRepository,
    columnSpecLoader: {
      load: vi.fn((column: string) => ({
        outputArtifact:
          column === 'INTEGRATION_REVIEW' ? 'integration-review.md' : 'code-review.md',
      })),
    } as unknown as ColumnSpecLoader,
    projectRepo: {
      readExecutorConfig: vi.fn().mockReturnValue({}),
    } as unknown as ProjectRepository,
  };
}

const PROJECT_ID = 'startup-a';
const PROJECT_PATH = path.join(os.tmpdir(), 'aeos-test-project');
const TICKET_ID = 'AEOS-1';

function signedOffTicket(column: Ticket['column'] = 'PRODUCT_SCOPING'): Ticket {
  return {
    id: TICKET_ID,
    projectId: PROJECT_ID,
    title: 'Test ticket',
    kind: 'EPIC',
    parentId: null,
    column,
    subState: 'SIGNED_OFF',
    createdAt: '2025-01-01T09:00:00Z',
    updatedAt: '2025-01-01T10:00:00Z',
  };
}

describe('TicketApproveUseCase', () => {
  let ticketRepo: ReturnType<typeof createMockTicketRepo>;
  let artifactStore: ReturnType<typeof createMockArtifactStore>;
  let gitGateway: ReturnType<typeof createMockGitGateway>;
  let stateMachine: ReturnType<typeof createMockStateMachine>;
  let useCase: TicketApproveUseCase;

  beforeEach(() => {
    ticketRepo = createMockTicketRepo();
    artifactStore = createMockArtifactStore();
    gitGateway = createMockGitGateway();
    stateMachine = createMockStateMachine();
    const pr = createPullRequestMocks();
    useCase = new TicketApproveUseCase(
      ticketRepo,
      artifactStore,
      stateMachine,
      gitGateway,
      pr.prGateway,
      pr.costRepo,
      pr.columnSpecLoader,
      pr.projectRepo,
    );
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(signedOffTicket());
  });

  it('should advance a SIGNED_OFF ticket to the next column', () => {
    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);
    expect(result).toEqual({
      status: 'advanced',
      ticketId: TICKET_ID,
      fromColumn: 'PRODUCT_SCOPING',
      toColumn: 'TECH_SPEC',
    });
  });

  it('should call transition with the next column', () => {
    useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);
    expect(stateMachine.transition).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'TECH_SPEC');
  });

  it('should set sub-state to READY after advancing', () => {
    useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);
    expect(stateMachine.setSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'READY');
  });

  it('should mirror the new column and sub-state into the ticket document', () => {
    useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);
    expect(artifactStore.writeArtifact).toHaveBeenCalledWith(
      PROJECT_PATH,
      TICKET_ID,
      `${TICKET_ID}-ticket.md`,
      expect.stringContaining('- Column: TECH_SPEC'),
    );
    expect(artifactStore.writeArtifact).toHaveBeenCalledWith(
      PROJECT_PATH,
      TICKET_ID,
      `${TICKET_ID}-ticket.md`,
      expect.stringContaining('- Sub-state: READY'),
    );
  });

  it('should not commit the advance to git', () => {
    useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);
    // Column and sub-state are authoritative in SQLite; git carries artifacts.
    expect(gitGateway.commit).not.toHaveBeenCalled();
  });

  it('should return error when ticket is not found', () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);
    expect(result).toEqual({
      status: 'error',
      ticketId: TICKET_ID,
      error: `Ticket ${TICKET_ID} not found`,
    });
  });

  it('should return error when ticket sub-state is WORKING', () => {
    const ticket = signedOffTicket();
    ticket.subState = 'WORKING';
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(ticket);
    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);
    expect(result).toEqual({
      status: 'error',
      ticketId: TICKET_ID,
      error: `Ticket ${TICKET_ID} is not signed off (current state: WORKING). Run 'aeos ticket run ${TICKET_ID}' or 'aeos ticket sign-off ${TICKET_ID}' first.`,
    });
  });

  it('should allow advancing BACKLOG ticket with null sub-state (no sign-off needed)', () => {
    const ticket = signedOffTicket('BACKLOG');
    ticket.subState = null;
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(ticket);
    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);
    expect(result).toEqual({
      status: 'advanced',
      ticketId: TICKET_ID,
      fromColumn: 'BACKLOG',
      toColumn: 'PRODUCT_SCOPING',
    });
  });

  it('should return already_done when ticket is in DONE column', () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(signedOffTicket('DONE'));
    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);
    expect(result).toEqual({ status: 'already_done', ticketId: TICKET_ID });
  });

  it('should return error when transition fails', () => {
    (stateMachine.transition as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: false,
      reason: 'Cannot transition from PRODUCT_SCOPING to ARCH_SPIKE',
    });
    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);
    expect(result).toEqual({
      status: 'error',
      ticketId: TICKET_ID,
      error: 'Cannot transition from PRODUCT_SCOPING to ARCH_SPIKE',
    });
  });

  it('should advance BACKLOG ticket to PRODUCT_SCOPING', () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(signedOffTicket('BACKLOG'));
    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);
    expect(result).toEqual({
      status: 'advanced',
      ticketId: TICKET_ID,
      fromColumn: 'BACKLOG',
      toColumn: 'PRODUCT_SCOPING',
    });
  });

  it('should return error when setSubState fails', () => {
    (stateMachine.setSubState as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: false,
      reason: 'Cannot set sub-state on a BACKLOG ticket',
    });
    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);
    expect(result).toEqual({
      status: 'error',
      ticketId: TICKET_ID,
      error: 'Failed to set READY state: Cannot set sub-state on a BACKLOG ticket',
    });
  });

  // The git-commit rollback that used to live here is gone with the commit
  // itself: there is no longer a second write to fail after the transition.

  describe('epic join', () => {
    function epicInBreakdown(): Ticket {
      return { ...signedOffTicket('TASK_BREAKDOWN'), kind: 'EPIC' };
    }

    function child(id: string, column: Ticket['column']): Ticket {
      return { ...signedOffTicket(column), id, kind: 'TASK', parentId: TICKET_ID };
    }

    it('blocks an epic leaving TASK_BREAKDOWN while tasks are unfinished', () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(epicInBreakdown());
      (ticketRepo.findChildren as ReturnType<typeof vi.fn>).mockReturnValue([
        child('AEOS-2', 'DONE'),
        child('AEOS-3', 'CODE_REVIEW'),
      ]);

      const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result.status).toBe('error');
      if (result.status !== 'error') return;
      expect(result.error).toContain('1 unfinished task');
      expect(result.error).toContain('AEOS-3 (CODE_REVIEW)');
      expect(stateMachine.transition).not.toHaveBeenCalled();
    });

    it('advances the epic to INTEGRATION_REVIEW once every task is DONE', () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(epicInBreakdown());
      (ticketRepo.findChildren as ReturnType<typeof vi.fn>).mockReturnValue([
        child('AEOS-2', 'DONE'),
        child('AEOS-3', 'DONE'),
      ]);

      const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result).toMatchObject({ status: 'advanced', toColumn: 'INTEGRATION_REVIEW' });
    });

    it('advances an epic that decomposed into no tasks', () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(epicInBreakdown());
      (ticketRepo.findChildren as ReturnType<typeof vi.fn>).mockReturnValue([]);

      expect(useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID)).toMatchObject({
        status: 'advanced',
        toColumn: 'INTEGRATION_REVIEW',
      });
    });

    it('routes a task through the build pipeline, not the epic one', () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue({
        ...signedOffTicket('IMPLEMENTATION'),
        kind: 'TASK',
        parentId: 'AEOS-1',
      });

      // A task in IMPLEMENTATION goes to CODE_REVIEW — it never visits
      // PRODUCT_SCOPING, TECH_SPEC, or TASK_BREAKDOWN.
      expect(useCase.execute(PROJECT_ID, PROJECT_PATH, 'AEOS-2')).toMatchObject({
        status: 'advanced',
        toColumn: 'CODE_REVIEW',
      });
    });
  });
});

describe('TicketApproveUseCase — per-task commit', () => {
  let ticketRepo: ReturnType<typeof createMockTicketRepo>;
  let artifactStore: ReturnType<typeof createMockArtifactStore>;
  let gitGateway: ReturnType<typeof createMockGitGateway>;
  let stateMachine: ReturnType<typeof createMockStateMachine>;
  let useCase: TicketApproveUseCase;

  function task(column: Ticket['column']): Ticket {
    return { ...signedOffTicket(column), kind: 'TASK', parentId: 'AEOS-9' };
  }

  beforeEach(() => {
    ticketRepo = createMockTicketRepo();
    artifactStore = createMockArtifactStore();
    gitGateway = createMockGitGateway();
    stateMachine = createMockStateMachine();
    const pr = createPullRequestMocks();
    useCase = new TicketApproveUseCase(
      ticketRepo,
      artifactStore,
      stateMachine,
      gitGateway,
      pr.prGateway,
      pr.costRepo,
      pr.columnSpecLoader,
      pr.projectRepo,
    );
  });

  it('commits the source repo when a TASK reaches DONE', () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(task('QA'));

    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(result).toMatchObject({ status: 'advanced', toColumn: 'DONE' });
    expect(gitGateway.commitAll).toHaveBeenCalledWith(
      PROJECT_PATH,
      '[AEOS-1] Test ticket\n\nTicket: AEOS-1\nEpic: AEOS-9',
    );
  });

  it("adds a Spec trailer from the parent epic's pin", () => {
    const epic = {
      ...signedOffTicket('TASK_BREAKDOWN'),
      id: 'AEOS-9',
      specPin: { repo: 'AEOS-aeos', commit: 'c0ffee1', path: 'features/checkout' },
    };
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockImplementation(
      (_project: string, id: string) => (id === 'AEOS-9' ? epic : task('QA')),
    );

    useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(gitGateway.commitAll).toHaveBeenCalledWith(
      PROJECT_PATH,
      '[AEOS-1] Test ticket\n\nTicket: AEOS-1\nEpic: AEOS-9\nSpec: AEOS-aeos@c0ffee1',
    );
  });

  it('does not commit on a mid-pipeline advance — CODE_REVIEW still needs the diff', () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(task('IMPLEMENTATION'));

    useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(gitGateway.commitAll).not.toHaveBeenCalled();
  });

  it('does not commit for an epic — epics produce artifacts, not code', () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(signedOffTicket('DOD_GATE'));

    useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(gitGateway.commitAll).not.toHaveBeenCalled();
  });
});

describe('TicketApproveUseCase — pull requests', () => {
  let ticketRepo: ReturnType<typeof createMockTicketRepo>;
  let artifactStore: ReturnType<typeof createMockArtifactStore>;
  let gitGateway: ReturnType<typeof createMockGitGateway>;
  let stateMachine: ReturnType<typeof createMockStateMachine>;
  let pr: ReturnType<typeof createPullRequestMocks>;
  let useCase: TicketApproveUseCase;

  const order = (mock: unknown): number =>
    (mock as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
  const approving = (ticket: Ticket): void => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(ticket);
  };
  const epicAtIntegrationReview = (): Ticket => signedOffTicket('INTEGRATION_REVIEW');
  const standaloneTaskAtQa = (): Ticket => ({ ...signedOffTicket('QA'), kind: 'TASK' });

  beforeEach(() => {
    ticketRepo = createMockTicketRepo();
    artifactStore = createMockArtifactStore();
    gitGateway = createMockGitGateway();
    stateMachine = createMockStateMachine();
    pr = createPullRequestMocks();
    useCase = new TicketApproveUseCase(
      ticketRepo,
      artifactStore,
      stateMachine,
      gitGateway,
      pr.prGateway,
      pr.costRepo,
      pr.columnSpecLoader,
      pr.projectRepo,
    );
  });

  it('pushes the epic branch, opens the pull request and stores its URL when an epic leaves INTEGRATION_REVIEW', () => {
    approving(epicAtIntegrationReview());

    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(result).toMatchObject({ status: 'advanced', toColumn: 'DOD_GATE' });
    expect(gitGateway.push).toHaveBeenCalledWith(PROJECT_PATH, 'aeos/AEOS-1');
    expect(pr.prGateway.create).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: PROJECT_PATH,
        base: 'main',
        head: 'aeos/AEOS-1',
        title: '[AEOS-1] Test ticket',
      }),
    );
    expect(ticketRepo.setPrUrl).toHaveBeenCalledWith(
      PROJECT_ID,
      TICKET_ID,
      'https://example.test/pull/7',
    );
    expect(order(gitGateway.push)).toBeLessThan(order(pr.prGateway.create));
    expect(order(pr.prGateway.create)).toBeLessThan(order(stateMachine.transition));
  });

  it('builds the body from the review, the checks table and the recorded costs', () => {
    approving(epicAtIntegrationReview());
    (ticketRepo.findChildren as ReturnType<typeof vi.fn>).mockReturnValue([
      { ...signedOffTicket('DONE'), id: 'AEOS-2', kind: 'TASK', parentId: TICKET_ID },
    ]);
    (pr.costRepo.findByTicket as ReturnType<typeof vi.fn>).mockImplementation(
      (_project: string, ticketId: string) =>
        ticketId === TICKET_ID ? [{ costUsd: 1 }, { costUsd: null }] : [{ costUsd: 0.5 }],
    );
    (artifactStore.artifactExists as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockImplementation(
      (_path: string, _ticket: string, name: string) =>
        name.endsWith('-checks.md')
          ? '# Checks\n\n| Check | Result | Duration |\n| --- | --- | --- |\n| test | passed | 1.0s |\n\n<!-- AEOS-RUN: RUN-1 -->\n'
          : 'Looks right.\n\n<!-- AEOS-VERDICT\nverdict: APPROVED_WITH_WARNINGS\nblockers: 0\nwarnings: 2\ninfo: 0\n-->\n',
    );

    useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    const { body } = (pr.prGateway.create as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      body: string;
    };
    expect(body).toContain(
      'Integration review: `.aeos/tickets/AEOS-1/AEOS-1-integration-review.md` (APPROVED_WITH_WARNINGS, 0 blockers, 2 warnings)',
    );
    expect(body).toContain('| test | passed | 1.0s |');
    expect(body).not.toContain('AEOS-RUN');
    // 1 (epic) + 0.5 (child); the epic's unknown run is counted, not summed.
    expect(body).toContain('Total cost: $1.5000 (1 run with unknown cost not included)');
  });

  it('names the pinned spec in the body of a spec-backed epic', () => {
    approving({
      ...epicAtIntegrationReview(),
      specPin: { repo: 'AEOS-aeos', commit: 'c0ffee1', path: 'features/checkout' },
    });

    useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    const { body } = (pr.prGateway.create as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      body: string;
    };
    expect(body).toContain(
      '<!-- aeos:spec-pin -->\nSpec: `AEOS-aeos@c0ffee1`, `features/checkout`',
    );
    expect(body).not.toContain('Spec pin: not recorded yet');
  });

  it('opens the pull request without pushing when the repository has no remote', () => {
    approving(epicAtIntegrationReview());
    (gitGateway.hasRemote as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(result.status).toBe('advanced');
    expect(gitGateway.push).not.toHaveBeenCalled();
    expect(pr.prGateway.create).toHaveBeenCalled();
  });

  it('stops with the cause and leaves the ticket SIGNED_OFF when gh is not on PATH', () => {
    approving(epicAtIntegrationReview());
    pr.prGateway.isAvailable.mockReturnValue({
      ok: false,
      reason: 'the `gh` command is not on PATH. Install the GitHub CLI.',
    });

    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(result.status).toBe('error');
    const { error } = result as { error: string };
    expect(error).toContain('`gh` command is not on PATH');
    expect(error).toContain('SIGNED_OFF');
    expect(error).toContain('aeos ticket approve AEOS-1');
    expect(gitGateway.push).not.toHaveBeenCalled();
    expect(pr.prGateway.create).not.toHaveBeenCalled();
    expect(stateMachine.transition).not.toHaveBeenCalled();
    expect(stateMachine.setSubState).not.toHaveBeenCalled();
  });

  it.each([
    [
      'the push',
      (): void =>
        void (gitGateway.push as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error('remote rejected');
        }),
    ],
    [
      'the pull request',
      (): void =>
        void pr.prGateway.create.mockImplementation(() => {
          throw new Error('remote rejected');
        }),
    ],
  ])('stops the same way when %s is refused', (_what, refuse) => {
    approving(epicAtIntegrationReview());
    refuse();

    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(result).toMatchObject({ status: 'error' });
    expect((result as { error: string }).error).toContain('remote rejected');
    expect(stateMachine.transition).not.toHaveBeenCalled();
    expect(ticketRepo.setPrUrl).not.toHaveBeenCalled();
  });

  it('neither pushes nor opens a pull request when pullRequests.enabled is false', () => {
    approving(epicAtIntegrationReview());
    (pr.projectRepo.readExecutorConfig as ReturnType<typeof vi.fn>).mockReturnValue({
      pullRequests: { enabled: false },
    });
    pr.prGateway.isAvailable.mockReturnValue({ ok: false, reason: 'no gh' });

    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(result).toMatchObject({ status: 'advanced', toColumn: 'DOD_GATE' });
    expect(pr.prGateway.isAvailable).not.toHaveBeenCalled();
    expect(gitGateway.push).not.toHaveBeenCalled();
    expect(pr.prGateway.create).not.toHaveBeenCalled();
  });

  it('opens the pull request for a standalone task approved to DONE, after its commit', () => {
    approving(standaloneTaskAtQa());

    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(result).toMatchObject({ status: 'advanced', toColumn: 'DONE' });
    expect(gitGateway.commitAll).toHaveBeenCalledWith(
      PROJECT_PATH,
      '[AEOS-1] Test ticket\n\nTicket: AEOS-1',
    );
    expect(order(gitGateway.commitAll)).toBeLessThan(order(gitGateway.push));
    expect(pr.prGateway.create).toHaveBeenCalledWith(
      expect.objectContaining({ head: 'aeos/AEOS-1', base: 'main' }),
    );
    const { body } = pr.prGateway.create.mock.calls[0]![0] as { body: string };
    expect(body).toContain('Code review:');
  });

  it('opens no pull request for a child task, or for an epic leaving any other column', () => {
    approving({ ...standaloneTaskAtQa(), parentId: 'AEOS-9' });
    useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);
    approving(signedOffTicket('TECH_SPEC'));
    useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(pr.prGateway.create).not.toHaveBeenCalled();
    expect(gitGateway.push).not.toHaveBeenCalled();
  });
});
