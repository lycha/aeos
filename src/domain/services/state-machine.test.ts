import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Column, COLUMN_ORDER } from '../model/column.js';
import { SubState } from '../model/sub-state.js';
import type { SubStateOrNull } from '../model/sub-state.js';
import type { Ticket } from '../model/ticket.js';
import type { TicketRepository } from '../ports/driven/ticket-repository.port.js';
import type {
  TransitionRecord,
  TransitionRepository,
} from '../ports/driven/transition-repository.port.js';
import { StateMachineService } from './state-machine.js';

// ---------------------------------------------------------------------------
// Stub ports (in-memory, no SQLite dependency)
// ---------------------------------------------------------------------------

class StubTicketRepository implements TicketRepository {
  private store = new Map<string, Ticket>();
  private counters = new Map<string, number>();

  private key(projectId: string, ticketId: string): string {
    return `${projectId}:${ticketId}`;
  }

  nextId(projectId: string): number {
    const current = this.counters.get(projectId) ?? 0;
    const next = current + 1;
    this.counters.set(projectId, next);
    return next;
  }

  save(ticket: Ticket): void {
    this.store.set(this.key(ticket.projectId, ticket.id), { ...ticket });
  }

  deleteById(projectId: string, ticketId: string): void {
    this.store.delete(this.key(projectId, ticketId));
  }

  findById(projectId: string, ticketId: string): Ticket | null {
    const ticket = this.store.get(this.key(projectId, ticketId));
    return ticket ? { ...ticket } : null;
  }

  findByProject(projectId: string, columnFilter?: Column): Ticket[] {
    const results: Ticket[] = [];
    for (const ticket of this.store.values()) {
      if (ticket.projectId !== projectId) continue;
      if (columnFilter && ticket.column !== columnFilter) continue;
      results.push(ticket);
    }
    return results;
  }

  updateColumn(projectId: string, ticketId: string, column: Column): void {
    const ticket = this.findById(projectId, ticketId);
    if (ticket) {
      ticket.column = column;
      ticket.updatedAt = new Date().toISOString();
      this.store.set(this.key(projectId, ticketId), ticket);
    }
  }

  updateSubState(projectId: string, ticketId: string, subState: SubStateOrNull): void {
    const ticket = this.findById(projectId, ticketId);
    if (ticket) {
      ticket.subState = subState;
      ticket.updatedAt = new Date().toISOString();
      this.store.set(this.key(projectId, ticketId), ticket);
    }
  }

  createAtomic(projectId: string, buildTicket: (nextNum: number) => Ticket): Ticket {
    const nextNum = this.nextId(projectId);
    const ticket = buildTicket(nextNum);
    this.save(ticket);
    return ticket;
  }
}

class StubTransitionRepository implements TransitionRepository {
  readonly records: TransitionRecord[] = [];

  record(transition: TransitionRecord): void {
    this.records.push(transition);
  }

