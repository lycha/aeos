// Value Object — Column: a pipeline stage, named by the project's pipelines file

import type { TicketKind } from './ticket-kind.js';

/** The two structural columns every pipeline has. Every other column is the project's to name. */
export const Column = {
  BACKLOG: 'BACKLOG',
  DONE: 'DONE',
} as const;

/** A column identifier: valid when a loaded pipeline lists it (see `isValidColumn`). */
export type Column = string;

/** The ordered columns of each ticket kind, as loaded from `.aeos/pipelines.yaml`. */
export type Pipelines = Readonly<Record<TicketKind, readonly Column[]>>;

export function columnOrderFor(pipelines: Pipelines, kind: TicketKind): readonly Column[] {
  return pipelines[kind];
}

/**
 * The next column for a ticket of this kind, or null when the current column
 * is terminal or is not part of that kind's pipeline.
 */
export function nextColumnFor(
  pipelines: Pipelines,
  kind: TicketKind,
  current: Column,
): Column | null {
  const order = columnOrderFor(pipelines, kind);
  const index = order.indexOf(current);
  if (index < 0 || index === order.length - 1) return null;
  return order[index + 1];
}

/** True when the column belongs to the given kind's pipeline. */
export function isColumnInPipeline(
  pipelines: Pipelines,
  kind: TicketKind,
  column: Column,
): boolean {
  return columnOrderFor(pipelines, kind).includes(column);
}

/**
 * Every column of every pipeline once, for rendering: BACKLOG, the epic's
 * columns, the task's, DONE. This is NOT an advancement sequence.
 */
export function displayOrder(pipelines: Pipelines): Column[] {
  const columns = [...pipelines.EPIC, ...pipelines.TASK].filter(
    (column) => column !== Column.BACKLOG && column !== Column.DONE,
  );
  return [...new Set([Column.BACKLOG, ...columns, Column.DONE])];
}

/** True when a loaded pipeline lists the column. */
export function isValidColumn(value: string, pipelines: Pipelines): boolean {
  return displayOrder(pipelines).includes(value);
}
