// Domain service — when a kind's pipeline may change (decided 10 Nov 2026):
// only while none of its tickets is in flight.

import { Column } from '../model/column.js';

/** In flight: started and not finished. */
export function isInFlight(column: Column): boolean {
  return column !== Column.BACKLOG && column !== Column.DONE;
}

/** True when the columns or their order differ. Labels and roles are not part of a pipeline. */
export function pipelineChanged(accepted: readonly Column[], current: readonly Column[]): boolean {
  return (
    accepted.length !== current.length || accepted.some((column, at) => column !== current[at])
  );
}
