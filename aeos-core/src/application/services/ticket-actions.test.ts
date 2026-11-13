// Criteria traced here: @AC-9 (only the actions that suit the sub-state) @AC-34 (READY offers none).
import { describe, it, expect } from 'vitest';
import { availableActionsFor } from './ticket-actions.js';
import { Column } from '../../domain/model/column.js';
import { SubState } from '../../domain/model/sub-state.js';
import type { ColumnRole } from '../../domain/model/column-spec.js';

const STANDARD: ColumnRole = 'standard';
const FINAL_GATE: ColumnRole = 'final-gate';
const COLUMN = 'IMPLEMENTATION';

describe('availableActionsFor', () => {
  it('BLOCKED with no pending amendment offers ticketAnswer/ticketReady', () => {
    expect(
      availableActionsFor({
        column: COLUMN,
        subState: SubState.BLOCKED,
        role: STANDARD,
        pendingAmendment: false,
      }),
    ).toEqual(['ticketAnswer', 'ticketReady', 'ticketMove']);
  });

  it('BLOCKED with a pending amendment offers ticketRepin/ticketReady instead', () => {
    expect(
      availableActionsFor({
        column: COLUMN,
        subState: SubState.BLOCKED,
        role: STANDARD,
        pendingAmendment: true,
      }),
    ).toEqual(['ticketRepin', 'ticketReady', 'ticketMove']);
  });

  it('ESCALATED offers ticketResolve/ticketReady', () => {
    expect(
      availableActionsFor({
        column: COLUMN,
        subState: SubState.ESCALATED,
        role: STANDARD,
        pendingAmendment: false,
      }),
    ).toEqual(['ticketResolve', 'ticketReady', 'ticketMove']);
  });

  it('FAILED offers only ticketReady', () => {
    expect(
      availableActionsFor({
        column: COLUMN,
        subState: SubState.FAILED,
        role: STANDARD,
        pendingAmendment: false,
      }),
    ).toEqual(['ticketReady', 'ticketMove']);
  });

  it('INTERRUPTED offers only ticketReady', () => {
    expect(
      availableActionsFor({
        column: COLUMN,
        subState: SubState.INTERRUPTED,
        role: STANDARD,
        pendingAmendment: false,
      }),
    ).toEqual(['ticketReady', 'ticketMove']);
  });

  it('IN_REVIEW offers ticketSignOff', () => {
    expect(
      availableActionsFor({
        column: COLUMN,
        subState: SubState.IN_REVIEW,
        role: STANDARD,
        pendingAmendment: false,
      }),
    ).toEqual(['ticketSignOff', 'ticketMove']);
  });

  it('SIGNED_OFF at a final-gate column offers ticketDodApprove', () => {
    expect(
      availableActionsFor({
        column: COLUMN,
        subState: SubState.SIGNED_OFF,
        role: FINAL_GATE,
        pendingAmendment: false,
      }),
    ).toEqual(['ticketDodApprove', 'ticketMove']);
  });

  it('SIGNED_OFF at a non-final-gate column offers ticketApprove', () => {
    expect(
      availableActionsFor({
        column: COLUMN,
        subState: SubState.SIGNED_OFF,
        role: STANDARD,
        pendingAmendment: false,
      }),
    ).toEqual(['ticketApprove', 'ticketMove']);
  });

  it('WORKING offers no decision action, only the standing move override', () => {
    expect(
      availableActionsFor({
        column: COLUMN,
        subState: SubState.WORKING,
        role: STANDARD,
        pendingAmendment: false,
      }),
    ).toEqual(['ticketMove']);
  });

  it('null sub-state offers no decision action, only the standing move override', () => {
    expect(
      availableActionsFor({
        column: COLUMN,
        subState: null,
        role: STANDARD,
        pendingAmendment: false,
      }),
    ).toEqual(['ticketMove']);
  });

  it('READY offers no decision action, identical to WORKING/null (D-001)', () => {
    expect(
      availableActionsFor({
        column: COLUMN,
        subState: SubState.READY,
        role: STANDARD,
        pendingAmendment: false,
      }),
    ).toEqual(['ticketMove']);
  });

  it('READY returns [] regardless of column, role or pendingAmendment', () => {
    expect(
      availableActionsFor({
        column: Column.BACKLOG,
        subState: SubState.READY,
        role: FINAL_GATE,
        pendingAmendment: true,
      }),
    ).toEqual([]);
  });

  it('BACKLOG always returns [], regardless of sub-state', () => {
    expect(
      availableActionsFor({
        column: Column.BACKLOG,
        subState: SubState.BLOCKED,
        role: STANDARD,
        pendingAmendment: false,
      }),
    ).toEqual([]);
  });

  it('DONE always returns [], regardless of sub-state', () => {
    expect(
      availableActionsFor({
        column: Column.DONE,
        subState: SubState.SIGNED_OFF,
        role: FINAL_GATE,
        pendingAmendment: false,
      }),
    ).toEqual([]);
  });

  it('appends ticketMove whenever the column is not BACKLOG/DONE, independent of sub-state', () => {
    const result = availableActionsFor({
      column: COLUMN,
      subState: SubState.IN_REVIEW,
      role: STANDARD,
      pendingAmendment: false,
    });
    expect(result).toContain('ticketMove');
  });
});
