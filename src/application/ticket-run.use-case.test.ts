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
import type { ExecutorConfigResolver } from './services/executor-config-resolver.js';
import type { Ticket } from '../domain/model/ticket.js';
import type { ColumnSpec } from '../domain/model/column-spec.js';
import type { AgentSpec } from '../domain/model/agent-spec.js';
import type { AssembledContext } from '../domain/model/assembled-context.js';
import type { TicketRunEvent } from '../domain/model/ticket-run-event.js';

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
  return {
    init: vi.fn(),
    commit: vi.fn(),
    commitFiles: vi.fn(),
    diff: vi.fn().mockReturnValue('diff --git a/src/file.ts b/src/file.ts'),
  };
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

function createMockExecutorConfigResolver(): ExecutorConfigResolver {
  return {
    resolveExecutorConfig: vi.fn().mockReturnValue({
      executorType: 'claude-cli',
      model: 'claude-opus-4-6',
      timeoutMs: 300_000,
    }),
  } as unknown as ExecutorConfigResolver;
}

function defaultColumnSpec(): ColumnSpec {
  return {
    column: 'IMPLEMENTATION',
    phase: 'BUILD',
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

function defaultAgentSpec(overrides: Partial<AgentSpec> = {}): AgentSpec {
  return {
    name: 'test-agent',
    systemPrompt: 'You are a test agent.',
    taskInstruction: 'Do the thing.',
    outputFormat: 'Markdown',
    selfVerificationChecklist: [],
    executor: { type: 'stub', timeoutSeconds: 300 },
    ...overrides,
  };
}

function defaultContext(): AssembledContext {
  return {
    ticketContent: 'ticket content',
    settledDecisions: null,
    priorArtifacts: [],
    constraints: null,
    codeDiff: null,
  };
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
const TICKET_FILE_PATH = path.join(
  PROJECT_PATH,
  '.aeos',
  'tickets',
  TICKET_ID,
  `${TICKET_ID}-ticket.md`,
);

// --- Test suite ---

describe('TicketRunUseCase', () => {
  let ticketRepo: ReturnType<typeof createMockTicketRepo>;
  let stateMachine: ReturnType<typeof createMockStateMachine>;
  let contextAssembler: ReturnType<typeof createMockContextAssembler>;
  let executor: ReturnType<typeof createMockExecutor>;
  let createExecutorSpy: ReturnType<typeof vi.fn>;
  let createExecutor: (agentSpec: AgentSpec) => Executor;
  let artifactStore: ReturnType<typeof createMockArtifactStore>;
  let gitGateway: ReturnType<typeof createMockGitGateway>;
  let columnSpecLoader: ReturnType<typeof createMockColumnSpecLoader>;
  let agentSpecLoader: ReturnType<typeof createMockAgentSpecLoader>;
  let rubricLoader: ReturnType<typeof createMockRubricLoader>;
  let preflight: ReturnType<typeof createMockPreflight>;
  let costRepo: ReturnType<typeof createMockCostRepo>;
  let executorConfigResolver: ReturnType<typeof createMockExecutorConfigResolver>;
  let buildPromptFn: (context: AssembledContext, agentSpec: AgentSpec) => string;
  let useCase: TicketRunUseCase;

  beforeEach(() => {
    ticketRepo = createMockTicketRepo();
    stateMachine = createMockStateMachine();
    contextAssembler = createMockContextAssembler();
    executor = createMockExecutor();
    createExecutorSpy = vi.fn().mockReturnValue(executor);
    createExecutor = createExecutorSpy as unknown as (agentSpec: AgentSpec) => Executor;
    artifactStore = createMockArtifactStore();
    gitGateway = createMockGitGateway();
    columnSpecLoader = createMockColumnSpecLoader();
    agentSpecLoader = createMockAgentSpecLoader();
    rubricLoader = createMockRubricLoader();
    preflight = createMockPreflight();
    costRepo = createMockCostRepo();
    executorConfigResolver = createMockExecutorConfigResolver();
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
      createExecutor,
      artifactStore,
      gitGateway,
      columnSpecLoader,
      agentSpecLoader,
      rubricLoader,
      preflight,
      costRepo,
      executorConfigResolver,
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
    expect(createExecutorSpy).toHaveBeenCalledTimes(2);
    expect(contextAssembler.assemble).toHaveBeenCalledTimes(2);
    expect(stateMachine.setSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'WORKING');
    expect(executor.run).toHaveBeenCalledTimes(2); // worker + reviewer
    expect(artifactStore.writeArtifact).toHaveBeenCalledTimes(5); // 3 state mirrors + worker + review
    expect(gitGateway.commitFiles).toHaveBeenCalledTimes(5);
  });

  it('should pass assembled context and worker agent spec into preflight', async () => {
    await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(preflight.run).toHaveBeenCalledWith(
      TICKET_ID,
      PROJECT_ID,
      PROJECT_PATH,
      defaultContext(),
      defaultColumnSpec(),
      defaultAgentSpec(),
      executor,
      expect.any(Function),
    );
  });

  it('should emit ordered observer events and streamed chunks', async () => {
    const events: TicketRunEvent[] = [];

    (preflight.run as ReturnType<typeof vi.fn>).mockImplementation(async (...args: unknown[]) => {
      const onChunk = args[7] as ((stream: 'stdout' | 'stderr', chunk: string) => void) | undefined;
      onChunk?.('stdout', 'preflight ok\n');
      return { blocked: false };
    });

    let invocationCount = 0;
    (executor.run as ReturnType<typeof vi.fn>).mockImplementation(async (invocation) => {
      invocationCount += 1;
      if (invocationCount === 1) {
        invocation.onChunk?.('stdout', 'worker output\n');
        return { ok: true, artifactPath: '/tmp/out', content: 'A '.repeat(60) };
      }

      invocation.onChunk?.('stderr', 'review warning\n');
      return { ok: true, artifactPath: '/tmp/review', content: 'APPROVED' };
    });

    const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, undefined, {
      onEvent(event) {
        events.push(event);
      },
    });

    expect(result.status).toBe('success');
    expect(events[0]?.type).toBe('ticket-run.started');
    expect(events.at(-1)?.type).toBe('ticket-run.completed');
    expect(events.map((event) => event.sequence)).toEqual(
      Array.from({ length: events.length }, (_unused, index) => index + 1),
    );
    expect(
      events.some(
        (event) => event.type === 'executor.stdout.chunk' && event.payload.source === 'preflight',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) => event.type === 'executor.stdout.chunk' && event.payload.source === 'worker',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) => event.type === 'executor.stderr.chunk' && event.payload.source === 'reviewer',
      ),
    ).toBe(true);
  });

  it('should create executors from worker and reviewer agent specs', async () => {
    const workerSpec = defaultAgentSpec({
      name: 'worker-agent',
      executor: { type: 'stub', timeoutSeconds: 300 },
    });
    const reviewerSpec = defaultAgentSpec({
      name: 'reviewer-agent',
      executor: { type: 'stub', timeoutSeconds: 180 },
    });
    (agentSpecLoader.load as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(workerSpec)
      .mockReturnValueOnce(reviewerSpec);

    await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    // Expect resolved specs with ExecutorConfigResolver modifications
    const expectedWorkerSpec = {
      ...workerSpec,
      executor: {
        type: 'claude-cli',
        model: 'claude-opus-4-6',
        timeoutSeconds: 300,
      },
    };
    const expectedReviewerSpec = {
      ...reviewerSpec,
      executor: {
        type: 'claude-cli',
        model: 'claude-opus-4-6',
        timeoutSeconds: 300, // Based on the resolved config timeout converted back to seconds
      },
    };

    expect(createExecutorSpy).toHaveBeenNthCalledWith(1, expectedWorkerSpec);
    expect(createExecutorSpy).toHaveBeenNthCalledWith(2, expectedReviewerSpec);
  });

  it('should run IMPLEMENTATION worker in agentic mode and reviewer in artifact mode', async () => {
    await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(executor.run).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        prompt: 'assembled prompt',
        ticketId: TICKET_ID,
        column: 'IMPLEMENTATION',
        mode: 'agentic',
        workingDirectory: PROJECT_PATH,
        onChunk: expect.any(Function),
      }),
    );
    expect(executor.run).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        ticketId: TICKET_ID,
        column: 'IMPLEMENTATION',
        mode: 'artifact',
        onChunk: expect.any(Function),
      }),
    );
  });

  it('should keep non-IMPLEMENTATION worker runs in artifact mode by default', async () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
      runnableTicket({ column: 'PRODUCT_SCOPING' }),
    );
    (columnSpecLoader.load as ReturnType<typeof vi.fn>).mockReturnValue({
      ...defaultColumnSpec(),
      column: 'PRODUCT_SCOPING',
      phase: 'PLAN',
      outputArtifact: 'prd.md',
      executorMode: undefined,
    });

    await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(executor.run).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        column: 'PRODUCT_SCOPING',
        mode: 'artifact',
        workingDirectory: undefined,
        onChunk: expect.any(Function),
      }),
    );
  });

  it('should interrupt the active executor and return an interrupted failure', async () => {
    let resolveWorkerRun: ((value: Awaited<ReturnType<Executor['run']>>) => void) | undefined;

    (executor.run as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise((resolve: (value: Awaited<ReturnType<Executor['run']>>) => void) => {
          resolveWorkerRun = resolve;
        }),
    );

    const executePromise = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);
    await new Promise((resolve) => setImmediate(resolve));

    await useCase.interrupt();
    expect(executor.interrupt).toHaveBeenCalledOnce();

    resolveWorkerRun?.({ ok: false, reason: 'Execution interrupted by operator' });

    await expect(executePromise).resolves.toEqual({
      status: 'failed',
      ticketId: TICKET_ID,
      error: 'Execution interrupted by operator',
    });
  });

  it('should allow agentic IMPLEMENTATION runs when the resolved executor is auggie-cli', async () => {
    (executorConfigResolver.resolveExecutorConfig as ReturnType<typeof vi.fn>).mockReturnValue({
      executorType: 'auggie-cli',
      model: 'auggie-pro',
      timeoutMs: 300_000,
    });

    await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, {
      executorType: 'auggie-cli',
    });

    expect(preflight.run).toHaveBeenCalledOnce();
    expect(executor.run).toHaveBeenCalled();
  });

  it('should allow agentic IMPLEMENTATION runs when the resolved executor is opencode-cli', async () => {
    (executorConfigResolver.resolveExecutorConfig as ReturnType<typeof vi.fn>).mockReturnValue({
      executorType: 'opencode-cli',
      model: 'opencode/qwen2.5-coder',
      timeoutMs: 300_000,
    });

    await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, {
      executorType: 'opencode-cli',
    });

    expect(preflight.run).toHaveBeenCalledOnce();
    expect(executor.run).toHaveBeenCalled();
  });

  it('should fail early when an agentic IMPLEMENTATION run resolves to a non-agentic executor', async () => {
    (executorConfigResolver.resolveExecutorConfig as ReturnType<typeof vi.fn>).mockReturnValue({
      executorType: 'ollama-cli',
      model: 'llama3.2',
      timeoutMs: 300_000,
    });

    const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, {
      executorType: 'ollama-cli',
    });

    expect(result).toEqual({
      status: 'failed',
      ticketId: TICKET_ID,
      error:
        "Executor 'ollama-cli' does not support agentic IMPLEMENTATION runs. Use 'claude-cli', 'auggie-cli', 'opencode-cli', or omit --executor.",
    });
    expect(preflight.run).not.toHaveBeenCalled();
    expect(executor.run).not.toHaveBeenCalled();
  });

  it('should fail agentic IMPLEMENTATION runs when no repository changes were made', async () => {
    (gitGateway.diff as ReturnType<typeof vi.fn>).mockReturnValue('');

    const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(result).toEqual({
      status: 'failed',
      ticketId: TICKET_ID,
      error: 'Agentic implementation produced no repository changes',
    });
    expect(stateMachine.setSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'FAILED');
    expect(artifactStore.writeArtifact).not.toHaveBeenCalledWith(
      PROJECT_PATH,
      TICKET_ID,
      'AEOS-1-impl.md',
      expect.anything(),
    );
  });

  it('should reuse the first assembled context for the worker prompt', async () => {
    const firstContext = { ...defaultContext(), settledDecisions: '# AEOS Decisions' };
    const secondContext = {
      ...defaultContext(),
      priorArtifacts: [{ name: 'AEOS-1-impl.md', content: '...' }],
    };
    (contextAssembler.assemble as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(firstContext)
      .mockResolvedValueOnce(secondContext);

    await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(buildPromptFn).toHaveBeenNthCalledWith(1, firstContext, defaultAgentSpec());
  });

  it('should set sub-state to SIGNED_OFF on success', async () => {
    await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    const calls = (stateMachine.setSubState as ReturnType<typeof vi.fn>).mock.calls;
    const subStates = calls.map((c: unknown[]) => c[2]);
    expect(subStates).toContain('IN_REVIEW');
    expect(subStates).toContain('SIGNED_OFF');
  });

  it('should mirror WORKING, IN_REVIEW, and SIGNED_OFF into git history on success', async () => {
    await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(gitGateway.commitFiles).toHaveBeenNthCalledWith(
      1,
      path.join(PROJECT_PATH, '.aeos'),
      [TICKET_FILE_PATH],
      `[${TICKET_ID}][STATE][v1][sub-state: WORKING]`,
    );
    expect(gitGateway.commitFiles).toHaveBeenNthCalledWith(
      4,
      path.join(PROJECT_PATH, '.aeos'),
      [TICKET_FILE_PATH],
      `[${TICKET_ID}][STATE][v1][sub-state: IN_REVIEW]`,
    );
    expect(gitGateway.commitFiles).toHaveBeenNthCalledWith(
      5,
      path.join(PROJECT_PATH, '.aeos'),
      [TICKET_FILE_PATH],
      `[${TICKET_ID}][STATE][v1][sub-state: SIGNED_OFF]`,
    );
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
    expect(gitGateway.commitFiles).toHaveBeenCalledWith(
      path.join(PROJECT_PATH, '.aeos'),
      [
        path.join(PROJECT_PATH, '.aeos', 'tickets', TICKET_ID, 'AEOS-1-questions.md'),
        TICKET_FILE_PATH,
      ],
      `[${TICKET_ID}][QUESTIONS][v1][preflight][blocked]`,
    );
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
      expect(result.error).toContain('Worker executor failed in IMPLEMENTATION');
      expect(result.error).toContain('Model timeout');
    }
    expect(artifactStore.removeArtifact).toHaveBeenCalled();
    expect(stateMachine.setSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'FAILED');
    expect(gitGateway.commitFiles).toHaveBeenLastCalledWith(
      path.join(PROJECT_PATH, '.aeos'),
      [TICKET_FILE_PATH],
      `[${TICKET_ID}][STATE][v1][sub-state: FAILED]`,
    );
  });

  it('should surface timeout partial output from the worker executor', async () => {
    (executor.run as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      reason:
        'Executor timeout after 300s\n\nPartial stdout:\nThinking through architecture...\n\nPartial stderr: (no output captured)',
    });

    const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.error).toContain('Worker executor failed in IMPLEMENTATION');
      expect(result.error).toContain('Executor timeout after 300s');
      expect(result.error).toContain('Partial stdout');
      expect(result.error).toContain('Thinking through architecture');
    }
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
    expect(gitGateway.commitFiles).toHaveBeenLastCalledWith(
      path.join(PROJECT_PATH, '.aeos'),
      [TICKET_FILE_PATH],
      `[${TICKET_ID}][STATE][v1][sub-state: FAILED]`,
    );
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
    // WORKING + worker artifact + IN_REVIEW + SIGNED_OFF
    expect(artifactStore.writeArtifact).toHaveBeenCalledTimes(4);
  });

  it('should mirror FAILED when reviewer rejects the artifact', async () => {
    let callCount = 0;
    (executor.run as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { ok: true, artifactPath: '/tmp/out', content: 'A '.repeat(60) };
      }
      return {
        ok: true,
        artifactPath: '/tmp/review',
        content: 'REJECTED: missing acceptance criteria',
      };
    });

    const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(result.status).toBe('failed');
    expect(gitGateway.commitFiles).toHaveBeenLastCalledWith(
      path.join(PROJECT_PATH, '.aeos'),
      [TICKET_FILE_PATH],
      `[${TICKET_ID}][STATE][v1][sub-state: FAILED]`,
    );
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
