import { createHash } from 'node:crypto';
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
import type { ExecutorInvocation } from '../domain/model/executor-invocation.js';
import type { TicketRunEvent } from '../domain/model/ticket-run-event.js';
import type { GateRecord } from '../domain/model/gate-record.js';
import type { RunRecord } from '../domain/model/run-record.js';
import type { RunRecordStore } from '../domain/ports/driven/run-record-store.port.js';
import type { ChecksRunner } from '../domain/ports/driven/checks-runner.port.js';
import type { ProjectRepository } from '../domain/ports/driven/project-repository.port.js';
import type { Check } from '../domain/model/check.js';
import type { CheckConfig } from '../domain/model/project-executor-config.js';
import { CheckRegistry } from './checks/check-registry.js';
import type { CriteriaCollector } from './services/criteria-collector.js';
import { traceCriteria } from '../domain/services/criteria-trace.js';
import {
  buildConformanceReport,
  renderConformanceMarkdown,
} from '../domain/services/conformance-builder.js';
import type { ConformanceService } from './services/conformance.service.js';
import type { FileHasher } from '../domain/ports/driven/file-hasher.port.js';

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
    setPrUrl: vi.fn(),
    setSpecCommit: vi.fn(),
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
    findByFilters: vi.fn().mockReturnValue([]),
  };
}