  findByTicket(projectId: string, ticketId: string): TransitionRecord[] {
    return this.records.filter((r) => r.projectId === projectId && r.ticketId === ticketId);
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const PROJECT_ID = 'test-proj';

function seedTicket(
  repo: StubTicketRepository,
  overrides: Partial<{
    id: string;
    projectId: string;
    column: Column;
    subState: SubStateOrNull;
  }> = {},
): void {
  const ticket: Ticket = {
    id: overrides.id ?? 'T-1',
    projectId: overrides.projectId ?? PROJECT_ID,
    title: 'Test ticket',
    column: overrides.column ?? Column.BACKLOG,
    subState: overrides.subState ?? null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  repo.save(ticket);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StateMachineService', () => {
  let ticketRepo: StubTicketRepository;
  let transitionRepo: StubTransitionRepository;
  let stateMachine: StateMachineService;

  beforeEach(() => {
    ticketRepo = new StubTicketRepository();
    transitionRepo = new StubTransitionRepository();
    stateMachine = new StateMachineService(ticketRepo, transitionRepo);
  });

  // =========================================================================
  // Legal forward transitions
  // =========================================================================
  describe('legal forward transitions', () => {
    const FORWARD_PAIRS = COLUMN_ORDER.flatMap((from, fromIndex) =>
      COLUMN_ORDER.slice(fromIndex + 1).map((to) => [from, to] as [Column, Column]),
    );

    it.each(FORWARD_PAIRS)('allows forward %s → %s', (from, to) => {
      seedTicket(ticketRepo, {
        column: from,
        subState: from === Column.BACKLOG ? null : SubState.WORKING,
      });
      const result = stateMachine.transition(PROJECT_ID, 'T-1', to);
      expect(result).toEqual({ ok: true });

      const ticket = ticketRepo.findById(PROJECT_ID, 'T-1')!;
      expect(ticket.column).toBe(to);
    });
  });

  // =========================================================================
  // Legal backward transitions
  // =========================================================================
  describe('legal backward transitions', () => {
    it('allows backward one column (TECH_SPEC → ARCH_SPIKE)', () => {
      seedTicket(ticketRepo, { column: Column.TECH_SPEC, subState: SubState.WORKING });
      const result = stateMachine.transition(PROJECT_ID, 'T-1', Column.ARCH_SPIKE);
      expect(result).toEqual({ ok: true });
    });

    it('allows backward multiple columns (CODE_REVIEW → PRODUCT_SCOPING)', () => {
      seedTicket(ticketRepo, { column: Column.CODE_REVIEW, subState: SubState.IN_REVIEW });
      const result = stateMachine.transition(PROJECT_ID, 'T-1', Column.PRODUCT_SCOPING);
      expect(result).toEqual({ ok: true });
    });

    it('allows backward to BACKLOG from any column', () => {
      seedTicket(ticketRepo, { column: Column.IMPLEMENTATION, subState: SubState.WORKING });
      const result = stateMachine.transition(PROJECT_ID, 'T-1', Column.BACKLOG);
      expect(result).toEqual({ ok: true });
    });

    it('allows backward from DONE to any prior column', () => {
      seedTicket(ticketRepo, { column: Column.DONE });
      const result = stateMachine.transition(PROJECT_ID, 'T-1', Column.PRODUCT_SCOPING);
      expect(result).toEqual({ ok: true });
    });

    it('resets sub_state to null when moving backward to BACKLOG', () => {
      seedTicket(ticketRepo, { column: Column.TECH_SPEC, subState: SubState.WORKING });
      stateMachine.transition(PROJECT_ID, 'T-1', Column.BACKLOG);
      const ticket = ticketRepo.findById(PROJECT_ID, 'T-1')!;
      expect(ticket.subState).toBeNull();
    });

    it('does NOT reset sub_state when moving backward to non-BACKLOG column', () => {
      seedTicket(ticketRepo, { column: Column.TECH_SPEC, subState: SubState.WORKING });
      stateMachine.transition(PROJECT_ID, 'T-1', Column.ARCH_SPIKE);
      const ticket = ticketRepo.findById(PROJECT_ID, 'T-1')!;
      // sub_state is retained — caller must explicitly call setSubState()
      expect(ticket.subState).toBe(SubState.WORKING);
    });
  });

  // =========================================================================
  // Illegal transitions
  // =========================================================================
  describe('illegal transitions', () => {
    it('rejects same-column transition', () => {
      seedTicket(ticketRepo, { column: Column.QA, subState: SubState.WORKING });
      const result = stateMachine.transition(PROJECT_ID, 'T-1', Column.QA);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('Already in QA');
    });

    it('rejects forward from DONE (terminal state)', () => {
      // DONE is the last column — there is no column after it.
      // The only "forward" attempt is same-column DONE → DONE.
      seedTicket(ticketRepo, { column: Column.DONE });
      const result = stateMachine.transition(PROJECT_ID, 'T-1', Column.DONE);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('Already in DONE');
    });

    it('rejects transition on a non-existent ticket', () => {
      const result = stateMachine.transition(PROJECT_ID, 'NOPE-1', Column.PRODUCT_SCOPING);
      expect(result).toEqual({ ok: false, reason: 'Ticket not found' });
    });
  });

  // =========================================================================
  // Transition comments
  // =========================================================================
  describe('transition comments', () => {
    it('persists comment "Scope too broad" in the transition row', () => {
      seedTicket(ticketRepo, { column: Column.TECH_SPEC, subState: SubState.WORKING });
      stateMachine.transition(PROJECT_ID, 'T-1', Column.BACKLOG, 'Scope too broad');
      expect(transitionRepo.records).toHaveLength(1);
      expect(transitionRepo.records[0].comment).toBe('Scope too broad');
    });

    it('leaves comment as null when not provided', () => {
      seedTicket(ticketRepo, { column: Column.BACKLOG });
      stateMachine.transition(PROJECT_ID, 'T-1', Column.PRODUCT_SCOPING);
      expect(transitionRepo.records).toHaveLength(1);
      expect(transitionRepo.records[0].comment).toBeNull();
    });
  });

  // =========================================================================
  // Transition audit trail
  // =========================================================================
  describe('transition audit trail', () => {
    it('records from_sub_state reflecting the ticket sub-state before the move', () => {
      seedTicket(ticketRepo, { column: Column.TECH_SPEC, subState: SubState.BLOCKED });
      stateMachine.transition(PROJECT_ID, 'T-1', Column.IMPLEMENTATION);
      expect(transitionRepo.records).toHaveLength(1);
      expect(transitionRepo.records[0].fromSubState).toBe(SubState.BLOCKED);
    });

    it('records to_sub_state as null after BACKLOG reset', () => {
      seedTicket(ticketRepo, { column: Column.ARCH_SPIKE, subState: SubState.WORKING });
      stateMachine.transition(PROJECT_ID, 'T-1', Column.BACKLOG);
      expect(transitionRepo.records).toHaveLength(1);
      expect(transitionRepo.records[0].toSubState).toBeNull();
    });
  });

  // =========================================================================
  // Sub-state lifecycle
  // =========================================================================
  describe('sub-state lifecycle', () => {
    it('sequences BLOCKED → WORKING → IN_REVIEW → SIGNED_OFF', () => {
      seedTicket(ticketRepo, { column: Column.IMPLEMENTATION, subState: null });

      const r1 = stateMachine.setSubState(PROJECT_ID, 'T-1', SubState.BLOCKED);
      expect(r1).toEqual({ ok: true });
      expect(ticketRepo.findById(PROJECT_ID, 'T-1')!.subState).toBe(SubState.BLOCKED);

      const r2 = stateMachine.setSubState(PROJECT_ID, 'T-1', SubState.WORKING);
      expect(r2).toEqual({ ok: true });
      expect(ticketRepo.findById(PROJECT_ID, 'T-1')!.subState).toBe(SubState.WORKING);

      const r3 = stateMachine.setSubState(PROJECT_ID, 'T-1', SubState.IN_REVIEW);
      expect(r3).toEqual({ ok: true });
      expect(ticketRepo.findById(PROJECT_ID, 'T-1')!.subState).toBe(SubState.IN_REVIEW);

      const r4 = stateMachine.setSubState(PROJECT_ID, 'T-1', SubState.SIGNED_OFF);
      expect(r4).toEqual({ ok: true });
      expect(ticketRepo.findById(PROJECT_ID, 'T-1')!.subState).toBe(SubState.SIGNED_OFF);
    });

    it('sequences READY → WORKING → IN_REVIEW → SIGNED_OFF', () => {
      seedTicket(ticketRepo, { column: Column.IMPLEMENTATION, subState: null });

      const r1 = stateMachine.setSubState(PROJECT_ID, 'T-1', SubState.READY);
      expect(r1).toEqual({ ok: true });
      expect(ticketRepo.findById(PROJECT_ID, 'T-1')!.subState).toBe(SubState.READY);

      const r2 = stateMachine.setSubState(PROJECT_ID, 'T-1', SubState.WORKING);
      expect(r2).toEqual({ ok: true });
      expect(ticketRepo.findById(PROJECT_ID, 'T-1')!.subState).toBe(SubState.WORKING);

      const r3 = stateMachine.setSubState(PROJECT_ID, 'T-1', SubState.IN_REVIEW);
      expect(r3).toEqual({ ok: true });
      expect(ticketRepo.findById(PROJECT_ID, 'T-1')!.subState).toBe(SubState.IN_REVIEW);

      const r4 = stateMachine.setSubState(PROJECT_ID, 'T-1', SubState.SIGNED_OFF);
      expect(r4).toEqual({ ok: true });
      expect(ticketRepo.findById(PROJECT_ID, 'T-1')!.subState).toBe(SubState.SIGNED_OFF);
    });

    it('returns { ok: false } for non-existent ticket', () => {
      const result = stateMachine.setSubState(PROJECT_ID, 'NOPE-999', SubState.WORKING);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(typeof result.reason).toBe('string');
    });

    it('returns { ok: false } with wrong projectId (composite key isolation)', () => {
      seedTicket(ticketRepo, { id: 'T-1', projectId: 'proj-a', column: Column.TECH_SPEC });
      const result = stateMachine.setSubState('proj-b', 'T-1', SubState.WORKING);
      expect(result.ok).toBe(false);
    });

    it('returns { ok: false } on a BACKLOG ticket (BACKLOG guard)', () => {
      seedTicket(ticketRepo, { column: Column.BACKLOG });
      const result = stateMachine.setSubState(PROJECT_ID, 'T-1', SubState.WORKING);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('Cannot set sub-state on a BACKLOG ticket');
    });

    it('returns { ok: false } with invalid sub-state string (runtime validation)', () => {
      seedTicket(ticketRepo, { column: Column.IMPLEMENTATION });
      const result = stateMachine.setSubState(PROJECT_ID, 'T-1', 'RUNNING' as unknown as SubState);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('Invalid sub-state: RUNNING');
    });

    it('returns { ok: true } when setting same sub-state (idempotency) and refreshes updated_at', () => {
      vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00.000Z') });
      seedTicket(ticketRepo, { column: Column.IMPLEMENTATION, subState: SubState.WORKING });
      const t0 = ticketRepo.findById(PROJECT_ID, 'T-1')!.updatedAt;

      vi.advanceTimersByTime(1000);
      const result = stateMachine.setSubState(PROJECT_ID, 'T-1', SubState.WORKING);
      expect(result).toEqual({ ok: true });

      const t1 = ticketRepo.findById(PROJECT_ID, 'T-1')!.updatedAt;
      // updated_at should have been refreshed (stub updates it)
      expect(t1).not.toBe(t0);
      vi.useRealTimers();
    });
  });

  // =========================================================================
  // DB integrity
  // =========================================================================
  describe('DB integrity', () => {
    it('records one transition row after a legal transition', () => {
      seedTicket(ticketRepo, { column: Column.BACKLOG });
      stateMachine.transition(PROJECT_ID, 'T-1', Column.PRODUCT_SCOPING);
      expect(transitionRepo.records).toHaveLength(1);
    });

    it('records two transition rows after two transitions', () => {
      seedTicket(ticketRepo, { column: Column.BACKLOG });
      stateMachine.transition(PROJECT_ID, 'T-1', Column.PRODUCT_SCOPING);
      stateMachine.transition(PROJECT_ID, 'T-1', Column.ARCH_SPIKE);
      expect(transitionRepo.records).toHaveLength(2);
    });

    it('updates updated_at on each operation', () => {
      vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00.000Z') });
      seedTicket(ticketRepo, { column: Column.BACKLOG });
      const t0 = ticketRepo.findById(PROJECT_ID, 'T-1')!.updatedAt;

      vi.advanceTimersByTime(1000);
      stateMachine.transition(PROJECT_ID, 'T-1', Column.PRODUCT_SCOPING);
      const t1 = ticketRepo.findById(PROJECT_ID, 'T-1')!.updatedAt;
      expect(t1).not.toBe(t0);

      vi.advanceTimersByTime(1000);
      stateMachine.setSubState(PROJECT_ID, 'T-1', SubState.WORKING);
      const t2 = ticketRepo.findById(PROJECT_ID, 'T-1')!.updatedAt;
      expect(t2).not.toBe(t0);
      vi.useRealTimers();
    });
  });

  // =========================================================================
  // Cross-project isolation
  // =========================================================================
  describe('cross-project isolation', () => {
    it('tickets with same id but different project_id are independent', () => {
      seedTicket(ticketRepo, { id: 'T-1', projectId: 'proj-a', column: Column.BACKLOG });
      seedTicket(ticketRepo, {
        id: 'T-1',
        projectId: 'proj-b',
        column: Column.TECH_SPEC,
        subState: SubState.WORKING,
      });

      const ticketA = ticketRepo.findById('proj-a', 'T-1')!;
      const ticketB = ticketRepo.findById('proj-b', 'T-1')!;
      expect(ticketA.column).toBe(Column.BACKLOG);
      expect(ticketB.column).toBe(Column.TECH_SPEC);
    });

    it('transition on proj-a does not affect ticket T-1 in proj-b', () => {
      seedTicket(ticketRepo, { id: 'T-1', projectId: 'proj-a', column: Column.BACKLOG });
      seedTicket(ticketRepo, { id: 'T-1', projectId: 'proj-b', column: Column.BACKLOG });

      stateMachine.transition('proj-a', 'T-1', Column.PRODUCT_SCOPING);

      const ticketA = ticketRepo.findById('proj-a', 'T-1')!;
      const ticketB = ticketRepo.findById('proj-b', 'T-1')!;
      expect(ticketA.column).toBe(Column.PRODUCT_SCOPING);
      expect(ticketB.column).toBe(Column.BACKLOG);
    });
  });
});
