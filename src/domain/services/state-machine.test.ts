import { describe, it, expect, vi } from 'vitest';
import { Column } from '../model/column.js';
import { SubState, type SubStateOrNull } from '../model/sub-state.js';
import type { Ticket } from '../model/ticket.js';
import type { TicketRepository } from '../ports/driven/ticket-repository.port.js';
import type {
  TransitionRecord,
  TransitionRepository,
} from '../ports/driven/transition-repository.port.js';
import { StateMachineService } from './state-machine.js';

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'PROJ-1',
    projectId: 'proj',
    title: 'Test ticket',
    column: Column.BACKLOG,
    subState: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createStubRepos(ticket: Ticket | null = null) {
  const recorded: TransitionRecord[] = [];
  const storedTicket = ticket ? { ...ticket } : null;

  const ticketRepo: TicketRepository = {
    nextId: vi.fn(() => 1),
    save: vi.fn(),
    deleteById: vi.fn(),
    findById: vi.fn(() => storedTicket),
    findByProject: vi.fn(() => (storedTicket ? [storedTicket] : [])),
    updateColumn: vi.fn((_p: string, _t: string, col: string) => {
      if (storedTicket) storedTicket.column = col as Ticket['column'];
    }),
    updateSubState: vi.fn((_p: string, _t: string, ss: SubStateOrNull) => {
      if (storedTicket) storedTicket.subState = ss;
    }),
  };

  const transitionRepo: TransitionRepository = {
    record: vi.fn((t: TransitionRecord) => recorded.push(t)),
  };

  return { ticketRepo, transitionRepo, recorded, getTicket: () => storedTicket };
}

describe('StateMachineService.transition()', () => {
  let svc: StateMachineService;
  let ticketRepo: TicketRepository;
  let recorded: TransitionRecord[];

  function setup(ticket: Ticket | null) {
    const stubs = createStubRepos(ticket);
    ticketRepo = stubs.ticketRepo;
    recorded = stubs.recorded;
    svc = new StateMachineService(stubs.ticketRepo, stubs.transitionRepo);
  }

  describe('ticket not found', () => {
    it('returns error when ticket does not exist', () => {
      setup(null);
      const result = svc.transition('proj', 'PROJ-999', Column.PRODUCT_SCOPING);
      expect(result).toEqual({ ok: false, reason: 'Ticket not found' });
    });
  });

  describe('same column', () => {
    it('rejects transition to the same column', () => {
      setup(makeTicket({ column: Column.QA }));
      const result = svc.transition('proj', 'PROJ-1', Column.QA);
      expect(result).toEqual({ ok: false, reason: 'Already in QA' });
    });
  });

  describe('forward transitions', () => {
    it('allows forward to adjacent column (BACKLOG -> PRODUCT_SCOPING)', () => {
      setup(makeTicket({ column: Column.BACKLOG }));
      const result = svc.transition('proj', 'PROJ-1', Column.PRODUCT_SCOPING);
      expect(result).toEqual({ ok: true });
      expect(ticketRepo.updateColumn).toHaveBeenCalledWith(
        'proj',
        'PROJ-1',
        Column.PRODUCT_SCOPING,
      );
    });

    it('rejects forward skip (BACKLOG -> TECH_SPEC)', () => {
      setup(makeTicket({ column: Column.BACKLOG }));
      const result = svc.transition('proj', 'PROJ-1', Column.TECH_SPEC);
      expect(result).toEqual({ ok: false, reason: 'Cannot transition from BACKLOG to TECH_SPEC' });
    });

    it('allows DOD_GATE -> DONE', () => {
      setup(makeTicket({ column: Column.DOD_GATE, subState: SubState.SIGNED_OFF }));
      const result = svc.transition('proj', 'PROJ-1', Column.DONE);
      expect(result).toEqual({ ok: true });
    });
  });

  describe('backward transitions', () => {
    it('allows backward one column (TECH_SPEC -> ARCH_SPIKE)', () => {
      setup(makeTicket({ column: Column.TECH_SPEC, subState: SubState.WORKING }));
      const result = svc.transition('proj', 'PROJ-1', Column.ARCH_SPIKE);
      expect(result).toEqual({ ok: true });
    });

    it('allows backward multiple columns (CODE_REVIEW -> PRODUCT_SCOPING)', () => {
      setup(makeTicket({ column: Column.CODE_REVIEW, subState: SubState.IN_REVIEW }));
      const result = svc.transition('proj', 'PROJ-1', Column.PRODUCT_SCOPING);
      expect(result).toEqual({ ok: true });
    });

    it('allows backward to BACKLOG and resets sub_state', () => {
      setup(makeTicket({ column: Column.TECH_SPEC, subState: SubState.WORKING }));
      const result = svc.transition('proj', 'PROJ-1', Column.BACKLOG);
      expect(result).toEqual({ ok: true });
      expect(ticketRepo.updateSubState).toHaveBeenCalledWith('proj', 'PROJ-1', null);
    });

    it('allows backward from DONE', () => {
      setup(makeTicket({ column: Column.DONE }));
      const result = svc.transition('proj', 'PROJ-1', Column.PRODUCT_SCOPING);
      expect(result).toEqual({ ok: true });
    });
  });

  describe('DONE terminal state', () => {
    it('rejects any forward from DONE (DONE is last column)', () => {
      // DONE is the last column — there is no forward target
      // Any column would be "backward" from DONE which is allowed
      // The only illegal case is same-column (DONE -> DONE)
      setup(makeTicket({ column: Column.DONE }));
      const result = svc.transition('proj', 'PROJ-1', Column.DONE);
      expect(result).toEqual({ ok: false, reason: 'Already in DONE' });
    });
  });

  describe('transition record', () => {
    it('records from_sub_state in transition', () => {
      setup(makeTicket({ column: Column.TECH_SPEC, subState: SubState.BLOCKED }));
      svc.transition('proj', 'PROJ-1', Column.IMPLEMENTATION);
      expect(recorded).toHaveLength(1);
      expect(recorded[0].fromSubState).toBe('BLOCKED');
      expect(recorded[0].toSubState).toBeNull();
    });

    it('records comment when provided', () => {
      setup(makeTicket({ column: Column.TECH_SPEC, subState: SubState.WORKING }));
      svc.transition('proj', 'PROJ-1', Column.BACKLOG, 'Scope too broad');
      expect(recorded).toHaveLength(1);
      expect(recorded[0].comment).toBe('Scope too broad');
    });

    it('records null comment when not provided', () => {
      setup(makeTicket({ column: Column.BACKLOG }));
      svc.transition('proj', 'PROJ-1', Column.PRODUCT_SCOPING);
      expect(recorded[0].comment).toBeNull();
    });
  });
});