function createMockRunRecordStore(): RunRecordStore {
  return {
    write: vi.fn((_projectPath: string, record: RunRecord) => [`/runs/${record.run_id}.json`]),
    list: vi.fn().mockReturnValue([]),
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
    // As the template states it: the column that writes code says so itself.
    executorMode: 'agentic',
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
    epicContext: [],
    spec: [],
    specPin: null,
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
  let runRecordStore: ReturnType<typeof createMockRunRecordStore>;
  let buildPromptFn: (context: AssembledContext, agentSpec: AgentSpec) => string;
  let projectChecks: CheckConfig[] | undefined;
  let protectedPaths: string[] | undefined;
  let projectRepo: ProjectRepository;
  let checksRunner: { run: ReturnType<typeof vi.fn> };
  let checkRegistry: CheckRegistry;
  let gateRecords: GateRecord[];
  let criteriaCollector: { collect: ReturnType<typeof vi.fn> };
  let conformanceService: { buildConformance: ReturnType<typeof vi.fn> };
  let fileHasher: { sha256: ReturnType<typeof vi.fn> };
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
    runRecordStore = createMockRunRecordStore();
    projectChecks = undefined;
    gateRecords = [];
    protectedPaths = undefined;
    projectRepo = {
      readExecutorConfig: () => ({ checks: projectChecks, protectedPaths }),
    } as unknown as ProjectRepository;
    checksRunner = {
      run: vi
        .fn()
        .mockResolvedValue({ exitCode: 0, durationMs: 1200, timedOut: false, outputTail: 'fine' }),
    };
    criteriaCollector = { collect: vi.fn() };
    conformanceService = { buildConformance: vi.fn() };
    fileHasher = { sha256: vi.fn().mockReturnValue({}) };
    checkRegistry = new CheckRegistry(
      projectRepo,
      checksRunner as ChecksRunner,
      criteriaCollector as unknown as CriteriaCollector,
      artifactStore,
    );
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
      runRecordStore,
      checkRegistry,
      projectRepo,
      { append: vi.fn(), list: () => gateRecords },
      criteriaCollector as unknown as CriteriaCollector,
      conformanceService as unknown as ConformanceService,
      fileHasher as FileHasher,
    );
  }

  /** The records written so far, in order. */
  function writtenRuns(): Array<{
    record: RunRecord;
    files: { brief: string; transcript: string };
  }> {
    return (runRecordStore.write as ReturnType<typeof vi.fn>).mock.calls.map((call) => ({
      record: call[1] as RunRecord,
      files: call[2] as { brief: string; transcript: string },
    }));
  }

  describe('roles, not names', () => {
    const PIN = { repo: 'AEOS-aeos', commit: 'c0ffee1', path: 'features/checkout' };
    /** An epic in TECH_SPEC, whose spec declares `declared`. */
    const inTechSpec = (declared: Partial<ColumnSpec>, specPin: typeof PIN | null = PIN): void => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        runnableTicket({ column: 'TECH_SPEC', subState: 'READY', specPin }),
      );
      (columnSpecLoader.load as ReturnType<typeof vi.fn>).mockReturnValue(
        defaultColumnSpec({ column: 'TECH_SPEC', executorMode: 'artifact', ...declared }),
      );
    };
    const reviewerContext = (): AssembledContext =>
      (buildPromptFn as ReturnType<typeof vi.fn>).mock.calls[1]![0] as AssembledContext;
    const fullTrace = traceCriteria({
      criteria: ['AC-1'],
      nonGoals: [],
      claims: new Map([['AEOS-2', ['AC-1']]]),
      instruments: new Map([['AC-1', ['a.test.ts']]]),
    });

    it('builds the conformance report at a final gate of any name', async () => {
      inTechSpec({ role: 'final-gate' });
      conformanceService.buildConformance.mockResolvedValue({
        report: { criteria: [] },
        markdown: '# Conformance report',
      });

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result.status).toBe('success');
      expect(conformanceService.buildConformance).toHaveBeenCalledWith(PROJECT_PATH, TICKET_ID);
      expect(executor.run).not.toHaveBeenCalled();
    });

    it('runs a column called DOD_GATE like any other when its spec does not make it the final gate', async () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        runnableTicket({ column: 'DOD_GATE', subState: 'READY' }),
      );
      (columnSpecLoader.load as ReturnType<typeof vi.fn>).mockReturnValue(
        defaultColumnSpec({ column: 'DOD_GATE', executorMode: 'artifact' }),
      );

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result.status).toBe('success');
      expect(conformanceService.buildConformance).not.toHaveBeenCalled();
      expect(executor.run).toHaveBeenCalledTimes(2);
    });

    it('gives the unclaimed criteria to the reviewer of a decomposition column of any name, and of no other', async () => {
      criteriaCollector.collect.mockReturnValue(fullTrace);
      inTechSpec({ role: 'decomposition' });
      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);
      expect(reviewerContext().priorArtifacts.map((a) => a.name)).toContain('criteria-claims.md');

      (buildPromptFn as ReturnType<typeof vi.fn>).mockClear();
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        runnableTicket({ column: 'TASK_BREAKDOWN', subState: 'READY', specPin: PIN }),
      );
      (columnSpecLoader.load as ReturnType<typeof vi.fn>).mockReturnValue(
        defaultColumnSpec({ column: 'TASK_BREAKDOWN', executorMode: 'artifact' }),
      );
      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);
      expect(reviewerContext().priorArtifacts.map((a) => a.name)).not.toContain(
        'criteria-claims.md',
      );
    });

    it('traces criteria before the worker of an integration column of any name', async () => {
      criteriaCollector.collect.mockReturnValue(
        traceCriteria({
          criteria: ['AC-1'],
          nonGoals: [],
          claims: new Map(),
          instruments: new Map(),
        }),
      );
      inTechSpec({ role: 'integration' });

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result).toMatchObject({ status: 'escalated', reason: 'PRE_WORKER_CHECK_FAILED' });
    });

    it('runs the worker of a column called IMPLEMENTATION as an artifact unless its spec says agentic', async () => {
      (columnSpecLoader.load as ReturnType<typeof vi.fn>).mockReturnValue(
        defaultColumnSpec({ executorMode: undefined }),
      );

      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      const worker = (executor.run as ReturnType<typeof vi.fn>).mock
        .calls[0]![0] as ExecutorInvocation;
      expect(worker).toMatchObject({ mode: 'artifact', workingDirectory: undefined });
      expect(gitGateway.stageAll).not.toHaveBeenCalled();
    });

    it.each(['none', 'task', 'epic'] as const)(
      'assembles every context of a column with the diff its spec asks for: %s',
      async (diffContext) => {
        inTechSpec({ diffContext }, null);

        await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

        const asked = (contextAssembler.assemble as ReturnType<typeof vi.fn>).mock.calls.map(
          (call) => call[2] as string,
        );
        expect(asked.length).toBeGreaterThan(1);
        expect(new Set(asked)).toEqual(new Set([diffContext]));
      },
    );
  });

  describe('the bug track', () => {
    const COMMAND = 'npx vitest run src/foo.test.ts -t "returns 404"';
    const TEST_FILE = 'src/foo.test.ts';
    const red = {
      exitCode: 1,
      durationMs: 40,
      timedOut: false,
      outputTail: 'expected 404, got 500',
    };
    const green = { exitCode: 0, durationMs: 40, timedOut: false, outputTail: '1 passed' };
    const notes = `${'A '.repeat(60)}`;
    /** What the ticket directory holds: the engine reads its own repro record back from it. */
    let stored: Record<string, string>;
    /** What the reproduce phase answers with. */
    let reproduceNotes: string;

    const invocations = (): ExecutorInvocation[] =>
      (executor.run as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => call[0] as ExecutorInvocation,
      );
    const phases = (): string[] =>
      invocations().map((invocation) =>
        invocation.outputPath.endsWith('-review.md') ? 'review' : (invocation.bugPhase ?? 'worker'),
      );
    const prompts = (): Array<{ context: AssembledContext; agent: AgentSpec }> =>
      (buildPromptFn as ReturnType<typeof vi.fn>).mock.calls.map((call) => ({
        context: call[0] as AssembledContext,
        agent: call[1] as AgentSpec,
      }));
    const projectCommits = (): string[] =>
      (gitGateway.commitFiles as ReturnType<typeof vi.fn>).mock.calls
        .filter((call) => call[0] === PROJECT_PATH)
        .map((call) => call[2] as string);
    const checksRecords = (): RunRecord[] =>
      writtenRuns()
        .map((run) => run.record)
        .filter((record) => record.role === 'checks');

    beforeEach(() => {
      stored = {};
      reproduceNotes = `${notes}\n\n<!-- AEOS-REPRO\ncommand: ${COMMAND}\n-->`;
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        runnableTicket({ kind: 'TASK', subState: 'READY', track: 'bug' }),
      );
      (columnSpecLoader.load as ReturnType<typeof vi.fn>).mockReturnValue(
        defaultColumnSpec({ executorMode: 'agentic' }),
      );
      (agentSpecLoader.load as ReturnType<typeof vi.fn>).mockReturnValue(
        defaultAgentSpec({ bugTrack: { reproduce: 'ADD A FAILING TEST', fix: 'MAKE IT PASS' } }),
      );
      (artifactStore.writeArtifact as ReturnType<typeof vi.fn>).mockImplementation(
        (_project: string, _ticket: string, name: string, content: string) => {
          stored[name] = content;
        },
      );
      (artifactStore.artifactExists as ReturnType<typeof vi.fn>).mockImplementation(
        (_project: string, _ticket: string, name: string) => name in stored,
      );
      (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockImplementation(
        (_project: string, _ticket: string, name: string) => stored[name] ?? 'ticket content',
      );
      (executor.run as ReturnType<typeof vi.fn>).mockImplementation(
        async (invocation: ExecutorInvocation) => ({
          ok: true,
          artifactPath: invocation.outputPath,
          content: invocation.outputPath.endsWith('-review.md')
            ? reviewWith('APPROVED')
            : invocation.bugPhase === 'reproduce'
              ? reproduceNotes
              : notes,
        }),
      );
      (gitGateway.changedFiles as ReturnType<typeof vi.fn>).mockImplementation((dir: string) =>
        dir === PROJECT_PATH ? [TEST_FILE] : [],
      );
      fileHasher.sha256.mockReturnValue({ [TEST_FILE]: 'hash-of-the-test' });
      checksRunner.run.mockResolvedValueOnce(red).mockResolvedValueOnce(green);
    });

    it('reproduces, commits the test, fixes, proves it green, and goes to review with the evidence', async () => {
      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result.status).toBe('success');
      expect(phases()).toEqual(['reproduce', 'fix', 'review']);
      // Each phase is briefed with its own instruction, selected by the engine.
      expect(prompts()[0]!.agent.taskInstruction).toBe('ADD A FAILING TEST');
      expect(prompts()[1]!.agent.taskInstruction).toBe('MAKE IT PASS');
      // ...and the fix is told the command and the files it must leave alone.
      const reproduction = prompts()[1]!.context.priorArtifacts.find(
        (artifact) => artifact.name === 'reproduction.md',
      )!.content;
      expect(reproduction).toContain(COMMAND);
      expect(reproduction).toContain(TEST_FILE);

      // The same command, through the checks runner, before and after the fix.
      expect(checksRunner.run.mock.calls.map((call) => [call[0].command, call[1]])).toEqual([
        [COMMAND, PROJECT_PATH],
        [COMMAND, PROJECT_PATH],
      ]);
      // The reproducing test is committed before the fix is asked for.
      expect(gitGateway.commitFiles).toHaveBeenCalledWith(
        PROJECT_PATH,
        [path.join(PROJECT_PATH, TEST_FILE)],
        expect.stringMatching(/^\[AEOS-1\]\[REPRO\]/),
      );
      const reproCommit = (gitGateway.commitFiles as ReturnType<typeof vi.fn>).mock.calls.findIndex(
        (call) => call[0] === PROJECT_PATH,
      );
      expect(
        (gitGateway.commitFiles as ReturnType<typeof vi.fn>).mock.invocationCallOrder[reproCommit],
      ).toBeLessThan((executor.run as ReturnType<typeof vi.fn>).mock.invocationCallOrder[1]!);

      // Evidence: two checks records, and repro.md with red then green.
      expect(checksRecords()).toMatchObject([
        { verdict: 'CHECKS_PASSED', executor: 'shell', output: null },
        { verdict: 'CHECKS_PASSED', executor: 'shell', output: 'tickets/AEOS-1/AEOS-1-repro.md' },
      ]);
      const evidence = stored['AEOS-1-repro.md']!;
      expect(evidence).toContain(`Command: \`${COMMAND}\``);
      expect(evidence).toContain('| Before the fix | 1 |');
      expect(evidence).toContain('| After the fix | 0 |');
      expect(evidence.indexOf('expected 404, got 500')).toBeLessThan(evidence.indexOf('1 passed'));
      expect(evidence).toContain(`<!-- AEOS-RUN: ${checksRecords()[1]!.run_id} -->`);
      // ...committed with the artefact.
      const artifactCommit = (gitGateway.commitFiles as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => (call[2] as string).includes('[impl.md]'),
      )!;
      expect(artifactCommit[1]).toContain(
        path.join(PROJECT_PATH, '.aeos', 'tickets', TICKET_ID, 'AEOS-1-repro.md'),
      );
    });

    it('rejects the attempt when the test passes before any fix: it does not reproduce the bug', async () => {
      checksRunner.run.mockReset().mockResolvedValue(green);

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      // Rejected, retried in the same phase with that feedback, and escalated when it repeats.
      expect(result.status).toBe('escalated');
      expect(phases()).toEqual(['reproduce', 'reproduce']);
      expect(
        prompts()[1]!.context.priorArtifacts.find((a) => a.name === 'previous-checks.md')!.content,
      ).toContain('The test does not reproduce the bug');
      expect(projectCommits()).toEqual([]);
      expect(checksRecords()).toMatchObject([
        { verdict: 'CHECKS_FAILED' },
        { verdict: 'CHECKS_FAILED' },
      ]);
    });

    it('does not hand the fix the feedback that was about the reproduction', async () => {
      checksRunner.run
        .mockReset()
        .mockResolvedValueOnce(green)
        .mockResolvedValueOnce(red)
        .mockResolvedValueOnce(green);

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result.status).toBe('success');
      expect(phases()).toEqual(['reproduce', 'reproduce', 'fix', 'review']);
      expect(prompts()[2]!.context.priorArtifacts.map((artifact) => artifact.name)).toEqual([
        'reproduction.md',
      ]);
    });

    it('fails the attempt, naming the file, when the fix edits the reproducing test', async () => {
      fileHasher.sha256
        .mockReturnValueOnce({ [TEST_FILE]: 'hash-of-the-test' })
        .mockReturnValueOnce({ [TEST_FILE]: 'another-hash' });

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result).toMatchObject({ status: 'failed' });
      if (result.status !== 'failed') return;
      expect(result.error).toContain('The reproducing test was modified');
      expect(result.error).toContain(TEST_FILE);
      expect(gitGateway.restoreFiles).toHaveBeenCalledWith(PROJECT_PATH, [TEST_FILE]);
      expect(phases()).toEqual(['reproduce', 'fix']);
      // The fix was not run against a test it had rewritten.
      expect(checksRunner.run).toHaveBeenCalledTimes(1);
    });

    it('escalates when the reproduce phase names no command', async () => {
      reproduceNotes = notes;

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result).toMatchObject({ status: 'escalated', reason: 'UNPARSEABLE_REPRO' });
      expect(stateMachine.setSubState).toHaveBeenLastCalledWith(PROJECT_ID, TICKET_ID, 'ESCALATED');
      expect(phases()).toEqual(['reproduce']);
      expect(checksRunner.run).not.toHaveBeenCalled();
    });

    it('sends the fix back when the test still fails after it, without asking the reviewer', async () => {
      checksRunner.run.mockReset().mockResolvedValue(red);

      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      // Reproduced once; from then on only the fix is retried.
      expect(phases()).toEqual(['reproduce', 'fix', 'fix']);
      expect(
        prompts()[2]!.context.priorArtifacts.find((a) => a.name === 'previous-checks.md')!.content,
      ).toContain('still fails after the fix');
      expect(projectCommits()).toHaveLength(1);
      expect(stored).not.toHaveProperty('AEOS-1-repro.md');
    });

    it('does not reproduce again on a later run: the committed test and its hashes stand', async () => {
      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);
      (executor.run as ReturnType<typeof vi.fn>).mockClear();
      checksRunner.run.mockReset().mockResolvedValue(green);

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result.status).toBe('success');
      expect(phases()).toEqual(['fix', 'review']);
      expect(projectCommits()).toHaveLength(1);
      expect(stored['AEOS-1-repro.md']).toContain('| Before the fix | 1 |');
    });

    it('refuses to run a bug with an agent that has no bug-track instructions', async () => {
      (agentSpecLoader.load as ReturnType<typeof vi.fn>).mockReturnValue(defaultAgentSpec());

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result).toMatchObject({
        status: 'failed',
        error: expect.stringContaining('bugTrack'),
      });
      expect(executor.run).not.toHaveBeenCalled();
    });
  });

  describe('conformance at the final gate', () => {
    const PIN = { repo: 'AEOS-aeos', commit: 'c0ffee1', path: 'features/checkout' };
    /** A report over AC-1…AC-4 in which exactly `passing` pass by test. */
    const conformanceWith = (passing: string[]): void => {
      const report = buildConformanceReport({
        feature: 'checkout',
        epic: TICKET_ID,
        trace: traceCriteria({
          criteria: ['AC-1', 'AC-2', 'AC-3', 'AC-4'],
          nonGoals: [],
          claims: new Map(),
          instruments: new Map(),
        }),
        tests: passing.map((id) => ({ name: `${id} holds`, file: 'a.test.ts', status: 'pass' })),
        spec: PIN,
        code: { repo: 'shop', commit: 'deadbee' },
        generatedAt: '2026-11-10T12:00:00.000Z',
      });
      conformanceService.buildConformance.mockResolvedValue({
        report,
        markdown: renderConformanceMarkdown(report),
      });
    };
    const conformanceFile = (): string =>
      (artifactStore.writeArtifact as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[2] === `${TICKET_ID}-conformance.md`,
      )?.[3] as string;
    const workerAnswers = (block: string): void => {
      (executor.run as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        artifactPath: '/tmp/artifact',
        content: `${'A '.repeat(60)}\n\n${block}\n\n${reviewWith('APPROVED')}`,
      });
    };

    beforeEach(() => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        runnableTicket({ column: 'DOD_GATE', subState: 'READY', specPin: PIN }),
      );
      (columnSpecLoader.load as ReturnType<typeof vi.fn>).mockReturnValue(
        defaultColumnSpec({
          column: 'DOD_GATE',
          role: 'final-gate',
          executorMode: 'artifact',
          outputArtifact: 'dod-verification.md',
        }),
      );
    });

    it('invokes no agent when every criterion passes by test, and signs the report off', async () => {
      conformanceWith(['AC-1', 'AC-2', 'AC-3', 'AC-4']);

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result.status).toBe('success');
      expect(conformanceService.buildConformance).toHaveBeenCalledWith(PROJECT_PATH, TICKET_ID);
      expect(executor.run).not.toHaveBeenCalled();
      expect(preflight.run).not.toHaveBeenCalled();
      for (const id of ['AC-1', 'AC-2', 'AC-3', 'AC-4']) {
        expect(conformanceFile()).toContain(`| ${id} | pass |`);
      }
      expect(conformanceFile()).not.toContain('Judge exactly');
      expect(stateMachine.setSubState).toHaveBeenLastCalledWith(
        PROJECT_ID,
        TICKET_ID,
        'SIGNED_OFF',
      );
    });

    it('asks the agent about exactly the unverified criteria, then the reviewer', async () => {
      conformanceWith(['AC-1', 'AC-2']);
      workerAnswers('<!-- AEOS-CONFORMANCE\nAC-3: pass | Stored.\nAC-4: fail | Never read.\n-->');

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result.status).toBe('success');
      // Written to the ticket directory before the context is assembled, so
      // the worker and the reviewer are both briefed with it.
      expect(conformanceFile()).toContain('Judge exactly these criteria: AC-3, AC-4');
      expect(
        (artifactStore.writeArtifact as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0],
      ).toBeLessThan(
        (contextAssembler.assemble as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!,
      );
      // The worker, then the reviewer.
      expect(executor.run).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['no verdict block', ''],
      ['a block that leaves one out', '<!-- AEOS-CONFORMANCE\nAC-3: pass | Stored.\n-->'],
    ])('escalates on %s, and does not ask the reviewer', async (_name, block) => {
      conformanceWith(['AC-1', 'AC-2']);
      workerAnswers(block);

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result).toMatchObject({ status: 'escalated', reason: 'UNPARSEABLE_VERDICT' });
      expect(executor.run).toHaveBeenCalledTimes(1);
      expect(stateMachine.setSubState).toHaveBeenLastCalledWith(PROJECT_ID, TICKET_ID, 'ESCALATED');
    });

    it('fails the run, with the cause, when the report cannot be built', async () => {
      conformanceService.buildConformance.mockRejectedValue(new Error('no test report'));

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result).toMatchObject({ status: 'failed', error: 'no test report' });
      expect(executor.run).not.toHaveBeenCalled();
    });
  });

  describe('criterion tracing before the worker', () => {
    const PIN = { repo: 'AEOS-aeos', commit: 'c0ffee1', path: 'features/checkout' };
    const trace = (claimed: string[], tagged = ['AC-1', 'AC-2', 'AC-3', 'AC-4']) =>
      traceCriteria({
        criteria: ['AC-1', 'AC-2', 'AC-3', 'AC-4'],
        nonGoals: ['NON-GOAL-1'],
        claims: new Map([['AEOS-2', claimed]]),
        instruments: new Map(tagged.map((id) => [id, [`src/${id}.test.ts`]])),
      });
    const atIntegration = (specPin: typeof PIN | null = PIN): void => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        runnableTicket({ column: 'INTEGRATION_REVIEW', specPin }),
      );
      (columnSpecLoader.load as ReturnType<typeof vi.fn>).mockReturnValue(
        defaultColumnSpec({
          column: 'INTEGRATION_REVIEW',
          role: 'integration',
          executorMode: 'artifact',
          outputArtifact: 'integration.md',
        }),
      );
    };
    const written = (): Record<string, string> =>
      Object.fromEntries(
        (artifactStore.writeArtifact as ReturnType<typeof vi.fn>).mock.calls.map((call) => [
          call[2],
          call[3],
        ]),
      ) as Record<string, string>;

    it('escalates with the trace report when a criterion is unclaimed; no agent runs, no attempt is used', async () => {
      atIntegration();
      criteriaCollector.collect.mockReturnValue(trace(['AC-1', 'AC-2', 'AC-3']));

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result).toMatchObject({
        status: 'escalated',
        reason: 'PRE_WORKER_CHECK_FAILED',
        attempts: 0,
        artifactPath: path.join(
          PROJECT_PATH,
          '.aeos',
          'tickets',
          TICKET_ID,
          'AEOS-1-criteria-trace.md',
        ),
      });
      expect(written()['AEOS-1-criteria-trace.md']).toContain('Unclaimed: AC-4');
      expect(executor.run).not.toHaveBeenCalled();
      expect(preflight.run).not.toHaveBeenCalled();
      expect(stateMachine.setSubState).toHaveBeenCalledExactlyOnceWith(
        PROJECT_ID,
        TICKET_ID,
        'ESCALATED',
      );
      // One run record, for the check; none for a worker or a reviewer.
      expect(writtenRuns().map((run) => run.record)).toMatchObject([
        {
          role: 'checks',
          executor: 'in-process',
          verdict: 'CHECKS_FAILED',
          brief: null,
          output: 'tickets/AEOS-1/AEOS-1-criteria-trace.md',
          spec_pin: PIN,
        },
      ]);
    });

    it('blocks on a claimed criterion that no test or scenario names', async () => {
      atIntegration();
      criteriaCollector.collect.mockReturnValue(
        trace(['AC-1', 'AC-2', 'AC-3', 'AC-4'], ['AC-1', 'AC-2', 'AC-3']),
      );

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result.status).toBe('escalated');
      expect(written()['AEOS-1-criteria-trace.md']).toContain('Untested: AC-4');
    });

    it('blocks on a claim of a criterion the spec does not contain', async () => {
      atIntegration();
      criteriaCollector.collect.mockReturnValue(trace(['AC-1', 'AC-2', 'AC-3', 'AC-4', 'AC-9']));

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result.status).toBe('escalated');
      expect(written()['AEOS-1-criteria-trace.md']).toContain('AEOS-2 claims AC-9');
    });

    it('passes, commits the report with its run record, and goes on to the worker', async () => {
      atIntegration();
      criteriaCollector.collect.mockReturnValue(trace(['AC-1', 'AC-2', 'AC-3', 'AC-4']));

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result.status).toBe('success');
      expect(written()['AEOS-1-criteria-trace.md']).toContain('NON-GOAL-1');
      const dir = path.join(PROJECT_PATH, '.aeos', 'tickets', TICKET_ID);
      expect(gitGateway.commitFiles).toHaveBeenCalledWith(
        path.join(PROJECT_PATH, '.aeos'),
        expect.arrayContaining([
          path.join(dir, 'AEOS-1-criteria-trace.md'),
          path.join(dir, 'AEOS-1-criteria-trace.json'),
        ]),
        expect.stringMatching(/\[checks\]\[ok\]$/),
      );
      expect(writtenRuns()[0]!.record).toMatchObject({ role: 'checks', verdict: 'CHECKS_PASSED' });
    });

    it('is skipped for an epic with no spec', async () => {
      atIntegration(null);

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result.status).toBe('success');
      expect(criteriaCollector.collect).not.toHaveBeenCalled();
      expect(writtenRuns().some((run) => run.record.role === 'checks')).toBe(false);
    });

    it('tells the task-breakdown reviewer which criteria no task claims', async () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        runnableTicket({ column: 'TASK_BREAKDOWN', specPin: PIN }),
      );
      (columnSpecLoader.load as ReturnType<typeof vi.fn>).mockReturnValue(
        defaultColumnSpec({
          column: 'TASK_BREAKDOWN',
          role: 'decomposition',
          executorMode: 'artifact',
          outputArtifact: 'tasks.md',
        }),
      );
      criteriaCollector.collect.mockReturnValue(trace(['AC-1', 'AC-9']));

      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      const contexts = (buildPromptFn as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => call[0] as AssembledContext,
      );
      const claims = (context: AssembledContext) =>
        context.priorArtifacts.find((artifact) => artifact.name === 'criteria-claims.md');
      expect(claims(contexts[0]!)).toBeUndefined();
      expect(claims(contexts[1]!)?.content).toContain('Unclaimed: AC-2, AC-3, AC-4');
      expect(claims(contexts[1]!)?.content).toContain('AEOS-2 claims AC-9');
    });
  });

  describe('drift guard', () => {
    const PIN = { repo: 'AEOS-aeos', commit: 'c0ffee1', path: 'features/checkout' };

    it('refuses to start while an amendment written under the pin is not repinned', async () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        runnableTicket({ specPin: PIN }),
      );
      gateRecords = [{ gate: 'amendment', ticket: 'AEOS-7', spec_pin: PIN } as GateRecord];

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result).toMatchObject({ status: 'failed' });
      expect(result.status === 'failed' && result.error).toMatch(/AEOS-7.*aeos ticket repin/s);
      expect(executor.run).not.toHaveBeenCalled();
      expect(preflight.run).not.toHaveBeenCalled();
      expect(stateMachine.setSubState).not.toHaveBeenCalled();
    });

    it('runs once the pin has moved past the amendment', async () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        runnableTicket({ specPin: { ...PIN, commit: 'deadbee' } }),
      );
      gateRecords = [{ gate: 'amendment', ticket: 'AEOS-7', spec_pin: PIN } as GateRecord];

      expect((await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID)).status).toBe('success');
    });
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
      // The worker executor, wrapped so the invocation can be recorded.
      expect.objectContaining({ run: expect.any(Function) }),
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

  it('records an unknown cost as null when the executor reports no usage', async () => {
    const events: TicketRunEvent[] = [];

    await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, undefined, {
      onEvent: (event) => events.push(event),
    });

    expect(costRepo.record).toHaveBeenCalledWith(expect.objectContaining({ costUsd: null }));
    const costEvents = events.filter((event) => event.type === 'cost.recorded');
    expect(costEvents.length).toBeGreaterThan(0);
    for (const event of costEvents) expect(event.payload).toMatchObject({ costUsd: null });
  });

  it('records the reported cost when the executor reports usage', async () => {
    const reported = await executor.run({} as ExecutorInvocation);
    (executor.run as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...reported,
      usage: { inputTokens: 3, outputTokens: 4, costUsd: 0.5 },
    });

    await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(costRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokens: 3, outputTokens: 4, costUsd: 0.5 }),
    );
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
      runnableTicket({ column: 'SPEC_REVIEW' }),
    );
    (columnSpecLoader.load as ReturnType<typeof vi.fn>).mockReturnValue({
      ...defaultColumnSpec(),
      column: 'SPEC_REVIEW',
      phase: 'PLAN',
      outputArtifact: 'prd.md',
      executorMode: undefined,
    });

    await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(executor.run).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        column: 'SPEC_REVIEW',
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

  it('baselines pre-existing repo changes before an agentic worker runs', async () => {
    // Otherwise the accumulated tree (a previous task's work, unrelated local
    // edits) lands in this ticket's diff and CODE_REVIEW rejects files the
    // ticket never claimed.
    await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(gitGateway.commitAll).toHaveBeenCalledWith(
      PROJECT_PATH,
      expect.stringContaining('[AEOS-1][BASELINE]'),
    );
  });

  it('stages the repo before diffing so newly created files count as changes', async () => {
    // `git diff HEAD` ignores untracked files, so a task that only ADDS files
    // (a migration, a new module) would read as "no changes" and fail — and the
    // files would reach CODE_REVIEW/QA looking untracked.
    const order: string[] = [];
    (gitGateway.stageAll as ReturnType<typeof vi.fn>).mockImplementation(() =>
      order.push('stageAll'),
    );
    (gitGateway.diff as ReturnType<typeof vi.fn>).mockImplementation(() => {
      order.push('diff');
      return 'diff --git a/new.sql b/new.sql';
    });

    await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(gitGateway.stageAll).toHaveBeenCalledWith(PROJECT_PATH);
    expect(order).toEqual(['stageAll', 'diff']);
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
    (columnSpecLoader.load as ReturnType<typeof vi.fn>).mockReturnValue(
      defaultColumnSpec({ column: 'DOD_GATE', role: 'final-gate', executorMode: 'artifact' }),
    );

    const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

    expect(result).toEqual({
      status: 'failed',
      ticketId: TICKET_ID,
      error: 'DoD gate is human-only',
    });
  });

  describe('task branches', () => {
    const order = (mock: unknown): number =>
      (mock as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
    const running = (overrides: Partial<Ticket>): void => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        runnableTicket({ kind: 'TASK', ...overrides }),
      );
    };
    const onDefaultBranch = (): void => {
      (gitGateway.currentBranch as ReturnType<typeof vi.fn>).mockReturnValue('main');
    };

    it('puts a standalone task on its own tagged branch before any executor runs', async () => {
      running({ parentId: null });
      onDefaultBranch();

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result.status).toBe('success');
      expect(gitGateway.ensureOnBranch).toHaveBeenCalledWith(PROJECT_PATH, 'aeos/AEOS-1');
      expect(gitGateway.tagHere).toHaveBeenCalledWith(PROJECT_PATH, 'aeos-base/AEOS-1');
      expect(order(gitGateway.ensureOnBranch)).toBeLessThan(order(gitGateway.tagHere));
      expect(order(gitGateway.tagHere)).toBeLessThan(order(preflight.run));
      expect(order(gitGateway.tagHere)).toBeLessThan(order(executor.run));
    });

    it('refuses to run a child task while HEAD is the default branch', async () => {
      running({ parentId: 'AEOS-9' });
      onDefaultBranch();

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result).toMatchObject({ status: 'failed' });
      const { error } = result as { error: string };
      expect(error).toContain("default branch 'main'");
      expect(error).toContain('aeos/AEOS-9');
      expect(executor.run).not.toHaveBeenCalled();
      expect(preflight.run).not.toHaveBeenCalled();
      expect(stateMachine.setSubState).not.toHaveBeenCalled();
      expect(gitGateway.ensureOnBranch).not.toHaveBeenCalled();
    });

    it("runs a child task on its epic's branch without switching", async () => {
      running({ parentId: 'AEOS-9' });
      (gitGateway.currentBranch as ReturnType<typeof vi.fn>).mockReturnValue('aeos/AEOS-9');

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result.status).toBe('success');
      expect(gitGateway.ensureOnBranch).not.toHaveBeenCalled();
    });

    it('leaves an epic where it is', async () => {
      onDefaultBranch();

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result.status).toBe('success');
      expect(gitGateway.ensureOnBranch).not.toHaveBeenCalled();
    });

    it('does nothing outside a git repository, or with AEOS_GIT_ISOLATION=none', async () => {
      running({ parentId: 'AEOS-9' });
      onDefaultBranch();
      (gitGateway.isRepo as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
      expect((await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID)).status).toBe('success');

      vi.stubEnv('AEOS_GIT_ISOLATION', 'none');
      try {
        running({ parentId: null });
        expect((await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID)).status).toBe('success');
      } finally {
        vi.unstubAllEnvs();
      }
      expect(gitGateway.ensureOnBranch).not.toHaveBeenCalled();
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

  // --- Run records (I1-M1-003) ---

  describe('run records', () => {
    it("assembles a child task's context against its parent epic's pin, on every assembly", async () => {
      const specPin = { repo: 'AEOS-aeos', commit: 'c0ffee1', path: 'features/checkout' };
      const epic = runnableTicket({ id: 'AEOS-9', kind: 'EPIC', specPin });
      const task = runnableTicket({ kind: 'TASK', parentId: 'AEOS-9' });
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockImplementation(
        (_project: string, id: string) => (id === 'AEOS-9' ? epic : task),
      );
      (gitGateway.currentBranch as ReturnType<typeof vi.fn>).mockReturnValue('aeos/AEOS-9');

      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      const calls = (contextAssembler.assemble as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.length).toBeGreaterThan(1);
      for (const call of calls) expect(call[3]).toEqual(specPin);
    });

    it('fails the run with the error when the pinned spec cannot be read', async () => {
      (contextAssembler.assemble as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Cannot read the pinned spec AEOS-aeos@c0ffee1'),
      );

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result).toMatchObject({
        status: 'failed',
        error: expect.stringContaining('AEOS-aeos@c0ffee1'),
      });
      expect(executor.run).not.toHaveBeenCalled();
    });

    it('fills spec_pin on every record of a spec-backed ticket', async () => {
      const specPin = { repo: 'AEOS-aeos', commit: 'c0ffee1', path: 'features/checkout' };
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        runnableTicket({ specPin }),
      );
      (executor.run as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        artifactPath: '/tmp/artifact',
        content: `${'A '.repeat(60)}\n\n${reviewWith('APPROVED')}`,
      });

      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(writtenRuns().length).toBeGreaterThan(0);
      for (const run of writtenRuns()) expect(run.record.spec_pin).toEqual(specPin);
    });

    it('writes a record with the brief and the log for the worker and the reviewer', async () => {
      (executor.run as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        artifactPath: '/tmp/artifact',
        content: `${'A '.repeat(60)}\n\n${reviewWith('APPROVED')}`,
        usage: { inputTokens: 10, outputTokens: 20, costUsd: 0.4 },
        transcript: 'raw stream',
      });

      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      const [worker, reviewer] = writtenRuns();
      expect(worker!.record).toMatchObject({
        schema_version: 0,
        project: PROJECT_ID,
        ticket: TICKET_ID,
        column: 'IMPLEMENTATION',
        role: 'worker',
        agent: 'test-agent',
        attempt: 1,
        executor: 'claude-cli',
        model: 'claude-opus-4-6',
        mode: 'agentic',
        output: 'tickets/AEOS-1/AEOS-1-impl.md',
        verdict: null,
        exit: 'ok',
        usage: { input_tokens: 10, output_tokens: 20 },
        cost_usd: 0.4,
        cost_basis: 'executor-estimate',
        spec_pin: null,
        error: null,
      });
      expect(worker!.record.run_id).toMatch(/^RUN-\d{8}T\d{6}Z-[0-9a-z]{4}$/);
      expect(worker!.files).toEqual({ brief: 'assembled prompt', transcript: 'raw stream' });
      expect(reviewer!.record).toMatchObject({
        role: 'reviewer',
        mode: 'artifact',
        output: 'tickets/AEOS-1/AEOS-1-impl-review.md',
        verdict: 'APPROVED',
        exit: 'ok',
      });
      expect(writtenRuns()).toHaveLength(2);
    });

    it('records the SHA-256 of the brief', async () => {
      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      const { record, files } = writtenRuns()[0]!;
      expect(record.brief).toEqual({
        path: `tickets/AEOS-1/runs/${record.run_id}.brief.md`,
        sha256: createHash('sha256').update(files.brief).digest('hex'),
      });
      expect(record.transcript).toBe(`tickets/AEOS-1/runs/${record.run_id}.log`);
    });

    it('commits each record with the artefact it produced, and links the artefact to it', async () => {
      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      const [worker, reviewer] = writtenRuns();
      const ticketDir = path.join(PROJECT_PATH, '.aeos', 'tickets', TICKET_ID);
      const commits = (gitGateway.commitFiles as ReturnType<typeof vi.fn>).mock.calls;
      expect(commits.map((call) => call[1])).toEqual([
        [path.join(ticketDir, 'AEOS-1-impl.md'), `/runs/${worker!.record.run_id}.json`],
        [path.join(ticketDir, 'AEOS-1-impl-review.md'), `/runs/${reviewer!.record.run_id}.json`],
      ]);

      const written = (artifactStore.writeArtifact as ReturnType<typeof vi.fn>).mock.calls;
      const lastLine = (filename: string): string =>
        String(written.find((call) => call[2] === filename)![3])
          .trimEnd()
          .split('\n')
          .pop()!;
      expect(lastLine('AEOS-1-impl.md')).toBe(`<!-- AEOS-RUN: ${worker!.record.run_id} -->`);
      expect(lastLine('AEOS-1-impl-review.md')).toBe(
        `<!-- AEOS-RUN: ${reviewer!.record.run_id} -->`,
      );
    });

    it('commits a failed worker run as a record alone, with exit failed and the error', async () => {
      (executor.run as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        reason: 'Model exploded',
      });

      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      const { record, files } = writtenRuns()[0]!;
      expect(record).toMatchObject({
        role: 'worker',
        exit: 'failed',
        error: 'Model exploded',
        output: null,
        cost_usd: null,
        cost_basis: 'unknown',
      });
      expect(files.transcript).toBe('Model exploded');
      expect(gitGateway.commitFiles).toHaveBeenCalledWith(
        path.join(PROJECT_PATH, '.aeos'),
        [`/runs/${record.run_id}.json`],
        `[${TICKET_ID}][RUN][${record.run_id}][worker][failed]`,
      );
    });

    it('records a worker whose executor throws', async () => {
      (executor.run as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('spawn ENOENT'));

      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(writtenRuns()[0]!.record).toMatchObject({ exit: 'failed', error: 'spawn ENOENT' });
      expect(gitGateway.commitFiles).toHaveBeenCalledOnce();
    });

    it('records a worker whose output fails validation as failed', async () => {
      // An artifact column: the word count is not asked of an agentic summary.
      (columnSpecLoader.load as ReturnType<typeof vi.fn>).mockReturnValue(
        defaultColumnSpec({ executorMode: 'artifact' }),
      );
      (executor.run as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        artifactPath: '/tmp/artifact',
        content: 'too short',
      });

      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      const { record } = writtenRuns()[0]!;
      expect(record.exit).toBe('failed');
      expect(record.error).toContain('Output validation failed');
      expect(record.output).toBeNull();
    });

    it('records a timeout and an interruption as such', async () => {
      (executor.run as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        reason: 'Executor timeout after 300s',
      });
      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      (executor.run as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        reason: 'Execution interrupted by operator',
      });
      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(writtenRuns().map((run) => run.record.exit)).toEqual(['timeout', 'interrupted']);
    });

    it('records an unknown cost as null with basis unknown', async () => {
      // The default mock executor reports no usage.
      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(writtenRuns()).toHaveLength(2);
      for (const { record } of writtenRuns()) {
        expect(record).toMatchObject({ usage: null, cost_usd: null, cost_basis: 'unknown' });
      }
    });

    it('records a stub run as cost basis none', async () => {
      (executorConfigResolver.resolveExecutorConfig as ReturnType<typeof vi.fn>).mockReturnValue({
        executorType: 'stub',
        timeoutMs: 300_000,
      });
      (executor.run as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        artifactPath: '/tmp/artifact',
        content: `${'A '.repeat(60)}\n\n${reviewWith('APPROVED')}`,
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      });

      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(writtenRuns()[0]!.record).toMatchObject({
        executor: 'stub',
        model: null,
        cost_usd: 0,
        cost_basis: 'none',
      });
    });

    it('records a failed reviewer and an unparseable verdict', async () => {
      (executor.run as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ ok: true, artifactPath: '/a', content: 'A '.repeat(60) })
        .mockResolvedValueOnce({ ok: false, reason: 'Reviewer crashed' });
      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);
      expect(writtenRuns()[1]!.record).toMatchObject({
        role: 'reviewer',
        exit: 'failed',
        error: 'Reviewer crashed',
        verdict: null,
      });

      (executor.run as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        artifactPath: '/a',
        content: 'A '.repeat(60),
      });
      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);
      expect(writtenRuns()[3]!.record).toMatchObject({
        role: 'reviewer',
        exit: 'ok',
        verdict: 'UNPARSEABLE',
      });
    });

    it('records the preflight invocation and commits it alone when it is clear', async () => {
      (preflight.run as ReturnType<typeof vi.fn>).mockImplementation(
        async (_t, _p, _path, _ctx, _spec, _agent, preflightExecutor: Executor) => {
          await preflightExecutor.run({
            prompt: 'preflight prompt',
            outputPath: '/tmp/preflight.md',
            ticketId: TICKET_ID,
            column: 'IMPLEMENTATION',
          });
          return { blocked: false };
        },
      );

      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      const { record, files } = writtenRuns()[0]!;
      expect(record).toMatchObject({ role: 'preflight', attempt: 1, exit: 'ok', output: null });
      expect(files.brief).toBe('preflight prompt');
      expect((gitGateway.commitFiles as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([
        path.join(PROJECT_PATH, '.aeos'),
        [`/runs/${record.run_id}.json`],
        `[${TICKET_ID}][RUN][${record.run_id}][preflight][ok]`,
      ]);
    });

    it('records the cost of each role, preflight included', async () => {
      (preflight.run as ReturnType<typeof vi.fn>).mockImplementation(
        async (_t, _p, _path, _ctx, _spec, _agent, preflightExecutor: Executor) => {
          await preflightExecutor.run({
            prompt: 'preflight prompt',
            outputPath: '/tmp/preflight.md',
            ticketId: TICKET_ID,
            column: 'IMPLEMENTATION',
          });
          return { blocked: false };
        },
      );

      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(
        (costRepo.record as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0].role),
      ).toEqual(['preflight', 'worker', 'reviewer']);
    });

    it('commits a blocked preflight record with its questions', async () => {
      (preflight.run as ReturnType<typeof vi.fn>).mockImplementation(
        async (_t, _p, _path, _ctx, _spec, _agent, preflightExecutor: Executor) => {
          await preflightExecutor.run({
            prompt: 'preflight prompt',
            outputPath: '/tmp/preflight.md',
            ticketId: TICKET_ID,
            column: 'IMPLEMENTATION',
          });
          return { blocked: true, questionsPath: 'AEOS-1-questions.md' };
        },
      );

      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      const { record } = writtenRuns()[0]!;
      expect(record.output).toBe('tickets/AEOS-1/AEOS-1-questions.md');
      expect(gitGateway.commitFiles).toHaveBeenCalledWith(
        path.join(PROJECT_PATH, '.aeos'),
        [
          path.join(PROJECT_PATH, '.aeos', 'tickets', TICKET_ID, 'AEOS-1-questions.md'),
          `/runs/${record.run_id}.json`,
        ],
        `[${TICKET_ID}][QUESTIONS][v1][preflight][blocked]`,
      );
    });
  });

  describe('checks stage', () => {
    const CHECKS: CheckConfig[] = [
      { name: 'typecheck', command: 'npm run typecheck', timeoutSeconds: 120 },
      { name: 'lint', command: 'npm run lint', timeoutSeconds: 120 },
      { name: 'test', command: 'npm test', timeoutSeconds: 600 },
    ];
    const failing = { exitCode: 1, durationMs: 300, timedOut: false, outputTail: 'TS2322: no' };

    beforeEach(() => {
      projectChecks = CHECKS;
      (columnSpecLoader.load as ReturnType<typeof vi.fn>).mockReturnValue(
        defaultColumnSpec({ runChecks: true }),
      );
    });

    const reviewerCalls = (): unknown[] =>
      (executor.run as ReturnType<typeof vi.fn>).mock.calls.filter((call) =>
        (call[0] as ExecutorInvocation).outputPath.endsWith('-review.md'),
      );
    const workerContexts = (): AssembledContext[] =>
      (buildPromptFn as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => call[0] as AssembledContext,
      );
    const checksRecords = (): RunRecord[] =>
      writtenRuns()
        .map((run) => run.record)
        .filter((record) => record.role === 'checks');

    it('never invokes the reviewer when a check fails', async () => {
      checksRunner.run.mockResolvedValue(failing);

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(reviewerCalls()).toHaveLength(0);
      expect(result.status).toBe('escalated');
    });

    it('gives the failing output to the next worker attempt as previous-checks.md', async () => {
      checksRunner.run.mockResolvedValueOnce(failing);

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result).toMatchObject({ status: 'success', attempts: 2 });
      // Prompts: worker 1, worker 2, reviewer 2. The failed attempt has no reviewer prompt.
      const [first, retry] = workerContexts();
      expect(first!.priorArtifacts.some((a) => a.name === 'previous-checks.md')).toBe(false);
      const feedback = retry!.priorArtifacts.find((a) => a.name === 'previous-checks.md');
      expect(feedback?.content).toContain('typecheck');
      expect(feedback?.content).toContain('TS2322: no');
    });

    it('escalates, not fails, when checks fail up to the iteration cap', async () => {
      (columnSpecLoader.load as ReturnType<typeof vi.fn>).mockReturnValue(
        defaultColumnSpec({ runChecks: true, maxIterations: 2 }),
      );
      // A different check each attempt, so the cap ends the loop, not stall detection.
      checksRunner.run
        .mockResolvedValueOnce(failing)
        .mockResolvedValueOnce({ exitCode: 0, durationMs: 1, timedOut: false, outputTail: '' })
        .mockResolvedValueOnce(failing);

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result).toMatchObject({
        status: 'escalated',
        reason: 'ITERATIONS_EXHAUSTED',
        attempts: 2,
      });
      const subStates = (stateMachine.setSubState as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => call[2] as string,
      );
      expect(subStates).toContain('ESCALATED');
      expect(subStates).not.toContain('FAILED');
      expect(reviewerCalls()).toHaveLength(0);
    });

    it('stops at the first failing check', async () => {
      (columnSpecLoader.load as ReturnType<typeof vi.fn>).mockReturnValue(
        defaultColumnSpec({ runChecks: true, maxIterations: 1 }),
      );
      checksRunner.run
        .mockResolvedValueOnce({ exitCode: 0, durationMs: 1, timedOut: false, outputTail: '' })
        .mockResolvedValueOnce(failing);

      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(checksRunner.run.mock.calls.map((call) => (call[0] as CheckConfig).command)).toEqual([
        'npm run typecheck',
        'npm run lint',
      ]);
    });

    it('writes the checks table and commits it with the artefact before the reviewer runs', async () => {
      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result.status).toBe('success');
      const write = (artifactStore.writeArtifact as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[2] === `${TICKET_ID}-checks.md`,
      );
      expect(write?.[3]).toContain('| typecheck | passed | 1.2s |');
      expect(write?.[3]).toContain('| test | passed | 1.2s |');

      const checksPath = path.join(
        PROJECT_PATH,
        '.aeos',
        'tickets',
        TICKET_ID,
        `${TICKET_ID}-checks.md`,
      );
      const commits = (gitGateway.commitFiles as ReturnType<typeof vi.fn>).mock;
      const artefactCommit = commits.calls.findIndex((call) =>
        (call[1] as string[]).includes(checksPath),
      );
      expect((commits.calls[artefactCommit]![1] as string[])[0]).toMatch(/impl\.md$/);
      expect(commits.invocationCallOrder[artefactCommit]!).toBeLessThan(
        (executor.run as ReturnType<typeof vi.fn>).mock.invocationCallOrder[1]!,
      );
    });

    it('records one run per checks stage', async () => {
      checksRunner.run.mockResolvedValueOnce(failing);

      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      const [failed, passed] = checksRecords();
      expect(checksRecords()).toHaveLength(2);
      expect(failed).toMatchObject({
        role: 'checks',
        executor: 'shell',
        agent: null,
        model: null,
        mode: null,
        brief: null,
        attempt: 1,
        verdict: 'CHECKS_FAILED',
        exit: 'failed',
        cost_basis: 'none',
        output: null,
      });
      expect(passed).toMatchObject({
        attempt: 2,
        verdict: 'CHECKS_PASSED',
        exit: 'ok',
        cost_basis: 'none',
        error: null,
        output: `tickets/${TICKET_ID}/${TICKET_ID}-checks.md`,
      });
      const failedRun = writtenRuns().find((run) => run.record === failed)!;
      expect(failedRun.files.brief).toBeUndefined();
      expect(failedRun.files.transcript).toContain('TS2322: no');
    });

    it('reports a check that timed out as failed', async () => {
      (columnSpecLoader.load as ReturnType<typeof vi.fn>).mockReturnValue(
        defaultColumnSpec({ runChecks: true, maxIterations: 1 }),
      );
      checksRunner.run.mockResolvedValue({
        exitCode: null,
        durationMs: 120_000,
        timedOut: true,
        outputTail: '',
      });

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result.status).toBe('escalated');
      expect(checksRecords()[0]).toMatchObject({ verdict: 'CHECKS_FAILED', exit: 'timeout' });
      expect(reviewerCalls()).toHaveLength(0);
    });

    it('runs no checks for a column that has not opted in', async () => {
      (columnSpecLoader.load as ReturnType<typeof vi.fn>).mockReturnValue(defaultColumnSpec());
      checksRunner.run.mockResolvedValue(failing);

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result.status).toBe('success');
      expect(checksRunner.run).not.toHaveBeenCalled();
      expect(checksRecords()).toHaveLength(0);
      const written = (artifactStore.writeArtifact as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => call[2] as string,
      );
      expect(written).not.toContain(`${TICKET_ID}-checks.md`);
    });

    it('treats a failing in-process check exactly as a failing shell check', async () => {
      projectChecks = undefined;
      const inProcess: Check = {
        name: 'criteria',
        phase: 'post-worker',
        run: vi
          .fn()
          .mockResolvedValueOnce({
            name: 'criteria',
            passed: false,
            durationMs: 3,
            timedOut: false,
            outputTail: 'AC-2 has no test',
          })
          .mockResolvedValue({
            name: 'criteria',
            passed: true,
            durationMs: 3,
            timedOut: false,
            outputTail: '',
          }),
      };
      checkRegistry.register(inProcess);

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(checksRunner.run).not.toHaveBeenCalled();
      expect(result).toMatchObject({ status: 'success', attempts: 2 });
      // One review only: the failed attempt never reached the reviewer.
      expect(reviewerCalls()).toHaveLength(1);
      const feedback = workerContexts()[1]!.priorArtifacts.find(
        (a) => a.name === 'previous-checks.md',
      );
      expect(feedback?.content).toContain('AC-2 has no test');
      expect(checksRecords().map((record) => record.verdict)).toEqual([
        'CHECKS_FAILED',
        'CHECKS_PASSED',
      ]);
    });

    it('emits the checks stage so the display can show it', async () => {
      checksRunner.run.mockResolvedValueOnce(failing);
      const events: TicketRunEvent[] = [];

      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, undefined, {
        onEvent: (event) => events.push(event),
      });

      expect(events.filter((event) => event.phase === 'checks').map((event) => event.type)).toEqual(
        ['stage.started', 'stage.failed', 'stage.started', 'stage.completed'],
      );
    });
  });

  describe('protected paths', () => {
    const AEOS_DIR = path.join(PROJECT_PATH, '.aeos');
    const RUBRIC = 'rubrics/structure/code-structure.md';
    // What `git status` would list in each repository; an executor "touches" a
    // file by adding it here.
    let dirty: { project: string[]; aeos: string[] };
    const approved = {
      ok: true,
      artifactPath: '/tmp/artifact',
      content: `${'A '.repeat(60)}\n\n${reviewWith('APPROVED')}`,
      usage: { inputTokens: 1, outputTokens: 2, costUsd: 0.25 },
    };
    /** Makes the invocation of one role touch a file as it runs. */
    const touching = (
      role: 'worker' | 'reviewer',
      repo: 'project' | 'aeos',
      file: string,
    ): void => {
      (executor.run as ReturnType<typeof vi.fn>).mockImplementation(
        async (invocation: ExecutorInvocation) => {
          const isReview = invocation.outputPath.endsWith('-review.md');
          if (isReview === (role === 'reviewer')) dirty[repo].push(file);
          return approved;
        },
      );
    };
    const restored = (): unknown[][] =>
      (gitGateway.restoreFiles as ReturnType<typeof vi.fn>).mock.calls;

    beforeEach(() => {
      dirty = { project: [], aeos: [] };
      (gitGateway.changedFiles as ReturnType<typeof vi.fn>).mockImplementation((dir: string) => [
        ...(dir === AEOS_DIR ? dirty.aeos : dirty.project),
      ]);
      (executor.run as ReturnType<typeof vi.fn>).mockResolvedValue(approved);
    });

    it('fails the attempt, names the file and restores it when the worker edits a rubric', async () => {
      touching('worker', 'aeos', RUBRIC);

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result).toMatchObject({ status: 'failed' });
      expect((result as { error: string }).error).toContain(`.aeos/${RUBRIC}`);
      expect(restored()).toEqual([[AEOS_DIR, [RUBRIC]]]);
      expect(stateMachine.setSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'FAILED');
      // The reviewer is never asked, and nothing of the attempt is kept.
      expect(executor.run).toHaveBeenCalledTimes(1);
      expect(artifactStore.removeArtifact).toHaveBeenCalledWith(
        PROJECT_PATH,
        TICKET_ID,
        'AEOS-1-impl.md',
      );
    });

    it('writes the violation into the run record and still records what the run cost', async () => {
      touching('worker', 'aeos', RUBRIC);

      await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      const [worker] = writtenRuns();
      expect(worker!.record).toMatchObject({ role: 'worker', exit: 'failed', cost_usd: 0.25 });
      expect(worker!.record.error).toContain(`.aeos/${RUBRIC}`);
      expect(costRepo.record).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'worker', costUsd: 0.25 }),
      );
    });

    it('fails when the worker creates a file under column-specs', async () => {
      touching('worker', 'aeos', 'column-specs/extra.yaml');

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result).toMatchObject({ status: 'failed' });
      expect(restored()).toEqual([[AEOS_DIR, ['column-specs/extra.yaml']]]);
    });

    it('reports nothing when the worker edits src/ only', async () => {
      touching('worker', 'project', 'src/index.ts');

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result.status).toBe('success');
      expect(restored()).toEqual([]);
    });

    it('does not report a protected file that was already modified before the run', async () => {
      dirty.aeos.push(RUBRIC);

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result.status).toBe('success');
      expect(restored()).toEqual([]);
    });

    it('treats a configured glob as protected, in the project repository', async () => {
      protectedPaths = ['src/cli/generated/**'];
      touching('worker', 'project', 'src/cli/generated/commands.ts');

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result).toMatchObject({ status: 'failed' });
      expect((result as { error: string }).error).toContain('src/cli/generated/commands.ts');
      expect(restored()).toEqual([[PROJECT_PATH, ['src/cli/generated/commands.ts']]]);
    });

    it('fails, rather than escalates, when the reviewer touches a protected path', async () => {
      touching('reviewer', 'aeos', RUBRIC);

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result).toMatchObject({ status: 'failed' });
      expect((result as { error: string }).error).toContain(`.aeos/${RUBRIC}`);
      expect(restored()).toEqual([[AEOS_DIR, [RUBRIC]]]);
      const reviewer = writtenRuns().find((run) => run.record.role === 'reviewer')!;
      expect(reviewer.record.error).toContain(`.aeos/${RUBRIC}`);
    });

    it('fails the run when the preflight invocation touches a protected path', async () => {
      (preflight.run as ReturnType<typeof vi.fn>).mockImplementation(async (...args: unknown[]) => {
        dirty.aeos.push('agents/worker.yaml');
        // Only the wrapped executor's own window counts, so touch inside it.
        (executor.run as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
          dirty.aeos.push(RUBRIC);
          return { ok: true, artifactPath: '/tmp/p', content: 'NO_BLOCKERS' };
        });
        await (args[6] as Executor).run({
          prompt: 'preflight prompt',
          outputPath: '/tmp/preflight-AEOS-1.md',
          ticketId: TICKET_ID,
          column: 'IMPLEMENTATION',
        });
        return { blocked: false };
      });

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result).toMatchObject({ status: 'failed' });
      expect((result as { error: string }).error).toContain(`.aeos/${RUBRIC}`);
      // agents/worker.yaml changed outside the executor's window: not the run's doing.
      expect(restored()).toEqual([[AEOS_DIR, [RUBRIC]]]);
      expect(writtenRuns()[0]!.record).toMatchObject({ role: 'preflight', exit: 'failed' });
    });

    it('restores a protected path even when the executor throws', async () => {
      (executor.run as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        dirty.aeos.push(RUBRIC);
        throw new Error('boom');
      });

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result).toMatchObject({ status: 'failed' });
      expect(restored()).toEqual([[AEOS_DIR, [RUBRIC]]]);
    });

    it("does not count the engine's own run records, written after the executor returns", async () => {
      (runRecordStore.write as ReturnType<typeof vi.fn>).mockImplementation(
        (_projectPath: string, record: RunRecord) => {
          dirty.aeos.push(`tickets/${TICKET_ID}/runs/${record.run_id}.json`);
          return [`/runs/${record.run_id}.json`];
        },
      );

      const result = await useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);

      expect(result.status).toBe('success');
      expect(restored()).toEqual([]);
    });
  });
});
