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
import type { ConfigStore } from '../domain/ports/driven/config-store.port.js';
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
    findChildren: vi.fn().mockReturnValue([]),
    updateColumn: vi.fn(),
    updateSubState: vi.fn(),
    setEscalation: vi.fn(),
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
      // One stub serves both roles: 60 words clears the worker's min word
      // count, and the trailer parses as an approval when read as a review.
      content: `${'A '.repeat(60)}\n\n<!-- AEOS-VERDICT\nverdict: APPROVED\nblockers: 0\nwarnings: 0\ninfo: 0\n-->`,
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

function createMockConfigStore(
  reviewLoop: { enabled: boolean; maxIterations: number } = { enabled: true, maxIterations: 5 },
): ConfigStore {
  return {
    ensureHomeDir: vi.fn(),
    readConfig: vi.fn().mockReturnValue({
      model: 'claude-opus-4-8',
      currency: 'USD',
      advanceMode: 'manual',
      reviewLoop,
    }),
    writeConfigIfNotExists: vi.fn(),
    readRegistry: vi.fn().mockReturnValue([]),
    writeRegistry: vi.fn(),
    writeRegistryIfNotExists: vi.fn(),
    ensureGlobalGitignore: vi.fn(),
  } as unknown as ConfigStore;
}

/**
 * Builds a review artifact carrying a parseable verdict trailer.
 * Reviews without one are treated as unparseable by design — see verdict-parser.
 */
function reviewWith(
  verdict: 'APPROVED' | 'APPROVED_WITH_WARNINGS' | 'REJECTED',
  options: { blockers?: number; topics?: string[]; prose?: string } = {},
): string {
  const blockers = options.blockers ?? (verdict === 'REJECTED' ? 1 : 0);
  const topics = options.topics ?? (verdict === 'REJECTED' ? ['unmet-criterion'] : []);
  const lines = [
    options.prose ?? '## Review\n\nEvaluated against the rubrics.',
    '',
    '<!-- AEOS-VERDICT',
    `verdict: ${verdict}`,
    `blockers: ${blockers}`,
    'warnings: 0',
    'info: 0',
  ];
  if (topics.length > 0) lines.push(`blocker-topics: ${topics.join(', ')}`);
  lines.push('-->');
  return lines.join('\n');
}

function defaultColumnSpec(overrides: Partial<ColumnSpec> = {}): ColumnSpec {
  return {
    ...baseColumnSpec(),
    ...overrides,
  };
}

