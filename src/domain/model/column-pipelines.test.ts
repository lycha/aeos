import { describe, it, expect } from 'vitest';

import {
  Column,
  EPIC_COLUMN_ORDER,
  TASK_COLUMN_ORDER,
  columnOrderFor,
  isColumnInPipeline,
  nextColumnFor,
} from './column.js';
import { TicketKind } from './ticket-kind.js';

describe('column pipelines', () => {
  it('routes an epic through scoping, spec, and decomposition — never implementation', () => {
    expect([...EPIC_COLUMN_ORDER]).toEqual([
      'BACKLOG',
      'PRODUCT_SCOPING',
      'TECH_SPEC',
      'TASK_BREAKDOWN',
      'INTEGRATION_REVIEW',
      'DOD_GATE',
      'DONE',
    ]);
    // The epic reviews the assembled feature (INTEGRATION_REVIEW) but never does
    // the per-task build columns itself.
    expect(isColumnInPipeline(TicketKind.EPIC, Column.IMPLEMENTATION)).toBe(false);
    expect(isColumnInPipeline(TicketKind.EPIC, Column.CODE_REVIEW)).toBe(false);
    expect(isColumnInPipeline(TicketKind.EPIC, Column.INTEGRATION_REVIEW)).toBe(true);
  });

  it('routes a task straight to building — it is already specified', () => {
    expect([...TASK_COLUMN_ORDER]).toEqual([
      'BACKLOG',
      'IMPLEMENTATION',
      'CODE_REVIEW',
      'QA',
      'DONE',
    ]);
    expect(isColumnInPipeline(TicketKind.TASK, Column.PRODUCT_SCOPING)).toBe(false);
    expect(isColumnInPipeline(TicketKind.TASK, Column.TECH_SPEC)).toBe(false);
    expect(isColumnInPipeline(TicketKind.TASK, Column.TASK_BREAKDOWN)).toBe(false);
  });

  it('selects the order matching the kind', () => {
    expect(columnOrderFor(TicketKind.EPIC)).toBe(EPIC_COLUMN_ORDER);
    expect(columnOrderFor(TicketKind.TASK)).toBe(TASK_COLUMN_ORDER);
  });

  describe('nextColumnFor', () => {
    it('advances an epic from TECH_SPEC to TASK_BREAKDOWN', () => {
      expect(nextColumnFor(TicketKind.EPIC, Column.TECH_SPEC)).toBe(Column.TASK_BREAKDOWN);
    });

    it('advances an epic from TASK_BREAKDOWN to INTEGRATION_REVIEW, then DOD_GATE', () => {
      // The build columns belong to its children; the epic reviews the whole
      // assembled feature before the human DoD gate.
      expect(nextColumnFor(TicketKind.EPIC, Column.TASK_BREAKDOWN)).toBe(Column.INTEGRATION_REVIEW);
      expect(nextColumnFor(TicketKind.EPIC, Column.INTEGRATION_REVIEW)).toBe(Column.DOD_GATE);
    });

    it('advances a task from BACKLOG straight to IMPLEMENTATION', () => {
      expect(nextColumnFor(TicketKind.TASK, Column.BACKLOG)).toBe(Column.IMPLEMENTATION);
    });

    it('advances a task from QA to DONE', () => {
      expect(nextColumnFor(TicketKind.TASK, Column.QA)).toBe(Column.DONE);
    });

    it('returns null at the end of either pipeline', () => {
      expect(nextColumnFor(TicketKind.EPIC, Column.DONE)).toBeNull();
      expect(nextColumnFor(TicketKind.TASK, Column.DONE)).toBeNull();
    });

    it('returns null when the column is not in that kind pipeline', () => {
      // An epic parked in IMPLEMENTATION (e.g. moved there by hand) has no
      // next column — the caller must surface that rather than guessing.
      expect(nextColumnFor(TicketKind.EPIC, Column.IMPLEMENTATION)).toBeNull();
      expect(nextColumnFor(TicketKind.TASK, Column.TECH_SPEC)).toBeNull();
    });
  });

  it('no longer knows about ARCH_SPIKE', () => {
    expect(Object.values(Column)).not.toContain('ARCH_SPIKE');
  });
});
