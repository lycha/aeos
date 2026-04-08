import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TicketRunUseCase } from './ticket-run.use-case.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { Executor } from '../domain/ports/driven/executor.port.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type { ColumnSpecLoader } from '../domain/ports/driven/column-spec-loader.port.js';
import type { AgentSpecLoader } from '../domain/ports/driven/agent-spec-loader.port.js';
import type { RubricLoader } from '../domain/ports/driven/rubric-loader.port.js';
import type { CostRepository } from '../domain/ports/driven/cost-repository.port.js';
import type { StateMachineService } from '../domain/services/state-machine.js';
import type { ContextAssembler } from './services/context-assembler.js';
import type { PreflightService } from './services/preflight.js';
import type { Ticket } from '../domain/model/ticket.js';
import type { ColumnSpec } from '../domain/model/column-spec.js';
import type { AgentSpec } from '../domain/model/agent-spec.js';
import type { AssembledContext } from '../domain/model/assembled-context.js';

// --- Mock factories ---

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
    readArtifact: vi.fn().mockReturnValue('ticket content'),
    getArtifactMtime: vi.fn().mockReturnValue(null),
    writeArtifact: vi.fn(),
    removeArtifact: vi.fn(),
    listArtifacts: vi.fn().mockReturnValue([]),
  };
}

function createMockGitGateway(): GitGateway {
  return { init: vi.fn(), commit: vi.fn(), commitFiles: vi.fn() };
}

function createMockStateMachine() {
  const mock: Pick<StateMachineService, 'transition' | 'setSubState'> = {
    transition: vi.fn().mockReturnValue({ ok: true }),
    setSubState: vi.fn().mockReturnValue({ ok: true }),
  };
  return mock as unknown as StateMachineService;
}

function createMockExecutor(): Executor {
  return {
    run: vi.fn().mockResolvedValue({
      ok: true,
      artifactPath: '/tmp/artifact',
      content: 'A '.repeat(60), // 60 words — passes min word count
    }),
    interrupt: vi.fn(),
  };
}

function createMockColumnSpecLoader(): ColumnSpecLoader {
  return { load: vi.fn().mockReturnValue(defaultColumnSpec()) };
}

function createMockAgentSpecLoader(): AgentSpecLoader {
  return { load: vi.fn().mockReturnValue(defaultAgentSpec()) };
}

function createMockRubricLoader(): RubricLoader {
  return { load: vi.fn().mockResolvedValue(null) };
}

function createMockContextAssembler(): ContextAssembler {
  return {
    assemble: vi.fn().mockResolvedValue(defaultContext()),
  } as unknown as ContextAssembler;
}

function createMockPreflight(): PreflightService {
  return {
    run: vi.fn().mockResolvedValue({ blocked: false }),
  } as unknown as PreflightService;
}

function createMockCostRepo(): CostRepository {
  return {
    record: vi.fn(),
    findByProject: vi.fn().mockReturnValue([]),
    findByTicket: vi.fn().mockReturnValue([]),
  };
}

function defaultColumnSpec(): ColumnSpec {
  return {
    column: 'IMPLEMENTATION',
    workerAgentFile: 'agents/worker.yaml',
    reviewerAgentFile: 'agents/reviewer.yaml',
    outputArtifact: 'impl.md',
    minWordCount: 50,
    requiredSections: [],
    reviewerRubrics: [],
    maxIterations: 3,
    escalation: 'escalate_to_human',
    advanceMode: 'manual',
    preflight: { enabled: true, questionsArtifact: 'questions.md' },
  };
}

function defaultAgentSpec(): AgentSpec {
  return {
    name: 'test-agent',
    systemPrompt: 'You are a test agent.',
    taskInstruction: 'Do the thing.',
    outputFormat: 'Markdown',
    selfVerificationChecklist: [],
    executor: { type: 'stub', timeoutSeconds: 300 },
  };
}

function defaultContext(): AssembledContext {
  return { ticketContent: 'ticket content', priorArtifacts: [], constraints: null };
}

function runnableTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: TICKET_ID,
    projectId: PROJECT_ID,
    title: 'Test ticket',
    column: 'IMPLEMENTATION' as Ticket['column'],
    subState: null,
    createdAt: '2025-01-01T09:00:00Z',
    updatedAt: '2025-01-01T09:00:00Z',
    ...overrides,
  };
}

