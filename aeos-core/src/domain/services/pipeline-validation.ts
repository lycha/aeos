// Domain service — the rules a project's pipelines must keep. They are the
// ones the header of the approved `templates/pipelines.yaml` states.

import { Column, type Pipelines } from '../model/column.js';
import type { ColumnRole } from '../model/column-spec.js';
import { TicketKind } from '../model/ticket-kind.js';

/**
 * What is wrong with the pipelines; empty when nothing is. `roleOf` is the
 * role a column's spec declares, or null when the column has no spec.
 */
export function pipelineErrors(
  pipelines: Pipelines,
  roleOf: (column: Column) => ColumnRole | null,
): string[] {
  const errors: string[] = [];
  for (const kind of Object.values(TicketKind)) {
    const order = pipelines[kind];
    if (order[0] !== Column.BACKLOG || order.at(-1) !== Column.DONE || order.length < 2) {
      errors.push(`The ${kind} pipeline must start at BACKLOG and end at DONE.`);
      continue;
    }
    for (const column of new Set(order.filter((c, at) => order.indexOf(c) !== at))) {
      errors.push(`Column ${column} is listed twice in the ${kind} pipeline.`);
    }

    const middle = order.slice(1, -1);
    const roles = new Map(middle.map((column) => [column, roleOf(column)]));
    for (const [column, role] of roles) {
      if (role === null) {
        errors.push(
          `Column ${column} of the ${kind} pipeline has no column spec in .aeos/column-specs/.`,
        );
      }
    }
    const withRole = (role: ColumnRole): Column[] =>
      [...roles].filter(([, r]) => r === role).map(([column]) => column);
    const count = (columns: Column[], role: ColumnRole): string =>
      `The ${kind} pipeline has ${columns.length === 0 ? 'no column' : `${columns.length} columns`} with role \`${role}\``;

    if (kind === TicketKind.EPIC) {
      const decomposition = withRole('decomposition');
      if (decomposition.length !== 1) {
        errors.push(`${count(decomposition, 'decomposition')}; it needs exactly one.`);
      } else {
        const later = middle.find(
          (column) => roles.get(column) === 'integration' || roles.get(column) === 'final-gate',
        );
        if (later && middle.indexOf(later) < middle.indexOf(decomposition[0])) {
          errors.push(
            `Column ${decomposition[0]} (decomposition) of the ${kind} pipeline must come before ${later} (${roles.get(later)}).`,
          );
        }
      }
    }

    const finalGates = withRole('final-gate');
    if (finalGates.length > 1) {
      errors.push(`${count(finalGates, 'final-gate')}; it may have at most one.`);
    } else if (finalGates.length === 1 && middle.at(-1) !== finalGates[0]) {
      errors.push(
        `Column ${finalGates[0]} (final-gate) of the ${kind} pipeline must be the last column before DONE.`,
      );
    }
  }
  return errors;
}
