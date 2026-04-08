import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import { TicketDodApproveUseCase } from './ticket-dod-approve.use-case.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type { CostRepository } from '../domain/ports/driven/cost-repository.port.js';
import type { StateMachineService } from '../domain/services/state-machine.js';
import type { Ticket } from '../domain/model/ticket.js';

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

function createMockGitGateway(): GitGateway {
  return {
    init: vi.fn(),
    commit: vi.fn(),
    commitFiles: vi.fn(),
    diff: vi.fn().mockReturnValue(''),
  };
}

function createMockStateMachine() {
  const mock: Pick<StateMachineService, 'transition' | 'setSubState'> = {
    transition: vi.fn().mockReturnValue({ ok: true }),
    setSubState: vi.fn().mockReturnValue({ ok: true }),
  };
  return mock as unknown as StateMachineService;
}

function createMockCostRepo(): CostRepository {
  return {
    record: vi.fn(),
    findByProject: vi.fn().mockReturnValue([]),
    findByTicket: vi.fn().mockReturnValue([]),
  };
}

const PROJECT_ID = 'startup-a';
const PROJECT_PATH = path.join(os.tmpdir(), 'aeos-test-project');
const TICKET_ID = 'AEOS-1';

function dodGateTicket(): Ticket {
  return {
    id: TICKET_ID,
    projectId: PROJECT_ID,
    title: 'Test ticket',
    column: 'DOD_GATE',
    subState: 'SIGNED_OFF',
    createdAt: '2025-01-01T09:00:00Z',
    updatedAt: '2025-01-01T10:00:00Z',
  };
}

describe('TicketDodApproveUseCase', () => {
  let ticketRepo: ReturnType<typeof createMockTicketRepo>;
  let gitGateway: ReturnType<typeof createMockGitGateway>;
  let stateMachine: ReturnType<typeof createMockStateMachine>;
  let costRepo: ReturnType<typeof createMockCostRepo>;
  let useCase: TicketDodApproveUseCase;

  beforeEach(() => {
    ticketRepo = createMockTicketRepo();
    gitGateway = createMockGitGateway();
    stateMachine = createMockStateMachine();
    costRepo = createMockCostRepo();
    useCase = new TicketDodApproveUseCase(ticketRepo, stateMachine, gitGateway, costRepo);
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(dodGateTicket());
  });

  it('should approve a DOD_GATE ticket and return approved status with total cost', () => {
    (costRepo.findByTicket as ReturnType<typeof vi.fn>).mockReturnValue([
      { costUsd: 0.05 },
      { costUsd: 0.1 },
    ]);
    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true);
    expect(result.status).toBe('approved');
    expect(result.ticketId).toBe(TICKET_ID);
    if (result.status === 'approved') {
      expect(result.totalCostUsd).toBeCloseTo(0.15, 10);
    }
  });

  it('should transition column to DONE on approval', () => {
    useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true);
    expect(stateMachine.transition).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'DONE');
  });

  it('should set sub-state to null (terminal) on approval', () => {
    useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true);
    expect(ticketRepo.updateSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, null);
  });

  it('should commit approval to git with correct message', () => {
    useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true);
    expect(gitGateway.commit).toHaveBeenCalledWith(
      path.join(PROJECT_PATH, '.aeos'),
      `[${TICKET_ID}][HUMAN][v1][dod-approve: DOD_GATE → DONE]`,
    );
  });

  it('should return cancelled when not approved', () => {
    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, false);
    expect(result).toEqual({ status: 'cancelled', ticketId: TICKET_ID });
  });

  it('should not transition or commit when not approved', () => {
    useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, false);
    expect(stateMachine.transition).not.toHaveBeenCalled();
    expect(gitGateway.commit).not.toHaveBeenCalled();
  });

  it('should return error when ticket is not found', () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true);
    expect(result).toEqual({
      status: 'error',
      ticketId: TICKET_ID,
      error: `Ticket ${TICKET_ID} not found`,
    });
  });

  it('should return error when ticket is not in DOD_GATE column', () => {
    const ticket = dodGateTicket();
    ticket.column = 'QA';
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(ticket);
    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true);
    expect(result).toEqual({
      status: 'error',
      ticketId: TICKET_ID,
      error: `Ticket ${TICKET_ID} is not in DOD_GATE (current column: QA). Only DOD_GATE tickets can be approved via dod-approve.`,
    });
  });

  it('should return error when transition fails', () => {
    (stateMachine.transition as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: false,
      reason: 'Cannot transition',
    });
    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true);
    expect(result).toEqual({
      status: 'error',
      ticketId: TICKET_ID,
      error: 'Cannot transition',
    });
  });

  it('should compensate on git commit failure by reverting column and sub-state', () => {
    (gitGateway.commit as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('git commit failed');
    });
    expect(() => useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true)).toThrow(
      'git commit failed',
    );
    // Should revert to DOD_GATE
    expect(stateMachine.transition).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'DOD_GATE');
    // Should restore previous sub-state
    expect(stateMachine.setSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'SIGNED_OFF');
  });

  it('should return zero total cost when no cost records exist', () => {
    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true);
    expect(result).toEqual({
      status: 'approved',
      ticketId: TICKET_ID,
      totalCostUsd: 0,
    });
  });

  it('should return error when ticket is in BACKLOG column', () => {
    const ticket = dodGateTicket();
    ticket.column = 'BACKLOG';
    ticket.subState = null;
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(ticket);
    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true);
    expect(result).toEqual({
      status: 'error',
      ticketId: TICKET_ID,
      error: `Ticket ${TICKET_ID} is not in DOD_GATE (current column: BACKLOG). Only DOD_GATE tickets can be approved via dod-approve.`,
    });
  });

  it('should return error when ticket is already DONE', () => {
    const ticket = dodGateTicket();
    ticket.column = 'DONE';
    ticket.subState = null;
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(ticket);
    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID, true);
    expect(result).toEqual({
      status: 'error',
      ticketId: TICKET_ID,
      error: `Ticket ${TICKET_ID} is not in DOD_GATE (current column: DONE). Only DOD_GATE tickets can be approved via dod-approve.`,
    });
  });
});
