import { describe, it, expect } from 'vitest';

import { decideNextAction, HaltReason, isOrchestratable } from './orchestrator-policy.js';
import { Column } from '../model/column.js';
import { SubState } from '../model/sub-state.js';
import { TicketKind } from '../model/ticket-kind.js';
import type { Ticket } from '../model/ticket.js';

function epic(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'AEOS-1',
    projectId: 'p',
    title: 'Epic',
    kind: TicketKind.EPIC,
    parentId: null,
    column: Column.PRODUCT_SCOPING,
    subState: SubState.READY,
    createdAt: 'x',
    updatedAt: 'y',
    ...overrides,
  };
}

function task(id: string, overrides: Partial<Ticket> = {}): Ticket {
  return {
    ...epic({ id, kind: TicketKind.TASK, parentId: 'AEOS-1', column: Column.IMPLEMENTATION }),
    ...overrides,
  };
}

const alwaysAuto = () => true;
const neverAuto = () => false;

function decide(input: Partial<Parameters<typeof decideNextAction>[0]> = {}) {
  return decideNextAction({
    epic: epic(),
    children: [],
    spentUsd: 0,
    budgetUsd: null,
    autoAdvance: alwaysAuto,
    ...input,
  });
}

describe('decideNextAction', () => {
  describe('budget', () => {
    it('halts when spend reaches the ceiling, before anything else', () => {
      // Even a perfectly runnable epic stops — budget outranks the pipeline.
      const action = decide({ spentUsd: 50, budgetUsd: 50 });

      expect(action.kind).toBe('halt');
      if (action.kind !== 'halt') return;
      expect(action.reason).toBe(HaltReason.BUDGET_EXCEEDED);
      expect(action.message).toContain('$50.00');
    });

    it('proceeds while under the ceiling', () => {
      expect(decide({ spentUsd: 49.99, budgetUsd: 50 }).kind).toBe('run');
    });

    it('ignores spend when no ceiling is set', () => {
      expect(decide({ spentUsd: 10_000, budgetUsd: null }).kind).toBe('run');
    });
  });

  describe('epic pipeline', () => {
    it('runs a READY epic', () => {
      const action = decide({ epic: epic({ subState: SubState.READY }) });

      expect(action).toMatchObject({ kind: 'run', ticketId: 'AEOS-1' });
    });

    it('advances a SIGNED_OFF epic when the column auto-advances', () => {
      const action = decide({ epic: epic({ subState: SubState.SIGNED_OFF }) });

      expect(action).toMatchObject({ kind: 'advance', ticketId: 'AEOS-1' });
    });

    it('halts for approval when the column advances manually', () => {
      const action = decide({
        epic: epic({ subState: SubState.SIGNED_OFF }),
        autoAdvance: neverAuto,
      });

      expect(action.kind).toBe('halt');
      if (action.kind !== 'halt') return;
      expect(action.reason).toBe(HaltReason.AWAITING_APPROVAL);
      expect(action.message).toContain('aeos ticket approve AEOS-1');
    });

    it.each([
      [SubState.ESCALATED, HaltReason.NEEDS_HUMAN],
      [SubState.FAILED, HaltReason.FAILED],
      [SubState.BLOCKED, HaltReason.NEEDS_HUMAN],
      [SubState.INTERRUPTED, HaltReason.NEEDS_HUMAN],
    ])('halts on a %s epic', (subState, expected) => {
      const action = decide({ epic: epic({ subState }) });

      expect(action.kind).toBe('halt');
      if (action.kind !== 'halt') return;
      expect(action.reason).toBe(expected);
    });

    it.each([SubState.WORKING, SubState.IN_REVIEW])(
      'halts with an actionable message for a stuck %s epic',
      (subState) => {
        const action = decide({ epic: epic({ column: Column.TECH_SPEC, subState }) });

        expect(action.kind).toBe('halt');
        if (action.kind !== 'halt') return;
        expect(action.reason).toBe(HaltReason.NEEDS_HUMAN);
        // The recovery is named, not the generic "no action for" fallback.
        expect(action.message).toContain('aeos ticket ready AEOS-1');
        expect(action.message).not.toContain('no action for');
      },
    );

    it('halts at DOD_GATE — final sign-off is human-only', () => {
      const action = decide({
        epic: epic({ column: Column.DOD_GATE, subState: SubState.READY }),
      });

      expect(action.kind).toBe('halt');
      if (action.kind !== 'halt') return;
      expect(action.reason).toBe(HaltReason.HUMAN_GATE);
      expect(action.message).toContain('dod-approve');
    });

    it('halts as complete when the epic is DONE', () => {
      const action = decide({ epic: epic({ column: Column.DONE, subState: null }) });

      expect(action.kind).toBe('halt');
      if (action.kind !== 'halt') return;
      expect(action.reason).toBe(HaltReason.COMPLETE);
    });
  });

  describe('after decomposition', () => {
    const decomposedEpic = epic({
      column: Column.TASK_BREAKDOWN,
      subState: SubState.SIGNED_OFF,
    });

    it('halts when the epic is decomposed but has no child tasks', () => {
      const action = decide({ epic: decomposedEpic, children: [] });

      expect(action.kind).toBe('halt');
      if (action.kind !== 'halt') return;
      expect(action.reason).toBe(HaltReason.AWAITING_DECOMPOSITION);
      expect(action.message).toContain('--parent AEOS-1');
    });

    it('runs the first incomplete task rather than the epic', () => {
      const action = decide({
        epic: decomposedEpic,
        children: [
          task('AEOS-2', { column: Column.DONE, subState: null }),
          task('AEOS-3', { subState: SubState.READY }),
        ],
      });

      expect(action).toMatchObject({ kind: 'run', ticketId: 'AEOS-3' });
    });

    it('works tasks sequentially — the second waits for the first', () => {
      const action = decide({
        epic: decomposedEpic,
        children: [
          task('AEOS-2', { subState: SubState.READY }),
          task('AEOS-3', { subState: SubState.READY }),
        ],
      });

      // Sibling tasks touching overlapping paths would race in the worktree.
      expect(action).toMatchObject({ kind: 'run', ticketId: 'AEOS-2' });
    });

    it('advances a signed-off task', () => {
      const action = decide({
        epic: decomposedEpic,
        children: [task('AEOS-2', { subState: SubState.SIGNED_OFF })],
      });

      expect(action).toMatchObject({ kind: 'advance', ticketId: 'AEOS-2' });
    });

    it('halts on an escalated task before scheduling later ones', () => {
      const action = decide({
        epic: decomposedEpic,
        children: [
          task('AEOS-2', { subState: SubState.ESCALATED }),
          task('AEOS-3', { subState: SubState.READY }),
        ],
      });

      expect(action.kind).toBe('halt');
      if (action.kind !== 'halt') return;
      expect(action.reason).toBe(HaltReason.NEEDS_HUMAN);
      expect(action.message).toContain('AEOS-2');
    });

    it('advances the epic once every task is DONE', () => {
      const action = decide({
        epic: decomposedEpic,
        children: [
          task('AEOS-2', { column: Column.DONE, subState: null }),
          task('AEOS-3', { column: Column.DONE, subState: null }),
        ],
      });

      expect(action).toMatchObject({ kind: 'advance', ticketId: 'AEOS-1' });
    });

    it('halts for approval when all tasks are DONE but the epic advances manually', () => {
      const action = decide({
        epic: decomposedEpic,
        children: [task('AEOS-2', { column: Column.DONE, subState: null })],
        autoAdvance: neverAuto,
      });

      expect(action.kind).toBe('halt');
      if (action.kind !== 'halt') return;
      expect(action.reason).toBe(HaltReason.AWAITING_APPROVAL);
    });

    it('does not treat an unsigned TASK_BREAKDOWN epic as decomposed', () => {
      // Still working on tasks.md — the epic itself is the runnable thing.
      const action = decide({
        epic: epic({ column: Column.TASK_BREAKDOWN, subState: SubState.READY }),
        children: [],
      });

      expect(action).toMatchObject({ kind: 'run', ticketId: 'AEOS-1' });
    });
  });

  describe('per-column advance mode', () => {
    it('respects a column-specific manual gate while auto-advancing others', () => {
      const action = decide({
        epic: epic({ column: Column.TECH_SPEC, subState: SubState.SIGNED_OFF }),
        autoAdvance: (column) => column !== Column.TECH_SPEC,
      });

      expect(action.kind).toBe('halt');
      if (action.kind !== 'halt') return;
      expect(action.reason).toBe(HaltReason.AWAITING_APPROVAL);
    });
  });
});

describe('isOrchestratable', () => {
  it('drives epics, not tasks', () => {
    expect(isOrchestratable(epic())).toBe(true);
    expect(isOrchestratable(task('AEOS-2'))).toBe(false);
  });
});
