import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TicketApproveUseCase } from './ticket-approve.use-case.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
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
  };
}

function createMockStateMachine() {
  const mock: Pick<StateMachineService, 'transition' | 'setSubState'> = {
    transition: vi.fn().mockReturnValue({ ok: true }),
    setSubState: vi.fn().mockReturnValue({ ok: true }),
  };
  return mock as unknown as StateMachineService;
}

const PROJECT_ID = 'startup-a';
const PROJECT_PATH = path.join(os.tmpdir(), 'aeos-test-project');
const TICKET_ID = 'AEOS-1';

function signedOffTicket(column: Ticket['column'] = 'PRODUCT_SCOPING'): Ticket {
  return {
    id: TICKET_ID,
    projectId: PROJECT_ID,
    title: 'Test ticket',
    column,
    subState: 'SIGNED_OFF',
    createdAt: '2025-01-01T09:00:00Z',
    updatedAt: '2025-01-01T10:00:00Z',
  };
}

describe('TicketApproveUseCase', () => {
  let ticketRepo: ReturnType<typeof createMockTicketRepo>;
  let gitGateway: ReturnType<typeof createMockGitGateway>;
  let stateMachine: ReturnType<typeof createMockStateMachine>;
  let useCase: TicketApproveUseCase;

  beforeEach(() => {
    ticketRepo = createMockTicketRepo();
    gitGateway = createMockGitGateway();
    stateMachine = createMockStateMachine();
    useCase = new TicketApproveUseCase(ticketRepo, stateMachine, gitGateway);
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(signedOffTicket());
  });

  it('should advance a SIGNED_OFF ticket to the next column', () => {
    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);
    expect(result).toEqual({
      status: 'advanced',
      ticketId: TICKET_ID,
      fromColumn: 'PRODUCT_SCOPING',
      toColumn: 'ARCH_SPIKE',
    });
  });

  it('should call transition with the next column', () => {
    useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);
    expect(stateMachine.transition).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'ARCH_SPIKE');
  });

  it('should set sub-state to BLOCKED after advancing', () => {
    useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);
    expect(stateMachine.setSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'BLOCKED');
  });

  it('should commit approval to git with correct message', () => {
    useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);
    expect(gitGateway.commit).toHaveBeenCalledWith(
      path.join(PROJECT_PATH, '.aeos'),
      `[${TICKET_ID}][HUMAN][v1][advance: PRODUCT_SCOPING → ARCH_SPIKE]`,
    );
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
      error: `Ticket ${TICKET_ID} is not signed off (current state: WORKING). Only signed-off tickets can be approved.`,
    });
  });

  it('should return error with "no sub-state" for BACKLOG ticket with null sub-state', () => {
    const ticket = signedOffTicket('BACKLOG');
    ticket.subState = null;
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(ticket);
    const result = useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID);
    expect(result).toEqual({
      status: 'error',
      ticketId: TICKET_ID,
      error: `Ticket ${TICKET_ID} is not signed off (current state: BACKLOG (no sub-state)). Only signed-off tickets can be approved.`,
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
      error: 'Failed to set BLOCKED state: Cannot set sub-state on a BACKLOG ticket',
    });
  });

  it('should compensate on git commit failure by reverting column and sub-state', () => {
    (gitGateway.commit as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('git commit failed');
    });
    expect(() => useCase.execute(PROJECT_ID, PROJECT_PATH, TICKET_ID)).toThrow('git commit failed');
    expect(stateMachine.transition).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'PRODUCT_SCOPING');
    expect(stateMachine.setSubState).toHaveBeenCalledWith(PROJECT_ID, TICKET_ID, 'SIGNED_OFF');
  });
});
