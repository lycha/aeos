import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TicketAnswerUseCase } from './ticket-answer.use-case.js';
import type { GateRecorder } from './services/gate-recorder.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type { StateMachineService } from '../domain/services/state-machine.js';
import type { Ticket } from '../domain/model/ticket.js';
import type { SpecAmendmentService } from './services/spec-amendment.service.js';
import type { DecisionPromotionService } from './services/decision-promotion.service.js';

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
    setContractChange: vi.fn(),
  };
}

function createMockArtifactStore(): ArtifactStore {
  return {
    artifactExists: vi.fn().mockReturnValue(true),
    readArtifact: vi.fn().mockReturnValue(''),
    getArtifactMtime: vi.fn().mockReturnValue(new Date('2025-01-01T12:00:00Z')),
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
    commitOf: vi.fn().mockReturnValue(null),
    showFile: vi.fn().mockReturnValue(''),
    pathChangedSince: vi.fn().mockReturnValue(false),
    userIdentity: vi.fn().mockReturnValue('Test <test@test.com>'),
    listFiles: vi.fn().mockReturnValue([]),
    diff: vi.fn().mockReturnValue(''),
  };
}

function createMockStateMachine() {
  // Only 'transition' and 'setSubState' are used by TicketAnswerUseCase
  const mock: Pick<StateMachineService, 'transition' | 'setSubState'> = {
    transition: vi.fn().mockReturnValue({ ok: true }),
    setSubState: vi.fn().mockReturnValue({ ok: true }),
  };
  return mock as unknown as StateMachineService;
}

function createMockDecisionPromotionService() {
  return {
    promote: vi.fn().mockReturnValue({
      status: 'promoted',
      decisionsPath: `${TICKET_ID}-decisions.md`,
      createdDecisionIds: ['D-001'],
      updatedDecisionIds: [],
      supersededDecisionIds: [],
      warnings: [],
    }),
  } as unknown as DecisionPromotionService;
}

