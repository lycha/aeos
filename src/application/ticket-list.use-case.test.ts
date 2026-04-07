import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TicketListUseCase } from './ticket-list.use-case.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
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

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'AEOS-1',
    projectId: 'proj-1',
    title: 'Test ticket',
    column: 'BACKLOG',
    subState: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('TicketListUseCase', () => {
  let ticketRepo: ReturnType<typeof createMockTicketRepo>;
  let useCase: TicketListUseCase;

  beforeEach(() => {
    ticketRepo = createMockTicketRepo();
    useCase = new TicketListUseCase(ticketRepo);
  });

  it('should return empty array when no tickets exist', () => {
    const result = useCase.execute({ projectId: 'proj-1' });

    expect(result).toEqual([]);
    expect(ticketRepo.findByProject).toHaveBeenCalledWith('proj-1', undefined);
  });

  it('should return tickets from the repository', () => {
    const tickets = [
      makeTicket({ id: 'AEOS-1', title: 'First' }),
      makeTicket({ id: 'AEOS-2', title: 'Second', column: 'PRODUCT_SCOPING', subState: 'WORKING' }),
    ];
    (ticketRepo.findByProject as ReturnType<typeof vi.fn>).mockReturnValue(tickets);

    const result = useCase.execute({ projectId: 'proj-1' });

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('AEOS-1');
    expect(result[1].id).toBe('AEOS-2');
  });

  it('should pass column filter to the repository', () => {
    useCase.execute({ projectId: 'proj-1', columnFilter: 'BACKLOG' });

    expect(ticketRepo.findByProject).toHaveBeenCalledWith('proj-1', 'BACKLOG');
  });

  it('should return tickets with null subState intact', () => {
    const tickets = [makeTicket({ subState: null })];
    (ticketRepo.findByProject as ReturnType<typeof vi.fn>).mockReturnValue(tickets);

    const result = useCase.execute({ projectId: 'proj-1' });

    expect(result[0].subState).toBeNull();
  });

  it('should preserve numeric sort order from repository', () => {
    const tickets = [
      makeTicket({ id: 'AEOS-1' }),
      makeTicket({ id: 'AEOS-2' }),
      makeTicket({ id: 'AEOS-10' }),
      makeTicket({ id: 'AEOS-11' }),
    ];
    (ticketRepo.findByProject as ReturnType<typeof vi.fn>).mockReturnValue(tickets);

    const result = useCase.execute({ projectId: 'proj-1' });

    expect(result.map((t) => t.id)).toEqual(['AEOS-1', 'AEOS-2', 'AEOS-10', 'AEOS-11']);
  });
});
