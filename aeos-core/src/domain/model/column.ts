// Value Object — Column enum (9 pipeline stages across two ticket kinds)

import { TicketKind } from './ticket-kind.js';

export const Column = {
  BACKLOG: 'BACKLOG',
  PRODUCT_SCOPING: 'PRODUCT_SCOPING',
  TECH_SPEC: 'TECH_SPEC',
  TASK_BREAKDOWN: 'TASK_BREAKDOWN',
  IMPLEMENTATION: 'IMPLEMENTATION',
  CODE_REVIEW: 'CODE_REVIEW',
  QA: 'QA',
  INTEGRATION_REVIEW: 'INTEGRATION_REVIEW',
  DOD_GATE: 'DOD_GATE',
  DONE: 'DONE',
} as const;

export type Column = (typeof Column)[keyof typeof Column];

/**
 * Canonical display ordering across both pipelines.
 *
 * This is NOT the advancement sequence — neither kind visits every column.
 * Use `nextColumnFor` for advancement; this exists for rendering and for
 * reasoning about relative position.
 */
export const COLUMN_ORDER = [
  Column.BACKLOG,
  Column.PRODUCT_SCOPING,
  Column.TECH_SPEC,
  Column.TASK_BREAKDOWN,
  Column.IMPLEMENTATION,
  Column.CODE_REVIEW,
  Column.QA,
  Column.INTEGRATION_REVIEW,
  Column.DOD_GATE,
  Column.DONE,
] as const;

export type ColumnOrder = typeof COLUMN_ORDER;

/**
 * An epic is scoped, specced, and decomposed — then it waits.
 * It never implements anything itself; its child tasks do that.
 */
export const EPIC_COLUMN_ORDER = [
  Column.BACKLOG,
  Column.PRODUCT_SCOPING,
  Column.TECH_SPEC,
  Column.TASK_BREAKDOWN,
  // Once every child task is DONE, the epic reviews the assembled feature diff
  // against its own PRD and tech spec before the human DoD gate.
  Column.INTEGRATION_REVIEW,
  Column.DOD_GATE,
  Column.DONE,
] as const;

/**
 * A task is already specified by the time it exists — its parent epic's tech
 * spec and task breakdown are its input — so it goes straight to building.
 */
export const TASK_COLUMN_ORDER = [
  Column.BACKLOG,
  Column.IMPLEMENTATION,
  Column.CODE_REVIEW,
  Column.QA,
  Column.DONE,
] as const;

export function columnOrderFor(kind: TicketKind): readonly Column[] {
  return kind === TicketKind.TASK ? TASK_COLUMN_ORDER : EPIC_COLUMN_ORDER;
}

/**
 * The next column for a ticket of this kind, or null when the current column
 * is terminal or is not part of that kind's pipeline.
 */
export function nextColumnFor(kind: TicketKind, current: Column): Column | null {
  const order = columnOrderFor(kind);
  const index = order.indexOf(current);
  if (index < 0 || index === order.length - 1) return null;
  return order[index + 1];
}

/** True when the column belongs to the given kind's pipeline. */
export function isColumnInPipeline(kind: TicketKind, column: Column): boolean {
  return columnOrderFor(kind).includes(column);
}

const COLUMN_VALUES: ReadonlySet<string> = new Set(Object.values(Column));

/** Type guard — narrows an arbitrary string to `Column`. */
export function isValidColumn(value: string): value is Column {
  return COLUMN_VALUES.has(value);
}
