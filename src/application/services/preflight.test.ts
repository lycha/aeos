import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PreflightService } from './preflight.js';
import type { Executor } from '../../domain/ports/driven/executor.port.js';
import type { ArtifactStore } from '../../domain/ports/driven/artifact-store.port.js';
import type { StateMachineService } from '../../domain/services/state-machine.js';
import type { ColumnSpec } from '../../domain/model/column-spec.js';
import type { ExecutorResult } from '../../domain/model/executor-result.js';

function createMockExecutor(): Executor {
  return {
    run: vi.fn(),
    interrupt: vi.fn(),
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

function createMockStateMachine(): Pick<StateMachineService, 'setSubState'> {
  return {
    setSubState: vi.fn().mockReturnValue({ ok: true }),
  };
}

function makeColumnSpec(overrides: Partial<ColumnSpec> = {}): ColumnSpec {
  return {
    column: 'PRODUCT_SCOPING',
    workerAgentFile: 'agents/pm-agent.yaml',
    reviewerAgentFile: 'agents/reviewer-agent.yaml',
    outputArtifact: 'prd.md',
    minWordCount: 50,
    requiredSections: [],
    reviewerRubrics: [],
    maxIterations: 3,
    escalation: 'escalate_to_human',
    advanceMode: 'manual',
    preflight: { enabled: true, questionsArtifact: 'questions.md' },
    ...overrides,
  };
}

describe('PreflightService', () => {
  let executor: ReturnType<typeof createMockExecutor>;
  let artifactStore: ReturnType<typeof createMockArtifactStore>;
  let stateMachine: ReturnType<typeof createMockStateMachine>;
  let service: PreflightService;

  const TICKET_ID = 'AEOS-1';
  const PROJECT_ID = 'proj-1';
  const PROJECT_PATH = '/projects/test';
  const TICKET_CONTENT =
    '# Build a login page\nUsers should be able to log in with email and password.';

  beforeEach(() => {
    executor = createMockExecutor();
    artifactStore = createMockArtifactStore();
    stateMachine = createMockStateMachine();
    service = new PreflightService(
      executor,
      artifactStore,
      stateMachine as unknown as StateMachineService,
    );
  });

  it('returns { blocked: false } when preflight is disabled', async () => {
    const spec = makeColumnSpec({
      preflight: { enabled: false, questionsArtifact: 'questions.md' },
    });

    const result = await service.run(TICKET_ID, PROJECT_ID, PROJECT_PATH, TICKET_CONTENT, spec);

    expect(result).toEqual({ blocked: false });
    expect(executor.run).not.toHaveBeenCalled();
  });

  it('returns { blocked: false } when model responds NO_BLOCKERS', async () => {
    const executorResult: ExecutorResult = {
      ok: true,
      artifactPath: '/tmp/preflight-AEOS-1-uuid.md',
      content: 'NO_BLOCKERS',
    };
    (executor.run as ReturnType<typeof vi.fn>).mockResolvedValue(executorResult);

    const result = await service.run(
      TICKET_ID,
      PROJECT_ID,
      PROJECT_PATH,
      TICKET_CONTENT,
      makeColumnSpec(),
    );

    expect(result).toEqual({ blocked: false });
    expect(artifactStore.writeArtifact).not.toHaveBeenCalled();
    expect(stateMachine.setSubState).not.toHaveBeenCalled();
  });

  it('returns { blocked: false } when NO_BLOCKERS has surrounding whitespace', async () => {
    const executorResult: ExecutorResult = {
      ok: true,
      artifactPath: '/tmp/preflight.md',
      content: '  NO_BLOCKERS  \n',
    };
    (executor.run as ReturnType<typeof vi.fn>).mockResolvedValue(executorResult);

    const result = await service.run(
      TICKET_ID,
      PROJECT_ID,
      PROJECT_PATH,
      TICKET_CONTENT,
      makeColumnSpec(),
    );

    expect(result).toEqual({ blocked: false });
  });

  it('writes questions artifact and sets BLOCKED when model responds with questions', async () => {
    const questions = '1. What authentication provider?\n2. What error messages?';
    const executorResult: ExecutorResult = {
      ok: true,
      artifactPath: '/tmp/preflight.md',
      content: questions,
    };
    (executor.run as ReturnType<typeof vi.fn>).mockResolvedValue(executorResult);

    const result = await service.run(
      TICKET_ID,
      PROJECT_ID,
      PROJECT_PATH,
      TICKET_CONTENT,
      makeColumnSpec(),
    );

    expect(result).toEqual({ blocked: true, questionsPath: 'AEOS-1-questions.md' });
    expect(artifactStore.writeArtifact).toHaveBeenCalledWith(
      PROJECT_PATH,
      TICKET_ID,
      'AEOS-1-questions.md',
      questions,
    );
    expect(stateMachine.setSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'BLOCKED');
  });

  it('builds correct prompt with ticket content and output artifact', async () => {
    const executorResult: ExecutorResult = {
      ok: true,
      artifactPath: '/tmp/preflight.md',
      content: 'NO_BLOCKERS',
    };
    (executor.run as ReturnType<typeof vi.fn>).mockResolvedValue(executorResult);

    await service.run(TICKET_ID, PROJECT_ID, PROJECT_PATH, TICKET_CONTENT, makeColumnSpec());

    const invocation = (executor.run as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(invocation.prompt).toContain('[ROLE] You are a requirements analyst.');
    expect(invocation.prompt).toContain(TICKET_CONTENT);
    expect(invocation.prompt).toContain('prd.md');
    expect(invocation.prompt).toContain('NO_BLOCKERS');
    expect(invocation.ticketId).toBe(TICKET_ID);
    expect(invocation.column).toBe('PRODUCT_SCOPING');
  });

  it('throws when executor returns failure', async () => {
    const executorResult: ExecutorResult = { ok: false, reason: 'Model timeout' };
    (executor.run as ReturnType<typeof vi.fn>).mockResolvedValue(executorResult);

    await expect(
      service.run(TICKET_ID, PROJECT_ID, PROJECT_PATH, TICKET_CONTENT, makeColumnSpec()),
    ).rejects.toThrow('Preflight executor failed: Model timeout');
  });

  it('treats empty content as blocked (not NO_BLOCKERS)', async () => {
    const executorResult: ExecutorResult = {
      ok: true,
      artifactPath: '/tmp/preflight.md',
      content: '',
    };
    (executor.run as ReturnType<typeof vi.fn>).mockResolvedValue(executorResult);

    const result = await service.run(
      TICKET_ID,
      PROJECT_ID,
      PROJECT_PATH,
      TICKET_CONTENT,
      makeColumnSpec(),
    );

    // Empty string trimmed is '', which !== 'NO_BLOCKERS', so it writes artifact
    expect(result.blocked).toBe(true);
  });
});