function baseColumnSpec(): ColumnSpec {
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
    kind: 'EPIC',
    parentId: null,
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
  let configStore: ConfigStore;
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
    configStore = createMockConfigStore();
    buildPromptFn = vi.fn().mockReturnValue('assembled prompt') as unknown as (
      context: AssembledContext,
      agentSpec: AgentSpec,
    ) => string;

    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(runnableTicket());

    useCase = buildUseCase();
  });

  /** Rebuilds the use case against the current mocks — used by tests that
   *  swap in a different config store or column spec before executing. */
  function buildUseCase(): TicketRunUseCase {
    return new TicketRunUseCase(
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
      configStore,
    );
  }

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
    // Artifacts only. The 3 state mirrors still sync to disk, but git carries
    // just the worker artifact and the review.
    expect(gitGateway.commitFiles).toHaveBeenCalledTimes(2);
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
      return { ok: true, artifactPath: '/tmp/review', content: reviewWith('APPROVED') };
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

  it('skips the repo-diff check for an agentic column that opts out', async () => {
    // TASK_BREAKDOWN is agentic (it calls the CLI to create tasks) but its work
    // is not a repo edit, so requiresRepoDiff:false must let a no-diff run pass.
    (columnSpecLoader.load as ReturnType<typeof vi.fn>).mockReturnValue(
      defaultColumnSpec({ executorMode: 'agentic', requiresRepoDiff: false }),
    );
    (gitGateway.diff as ReturnType<typeof vi.fn>).mockReturnValue('');

    const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(result.status).toBe('success');
  });

  it('still enforces the repo-diff check for a default agentic column', async () => {
    // Undefined requiresRepoDiff must behave as true — IMPLEMENTATION's guarantee.
    (columnSpecLoader.load as ReturnType<typeof vi.fn>).mockReturnValue(
      defaultColumnSpec({ executorMode: 'agentic' }),
    );
    (gitGateway.diff as ReturnType<typeof vi.fn>).mockReturnValue('');

    const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.error).toContain('no repository changes');
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

  it('should sync sub-state to disk without committing it to git', async () => {
    await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    // Every transition is mirrored into the ticket markdown on disk...
    const mirroredStates = (
      artifactStore.writeArtifact as ReturnType<typeof vi.fn>
    ).mock.calls.filter((call) => String(call[2]).endsWith('-ticket.md'));
    expect(mirroredStates.length).toBe(3); // WORKING, IN_REVIEW, SIGNED_OFF

    // ...but SQLite is authoritative for state, so none of it reaches git.
    const commitMessages = (gitGateway.commitFiles as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => String(call[2]),
    );
    expect(commitMessages.some((message) => message.includes('[STATE]'))).toBe(false);
    expect(commitMessages).toEqual([
      `[${TICKET_ID}][impl.md][v1][test-agent][create]`,
      `[${TICKET_ID}][REVIEW][v1][test-agent][create]`,
    ]);
  });

  // --- Revision loop ---

  describe('revision loop', () => {
    /**
     * Drives the reviewer through a scripted list of verdicts, one per review
     * call. Worker calls always return a valid artifact.
     */
    function scriptReviews(verdicts: string[]): void {
      let reviewIndex = 0;
      (executor.run as ReturnType<typeof vi.fn>).mockImplementation(
        async (invocation: { outputPath: string }) => {
          if (!invocation.outputPath.includes('-review.md')) {
            return { ok: true, artifactPath: invocation.outputPath, content: 'A '.repeat(60) };
          }
          const content = verdicts[Math.min(reviewIndex, verdicts.length - 1)];
          reviewIndex += 1;
          return { ok: true, artifactPath: invocation.outputPath, content };
        },
      );
    }

    it('retries after a rejection and succeeds once the reviewer approves', async () => {
      scriptReviews([
        reviewWith('REJECTED', { topics: ['missing-error-handling'] }),
        reviewWith('APPROVED'),
      ]);

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.attempts).toBe(2);
      }
      expect(stateMachine.setSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'SIGNED_OFF');
    });

    it('feeds the previous review back to the worker on retry', async () => {
      const firstReview = reviewWith('REJECTED', {
        topics: ['missing-error-handling'],
        prose: '## Review\n\nThe rollback path is undefined.',
      });
      scriptReviews([firstReview, reviewWith('APPROVED')]);

      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      // Prompts are built worker-then-reviewer per attempt, so calls 0 and 2
      // are the two worker prompts.
      const promptCalls = (buildPromptFn as ReturnType<typeof vi.fn>).mock.calls;
      const firstWorkerContext = promptCalls[0][0] as AssembledContext;
      const retryWorkerContext = promptCalls[2][0] as AssembledContext;

      // First attempt has nothing to revise against...
      expect(firstWorkerContext.priorArtifacts.some((a) => a.name === 'previous-review.md')).toBe(
        false,
      );

      // ...the retry carries the review so the worker revises rather than
      // regenerating blind.
      const retryFeedback = retryWorkerContext.priorArtifacts.find(
        (a) => a.name === 'previous-review.md',
      );
      expect(retryFeedback?.content).toContain('The rollback path is undefined.');
    });

    it('re-assembles context on retry so the worker sees the artifact it must revise', async () => {
      scriptReviews([
        reviewWith('REJECTED', { topics: ['missing-error-handling'] }),
        reviewWith('APPROVED'),
      ]);

      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      // Attempt 1 worker, attempt 1 reviewer, attempt 2 worker, attempt 2 reviewer.
      // A stale pre-run snapshot would not contain the artifact under review.
      expect(contextAssembler.assemble).toHaveBeenCalledTimes(4);
    });

    it('does not hand the worker the same review twice on retry', async () => {
      (contextAssembler.assemble as ReturnType<typeof vi.fn>).mockResolvedValue({
        ticketContent: 'ticket',
        settledDecisions: null,
        constraints: null,
        codeDiff: null,
        // The reviewer artifact is on disk by the time a retry assembles context.
        priorArtifacts: [{ name: 'AEOS-1-impl-review.md', content: 'stale review copy' }],
      });
      scriptReviews([reviewWith('REJECTED', { topics: ['alpha'] }), reviewWith('APPROVED')]);

      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      const retryWorkerContext = (buildPromptFn as ReturnType<typeof vi.fn>).mock
        .calls[2][0] as AssembledContext;
      const reviewCopies = retryWorkerContext.priorArtifacts.filter((a) =>
        a.name.includes('review'),
      );

      expect(reviewCopies).toHaveLength(1);
      expect(reviewCopies[0].name).toBe('previous-review.md');
    });

    it('escalates once the iteration cap is exhausted', async () => {
      configStore = createMockConfigStore({ enabled: true, maxIterations: 3 });
      useCase = buildUseCase();
      // Distinct topics each round so convergence detection does not fire first.
      scriptReviews([
        reviewWith('REJECTED', { topics: ['alpha'] }),
        reviewWith('REJECTED', { topics: ['beta'] }),
        reviewWith('REJECTED', { topics: ['gamma'] }),
      ]);

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result.status).toBe('escalated');
      if (result.status === 'escalated') {
        expect(result.reason).toBe('ITERATIONS_EXHAUSTED');
        expect(result.attempts).toBe(3);
      }
      expect(stateMachine.setSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'ESCALATED');
    });

    it('escalates on the first rejection when the loop is disabled', async () => {
      configStore = createMockConfigStore({ enabled: false, maxIterations: 5 });
      useCase = buildUseCase();
      scriptReviews([reviewWith('REJECTED', { topics: ['alpha'] })]);

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result.status).toBe('escalated');
      if (result.status === 'escalated') {
        expect(result.attempts).toBe(1);
      }
      // Exactly one worker run and one review — no revision was attempted.
      expect(executor.run).toHaveBeenCalledTimes(2);
    });

    it('advances on APPROVED_WITH_WARNINGS without consuming a retry', async () => {
      scriptReviews([reviewWith('APPROVED_WITH_WARNINGS')]);

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.attempts).toBe(1);
      }
    });

    it('escalates when the reviewer emits no parseable verdict', async () => {
      scriptReviews(['## Review\n\nLooks good to me, ship it.']);

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      // Silently treating this as approval would ship unreviewed work.
      expect(result.status).toBe('escalated');
      if (result.status === 'escalated') {
        expect(result.reason).toBe('UNPARSEABLE_VERDICT');
      }
    });

    it('honours a column-level cap over the global one', async () => {
      configStore = createMockConfigStore({ enabled: true, maxIterations: 5 });
      (columnSpecLoader.load as ReturnType<typeof vi.fn>).mockReturnValue(
        defaultColumnSpec({ maxIterations: 2 }),
      );
      useCase = buildUseCase();
      scriptReviews([
        reviewWith('REJECTED', { topics: ['alpha'] }),
        reviewWith('REJECTED', { topics: ['beta'] }),
      ]);

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result.status).toBe('escalated');
      if (result.status === 'escalated') {
        expect(result.attempts).toBe(2);
      }
    });
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

  it('should escalate when preflight raises blockers', async () => {
    (preflight.run as ReturnType<typeof vi.fn>).mockResolvedValue({
      blocked: true,
      questionsPath: 'AEOS-1-questions.md',
    });

    const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    // Preflight blockers route through the same escalation path as iteration
    // exhaustion, so an operator has one place to look for stalled runs.
    expect(result.status).toBe('escalated');
    if (result.status === 'escalated') {
      expect(result.reason).toBe('PREFLIGHT_BLOCKERS');
      expect(result.message).toContain('aeos ticket answer');
    }
    // Stays BLOCKED, not ESCALATED: `aeos ticket answer` gates on BLOCKED, and
    // the message above tells the operator to run exactly that command.
    expect(stateMachine.setSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'BLOCKED');
    expect(stateMachine.setSubState).not.toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'ESCALATED');
    expect(gitGateway.commitFiles).toHaveBeenCalledWith(
      path.join(PROJECT_PATH, '.aeos'),
      [path.join(PROJECT_PATH, '.aeos', 'tickets', TICKET_ID, 'AEOS-1-questions.md')],
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
    // FAILED is recorded in SQLite and mirrored to disk, never committed.
    expect(
      (gitGateway.commitFiles as ReturnType<typeof vi.fn>).mock.calls.some((call) =>
        String(call[2]).includes('[STATE]'),
      ),
    ).toBe(false);
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
    // FAILED is recorded in SQLite and mirrored to disk, never committed.
    expect(
      (gitGateway.commitFiles as ReturnType<typeof vi.fn>).mock.calls.some((call) =>
        String(call[2]).includes('[STATE]'),
      ),
    ).toBe(false);
  });

  // --- Reviewer failure is best-effort ---

  it('should escalate rather than advance when the reviewer cannot run', async () => {
    let callCount = 0;
    (executor.run as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { ok: true, artifactPath: '/tmp/out', content: 'A '.repeat(60) };
      }
      return { ok: false, reason: 'Reviewer timeout' };
    });

    const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    // A reviewer that never ran leaves the artifact unreviewed. Advancing it
    // would ship unreviewed work under autonomy, so this stops for a human.
    expect(result.status).toBe('escalated');
    if (result.status === 'escalated') {
      expect(result.reason).toBe('UNPARSEABLE_VERDICT');
      expect(result.message).toContain('Reviewer timeout');
    }
    expect(stateMachine.setSubState).not.toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'SIGNED_OFF');
  });

  it('should escalate when repeated attempts reproduce the same blockers', async () => {
    (executor.run as ReturnType<typeof vi.fn>).mockImplementation(
      async (invocation: { mode?: string; outputPath: string }) => {
        const isReview = invocation.outputPath.includes('-review.md');
        return {
          ok: true,
          artifactPath: invocation.outputPath,
          content: isReview
            ? reviewWith('REJECTED', { topics: ['missing-acceptance-criteria'] })
            : 'A '.repeat(60),
        };
      },
    );

    const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    // Attempt 1 rejects and retries; attempt 2 reproduces the identical
    // blocker set, so convergence detection stops the loop early rather than
    // burning the remaining 3 attempts.
    expect(result.status).toBe('escalated');
    if (result.status === 'escalated') {
      expect(result.reason).toBe('NOT_CONVERGING');
      expect(result.attempts).toBe(2);
    }
    // FAILED is recorded in SQLite and mirrored to disk, never committed.
    expect(
      (gitGateway.commitFiles as ReturnType<typeof vi.fn>).mock.calls.some((call) =>
        String(call[2]).includes('[STATE]'),
      ),
    ).toBe(false);
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