// Shared by every describe below: the recorder is a mock, reset per test.
const gateRecorder = { decidedBy: vi.fn(), record: vi.fn() };
const recorder = gateRecorder as unknown as GateRecorder;
const specAmendment = { amend: vi.fn() };
const callOrder = (mock: unknown): number =>
  (mock as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
beforeEach(() => {
  gateRecorder.decidedBy.mockReset();
  gateRecorder.record.mockReset();
  specAmendment.amend
    .mockReset()
    .mockReturnValue({ ok: true, decisions: [{ absence: 'NEW-1', becomes: 'AC-2' }] });
});

const PROJECT_ID = 'startup-a';
const PROJECT_PATH = path.join(os.tmpdir(), 'aeos-test-project');
const TICKET_ID = 'AEOS-1';

function blockedTicket(updatedAt = '2025-01-01T10:00:00Z'): Ticket {
  return {
    id: TICKET_ID,
    projectId: PROJECT_ID,
    title: 'Test ticket',
    kind: 'EPIC',
    parentId: null,
    column: 'IMPLEMENTATION' as Ticket['column'],
    subState: 'BLOCKED',
    createdAt: '2025-01-01T09:00:00Z',
    updatedAt,
  };
}

describe('TicketAnswerUseCase', () => {
  let ticketRepo: ReturnType<typeof createMockTicketRepo>;
  let artifactStore: ReturnType<typeof createMockArtifactStore>;
  let gitGateway: ReturnType<typeof createMockGitGateway>;
  let stateMachine: ReturnType<typeof createMockStateMachine>;
  let decisionPromotionService: ReturnType<typeof createMockDecisionPromotionService>;
  let useCase: TicketAnswerUseCase;

  const defaultInput = { projectId: PROJECT_ID, projectPath: PROJECT_PATH, ticketId: TICKET_ID };

  beforeEach(() => {
    ticketRepo = createMockTicketRepo();
    artifactStore = createMockArtifactStore();
    gitGateway = createMockGitGateway();
    stateMachine = createMockStateMachine();
    decisionPromotionService = createMockDecisionPromotionService();
    useCase = new TicketAnswerUseCase(
      ticketRepo,
      artifactStore,
      stateMachine,
      gitGateway,
      decisionPromotionService,
      recorder,
      specAmendment as unknown as SpecAmendmentService,
    );
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(blockedTicket());
  });

  describe('spec-backed ticket', () => {
    const PIN = { repo: 'AEOS-aeos', commit: 'c0ffee1', path: 'features/checkout' };
    const pinned = { ...blockedTicket(), specPin: PIN };
    const answered = [{ id: 'Q-001', question: 'Night greeting?', answer: 'The same.' }];
    let promotion: { answered: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(pinned);
      promotion = decisionPromotionService as unknown as typeof promotion;
      promotion.answered = vi.fn().mockReturnValue(answered);
    });

    it('amends the spec, records an amendment gate, and stays BLOCKED with the repin instruction', () => {
      const result = useCase.execute(defaultInput);

      expect(specAmendment.amend).toHaveBeenCalledWith(PROJECT_PATH, pinned, PIN, answered);
      expect(result).toEqual({
        ok: true,
        ticketId: TICKET_ID,
        warnings: undefined,
        promoted: [`${TICKET_ID}-decisions.md`],
        specPin: pinned.specPin,
        amendedDecisions: ['NEW-1'],
      });
      expect(gateRecorder.record).toHaveBeenCalledExactlyOnceWith(PROJECT_PATH, pinned, {
        gate: 'amendment',
        verdict: 'approved',
        reason: 'Amended decisions.yaml of checkout: NEW-1 (AC-2).',
      });
      expect(stateMachine.setSubState).not.toHaveBeenCalled();
      expect(gitGateway.commitFiles).toHaveBeenCalledOnce();
    });

    it('writes nothing and stays BLOCKED when the amendment is refused', () => {
      specAmendment.amend.mockReturnValue({ ok: false, error: 'lint_decisions.py failed: bad' });

      expect(useCase.execute(defaultInput)).toEqual({
        ok: false,
        error: 'lint_decisions.py failed: bad',
      });
      expect(decisionPromotionService.promote).not.toHaveBeenCalled();
      expect(gateRecorder.record).not.toHaveBeenCalled();
      expect(stateMachine.setSubState).not.toHaveBeenCalled();
      expect(gitGateway.commitFiles).not.toHaveBeenCalled();
    });

    it('checks who is deciding before it amends', () => {
      gateRecorder.decidedBy.mockImplementation(() => {
        throw new Error('no git identity');
      });

      expect(() => useCase.execute(defaultInput)).toThrow('no git identity');
      expect(specAmendment.amend).not.toHaveBeenCalled();
    });

    it('reports a missing required answer without amending', () => {
      promotion.answered.mockImplementation(() => {
        throw new Error('Missing required answers for: Q-001');
      });

      expect(useCase.execute(defaultInput)).toEqual({
        ok: false,
        error: 'Missing required answers for: Q-001',
      });
      expect(specAmendment.amend).not.toHaveBeenCalled();
    });

    it('unblocks as before when the questions file is a legacy one', () => {
      promotion.answered.mockReturnValue(null);

      expect(useCase.execute(defaultInput)).toMatchObject({ ok: true });
      expect(specAmendment.amend).not.toHaveBeenCalled();
      expect(stateMachine.setSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'READY');
    });
  });

  it('never amends for a ticket with no spec', () => {
    useCase.execute(defaultInput);

    expect(specAmendment.amend).not.toHaveBeenCalled();
  });

  describe('gate record', () => {
    it('records the answer before the ticket is unblocked', () => {
      useCase.execute(defaultInput);

      expect(gateRecorder.record).toHaveBeenCalledExactlyOnceWith(PROJECT_PATH, blockedTicket(), {
        gate: 'answer',
        verdict: 'approved',
      });
      expect(callOrder(gateRecorder.record)).toBeLessThan(callOrder(stateMachine.setSubState));
    });

    it('leaves the ticket BLOCKED when the record cannot be written', () => {
      gateRecorder.record.mockImplementation(() => {
        throw new Error('disk full');
      });

      expect(() => useCase.execute(defaultInput)).toThrow('disk full');
      expect(stateMachine.setSubState).not.toHaveBeenCalled();
    });

    it('records nothing for a ticket that is not blocked', () => {
      (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue({
        ...blockedTicket(),
        subState: 'READY',
      });

      expect(useCase.execute(defaultInput).ok).toBe(false);
      expect(gateRecorder.record).not.toHaveBeenCalled();
    });
  });

  it('should unblock a BLOCKED ticket with modified questions file', () => {
    const result = useCase.execute(defaultInput);
    expect(result).toEqual({
      ok: true,
      ticketId: TICKET_ID,
      warnings: undefined,
      promoted: [`${TICKET_ID}-decisions.md`],
      specPin: null,
    });
  });

  it('should call setSubState with READY', () => {
    useCase.execute(defaultInput);
    expect(stateMachine.setSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'READY');
  });

  it('should promote answered questions before setting READY', () => {
    useCase.execute(defaultInput);

    expect(decisionPromotionService.promote).toHaveBeenCalledWith({
      projectPath: PROJECT_PATH,
      ticketId: TICKET_ID,
      stage: 'IMPLEMENTATION',
      settledBy: 'human',
    });
    const promoteOrder = (decisionPromotionService.promote as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    const setSubStateOrder = (stateMachine.setSubState as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    expect(promoteOrder).toBeLessThan(setSubStateOrder);
  });

  it('should commit the answered questions file', () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue(
      '# Ticket: AEOS-1\n\n## Title\nTest',
    );
    useCase.execute(defaultInput);
    expect(gitGateway.commitFiles).toHaveBeenCalledWith(
      path.join(PROJECT_PATH, '.aeos'),
      [
        // Artifacts only — the ticket document is state and is no longer committed.
        path.join(PROJECT_PATH, '.aeos', 'tickets', TICKET_ID, `${TICKET_ID}-questions.md`),
        path.join(PROJECT_PATH, '.aeos', 'tickets', TICKET_ID, `${TICKET_ID}-decisions.md`),
      ],
      `[${TICKET_ID}][QUESTIONS][v1][human][answered]`,
    );
  });

  it('should update the ticket document metadata to READY before commit', () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue(
      '# Ticket: AEOS-1\n\n## Title\nTest',
    );
    useCase.execute(defaultInput);
    expect(artifactStore.writeArtifact).toHaveBeenCalledWith(
      PROJECT_PATH,
      TICKET_ID,
      `${TICKET_ID}-ticket.md`,
      expect.stringContaining('- Sub-state: READY'),
    );
  });

  it('should return error when ticket is not found', () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const result = useCase.execute(defaultInput);
    expect(result).toEqual({ ok: false, error: `Ticket ${TICKET_ID} not found` });
  });

  it('should return error when ticket is not BLOCKED', () => {
    const ticket = blockedTicket();
    ticket.subState = 'WORKING';
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(ticket);
    const result = useCase.execute(defaultInput);
    expect(result).toMatchObject({ ok: false });
    expect('error' in result && result.error).toContain('not blocked');
  });

  it('should return error when questions file does not exist', () => {
    (artifactStore.artifactExists as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const result = useCase.execute(defaultInput);
    expect(result).toMatchObject({ ok: false });
    expect('error' in result && result.error).toContain('Questions file not found');
  });

  it('should return needsConfirmation when file is not modified', () => {
    // mtime <= updatedAt → unmodified
    (artifactStore.getArtifactMtime as ReturnType<typeof vi.fn>).mockReturnValue(
      new Date('2025-01-01T09:00:00Z'),
    );
    const result = useCase.execute(defaultInput);
    expect(result).toEqual({
      ok: false,
      needsConfirmation: true,
      reason: 'questions file not modified',
    });
  });

  it('should skip mtime check when confirmed is true', () => {
    (artifactStore.getArtifactMtime as ReturnType<typeof vi.fn>).mockReturnValue(
      new Date('2025-01-01T09:00:00Z'),
    );
    const result = useCase.execute({ ...defaultInput, confirmed: true });
    expect(result).toEqual({
      ok: true,
      ticketId: TICKET_ID,
      warnings: undefined,
      promoted: [`${TICKET_ID}-decisions.md`],
      specPin: null,
    });
  });

  it('should return warning and skip decisions commit when promotion is legacy-skipped', () => {
    (decisionPromotionService.promote as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'legacy-skipped',
      decisionsPath: null,
      createdDecisionIds: [],
      updatedDecisionIds: [],
      supersededDecisionIds: [],
      warnings: ['Questions file is legacy or unsupported; skipped decision promotion.'],
      promoted: [],
      specPin: null,
    });

    const result = useCase.execute(defaultInput);

    expect(result).toEqual({
      ok: true,
      ticketId: TICKET_ID,
      warnings: ['Questions file is legacy or unsupported; skipped decision promotion.'],
      promoted: [],
      specPin: null,
    });
    expect(gitGateway.commitFiles).toHaveBeenCalledWith(
      path.join(PROJECT_PATH, '.aeos'),
      [path.join(PROJECT_PATH, '.aeos', 'tickets', TICKET_ID, `${TICKET_ID}-questions.md`)],
      `[${TICKET_ID}][QUESTIONS][v1][human][answered]`,
    );
  });

  it('should return error and keep ticket blocked when promotion validation fails', () => {
    (decisionPromotionService.promote as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'validation-error',
      decisionsPath: null,
      createdDecisionIds: [],
      updatedDecisionIds: [],
      supersededDecisionIds: [],
      warnings: [],
      error: 'Missing required answers for: Q-001',
    });

    const result = useCase.execute(defaultInput);

    expect(result).toEqual({ ok: false, error: 'Missing required answers for: Q-001' });
    expect(stateMachine.setSubState).not.toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'READY');
    expect(gitGateway.commitFiles).not.toHaveBeenCalled();
  });

  it('should revert sub-state to BLOCKED when git commit fails', () => {
    (gitGateway.commitFiles as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('git commit failed');
    });
    expect(() => useCase.execute(defaultInput)).toThrow('git commit failed');
    expect(stateMachine.setSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'BLOCKED');
  });

  it('should return error when ticket subState is null', () => {
    const ticket = blockedTicket();
    ticket.subState = null;
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(ticket);
    const result = useCase.execute(defaultInput);
    expect(result).toMatchObject({ ok: false });
    expect('error' in result && result.error).toContain('not blocked');
  });
});
