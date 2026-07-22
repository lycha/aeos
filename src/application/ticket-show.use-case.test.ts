import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TicketShowUseCase } from './ticket-show.use-case.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { CostRepository } from '../domain/ports/driven/cost-repository.port.js';
import type { Ticket } from '../domain/model/ticket.js';

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
    artifactExists: vi.fn().mockReturnValue(false),
    readArtifact: vi.fn().mockReturnValue(''),
    getArtifactMtime: vi.fn().mockReturnValue(null),
    writeArtifact: vi.fn(),
    removeArtifact: vi.fn(),
    listArtifacts: vi.fn().mockReturnValue([]),
  };
}

function createMockCostRepo(): CostRepository {
  return {
    record: vi.fn(),
    findByProject: vi.fn().mockReturnValue([]),
    findByTicket: vi.fn().mockReturnValue([]),
  };
}

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'AEOS-1',
    projectId: 'proj-1',
    title: 'Add rate limiting',
    kind: 'EPIC',
    parentId: null,
    column: 'PRODUCT_SCOPING',
    subState: 'WORKING',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('TicketShowUseCase', () => {
  let ticketRepo: ReturnType<typeof createMockTicketRepo>;
  let artifactStore: ReturnType<typeof createMockArtifactStore>;
  let costRepo: ReturnType<typeof createMockCostRepo>;
  let useCase: TicketShowUseCase;

  const defaultInput = {
    projectId: 'proj-1',
    ticketId: 'AEOS-1',
    projectPath: '/test/project',
  };

  beforeEach(() => {
    ticketRepo = createMockTicketRepo();
    artifactStore = createMockArtifactStore();
    costRepo = createMockCostRepo();
    useCase = new TicketShowUseCase(ticketRepo, artifactStore, costRepo);
  });

  it('should return ticket and artifacts when ticket exists', () => {
    const ticket = makeTicket();
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(ticket);
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue([
      'AEOS-1-ticket.md',
      'AEOS-1-prd.md',
    ]);

    const result = useCase.execute(defaultInput);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ticket).toEqual(ticket);
      expect(result.artifacts).toEqual(['AEOS-1-ticket.md', 'AEOS-1-prd.md']);
      expect(result.executions).toEqual([]);
    }
  });

  it('should call findById with projectId and ticketId', () => {
    const ticket = makeTicket();
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(ticket);

    useCase.execute(defaultInput);

    expect(ticketRepo.findById).toHaveBeenCalledWith('proj-1', 'AEOS-1');
  });

  it('should call listArtifacts with projectPath and canonical ticket ID', () => {
    const ticket = makeTicket({ id: 'AEOS-1' });
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(ticket);

    useCase.execute(defaultInput);

    expect(artifactStore.listArtifacts).toHaveBeenCalledWith('/test/project', 'AEOS-1');
  });

  it('should return NOT_FOUND when ticket does not exist', () => {
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const result = useCase.execute(defaultInput);

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('should return empty artifacts array when no artifacts exist', () => {
    const ticket = makeTicket();
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(ticket);
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue([]);

    const result = useCase.execute(defaultInput);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.artifacts).toEqual([]);
      expect(result.executions).toEqual([]);
    }
  });

  it('should preserve null subState from ticket', () => {
    const ticket = makeTicket({ subState: null, column: 'BACKLOG' });
    (ticketRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(ticket);

    const result = useCase.execute(defaultInput);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ticket.subState).toBeNull();
    }
  });
});
