// Application service — what a column is for, read from its spec. Use cases
// ask here and never compare a column against a name.

import { Column } from '../../domain/model/column.js';
import type { ColumnRole, ColumnSpec } from '../../domain/model/column-spec.js';
import type { ColumnSpecLoader } from '../../domain/ports/driven/column-spec-loader.port.js';

/** The spec of a column, or null for BACKLOG and DONE, which are structural and have none. */
export function columnSpecOf(
  loader: ColumnSpecLoader,
  projectPath: string,
  column: Column,
): ColumnSpec | null {
  if (column === Column.BACKLOG || column === Column.DONE) return null;
  return loader.load(column, projectPath);
}

/**
 * The role of each column of a project. Throws when a column's spec cannot be
 * loaded: a final gate taken for a standard column would be advanced past.
 */
export function roleOf(
  loader: ColumnSpecLoader,
  projectPath: string,
): (column: Column) => ColumnRole {
  return (column) => columnSpecOf(loader, projectPath, column)?.role ?? 'standard';
}

/** The first of `columns` (a kind's pipeline) whose spec matches, or null. */
export function findColumnSpec(
  loader: ColumnSpecLoader,
  projectPath: string,
  columns: readonly Column[],
  matches: (spec: ColumnSpec) => boolean,
): ColumnSpec | null {
  for (const column of columns) {
    const spec = columnSpecOf(loader, projectPath, column);
    if (spec && matches(spec)) return spec;
  }
  return null;
}