const PROJECT_ID = 'startup-a';
const PROJECT_PATH = path.join(os.tmpdir(), 'aeos-test-project');
const TICKET_ID = 'AEOS-1';

// --- Test suite ---

describe('TicketRunUseCase', () => {
  let ticketRepo: ReturnType<typeof createMockTicketRepo>;
  let stateMachine: ReturnType<typeof createMockStateMachine>;
  let contextAssembler: ReturnType<typeof createMockContextAssembler>;
  let executor: ReturnType<typeof createMockExecutor>;
  let artifactStore: ReturnType<typeof createMockArtifactStore>;
  let gitGateway: ReturnType<typeof createMockGitGateway>;
  let columnSpecLoader: ReturnType<typeof createMockColumnSpecLoader>;
  let agentSpecLoader: ReturnType<typeof createMockAgentSpecLoader>;
  let rubricLoader: ReturnType<typeof createMockRubricLoader>;
  let preflight: ReturnType<typeof createMockPreflight>;
  let costRepo: ReturnType<typeof createMockCostRepo>;
  let buildPromptFn: (context: AssembledContext, agentSpec: AgentSpec) => string;
  let useCase: TicketRunUseCase;

  beforeEach(() => {
    ticketRepo = createMockTicketRepo();
    stateMachine = createMockStateMachine();
    contextAssembler = createMockContextAssembler();
    executor = createMockExecutor();
    artifactStore = createMockArtifactStore();
    gitGateway = createMockGitGateway();
    columnSpecLoader = createMockColumnSpecLoader();
    agentSpecLoader = createMockAgentSpecLoader();
    rubricLoader = createMockRubricLoader();
    preflight = createMockPreflight();
    costRepo = createMockCostRepo();
    buildPromptFn = vi.fn().mockReturnValue('assembled prompt') as unknown as (
      context: AssembledContext,
      agentSpec: AgentSpec,
    ) => string;

    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(runnableTicket());

    useCase = new TicketRunUseCase(
      ticketRepo,
      stateMachine,
      contextAssembler,
      buildPromptFn,
      executor,
      artifactStore,
      gitGateway,
      columnSpecLoader,
      agentSpecLoader,
      rubricLoader,
      preflight,
      costRepo,
    );
  });

  // --- Happy path ---

  it('should return success with artifact and review paths', async () => {
    const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.ticketId).toBe(TICKET_ID);
      expect(result.artifactPath).toContain('AEOS-1-impl.md');
      expect(result.reviewPath).toContain('AEOS-1-impl-review.md');
    }
  });

  it('should call preflight, executor, validation, commit, reviewer in order', async () => {
    await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(preflight.run).toHaveBeenCalledOnce();
    expect(stateMachine.setSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'WORKING');
    expect(executor.run).toHaveBeenCalledTimes(2); // worker + reviewer
    expect(artifactStore.writeArtifact).toHaveBeenCalledTimes(2); // worker artifact + review artifact
    expect(gitGateway.commitFiles).toHaveBeenCalledTimes(2);
  });

  it('should set sub-state to SIGNED_OFF on success', async () => {
    await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    const calls = (stateMachine.setSubState as ReturnType<typeof vi.fn>).mock.calls;
    const subStates = calls.map((c: unknown[]) => c[2]);
    expect(subStates).toContain('IN_REVIEW');
    expect(subStates).toContain('SIGNED_OFF');
  });

  // --- Guard clause: ticket not found ---

  it('should return failed when ticket not found', async () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(result).toEqual({
      status: 'failed',
      ticketId: TICKET_ID,
      error: `Ticket ${TICKET_ID} not found`,
    });
  });

  // --- Guard clause: invalid columns ---

  it.each(['BACKLOG', 'DONE'] as const)('should return failed for %s column', async (column) => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(runnableTicket({ column }));

    const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(result.status).toBe('failed');
  });

  it('should return failed for DOD_GATE column', async () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
      runnableTicket({ column: 'DOD_GATE' }),
    );

    const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(result).toEqual({
      status: 'failed',
      ticketId: TICKET_ID,
      error: 'DoD gate is human-only',
    });
  });

  // --- Guard clause: already WORKING ---

  it('should return failed when ticket is already WORKING', async () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
      runnableTicket({ subState: 'WORKING' }),
    );

    const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(result).toEqual({
      status: 'failed',
      ticketId: TICKET_ID,
      error: 'Ticket is already running',
    });
  });

  // --- Guard clause: BLOCKED ---

  it('should return blocked when ticket is BLOCKED', async () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
      runnableTicket({ subState: 'BLOCKED' }),
    );

    const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(result.status).toBe('blocked');
  });

  // --- Guard clause: READY proceeds to preflight ---

  it('should proceed to preflight when ticket is READY (set by approve)', async () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
      runnableTicket({ subState: 'READY' }),
    );

    const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(result.status).toBe('success');
    expect(preflight.run).toHaveBeenCalledOnce();
  });

  // --- Preflight blocked ---

  it('should return blocked when preflight blocks', async () => {
    (preflight.run as ReturnType<typeof vi.fn>).mockResolvedValue({
      blocked: true,
      questionsPath: 'AEOS-1-questions.md',
    });

    const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.blockers[0]).toContain('Preflight questions');
    }
  });

  // --- Executor failure ---

  it('should return failed and clean up on executor failure', async () => {
    (executor.run as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      reason: 'Model timeout',
    });

    const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.error).toContain('Executor failed');
    }
    expect(artifactStore.removeArtifact).toHaveBeenCalled();
    expect(stateMachine.setSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'FAILED');
  });

  // --- Validation failure ---

  it('should return failed and clean up on validation failure', async () => {
    // Content with 0 words triggers validation failure
    (executor.run as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      artifactPath: '/tmp/out',
      content: '',
    });

    const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.error).toContain('Output validation failed');
    }
    expect(artifactStore.removeArtifact).toHaveBeenCalled();
    expect(stateMachine.setSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'FAILED');
  });

  // --- Reviewer failure is best-effort ---

  it('should still succeed when reviewer fails', async () => {
    let callCount = 0;
    (executor.run as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { ok: true, artifactPath: '/tmp/out', content: 'A '.repeat(60) };
      }
      return { ok: false, reason: 'Reviewer timeout' };
    });

    const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(result.status).toBe('success');
    // Only worker artifact was written (reviewer failed)
    expect(artifactStore.writeArtifact).toHaveBeenCalledTimes(1);
  });

  // --- Invalid column value in column spec ---

  it('should return failed for invalid column value in columnSpec', async () => {
    (columnSpecLoader.load as ReturnType<typeof vi.fn>).mockReturnValue({
      ...defaultColumnSpec(),
      column: 'NOT_A_COLUMN',
    });

    const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(result).toEqual({
      status: 'failed',
      ticketId: TICKET_ID,
      error: 'Invalid column value: NOT_A_COLUMN',
    });
  });

  // --- Rubric loading through port ---

  it('should load rubrics through RubricLoader port', async () => {
    (columnSpecLoader.load as ReturnType<typeof vi.fn>).mockReturnValue({
      ...defaultColumnSpec(),
      reviewerRubrics: ['rubrics/quality.md', 'rubrics/style.md'],
    });
    (rubricLoader.load as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce('Quality rubric content')
      .mockResolvedValueOnce(null); // second rubric missing

    await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(rubricLoader.load).toHaveBeenCalledTimes(2);
    expect(rubricLoader.load).toHaveBeenCalledWith('rubrics/quality.md', PROJECT_PATH);
    expect(rubricLoader.load).toHaveBeenCalledWith('rubrics/style.md', PROJECT_PATH);
  });

  // --- Does not mutate context (m4) ---

  it('should not mutate assembled context when adding rubrics', async () => {
    const originalArtifacts = [{ name: 'existing.md', content: 'existing' }];
    const contextObj = { ...defaultContext(), priorArtifacts: [...originalArtifacts] };
    (contextAssembler.assemble as ReturnType<typeof vi.fn>).mockResolvedValue(contextObj);

    (columnSpecLoader.load as ReturnType<typeof vi.fn>).mockReturnValue({
      ...defaultColumnSpec(),
      reviewerRubrics: ['rubrics/quality.md'],
    });
    (rubricLoader.load as ReturnType<typeof vi.fn>).mockResolvedValue('Rubric content');

    await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    // Original context should not have been mutated
    expect(contextObj.priorArtifacts).toHaveLength(1);
    expect(contextObj.priorArtifacts[0].name).toBe('existing.md');
  });
});
