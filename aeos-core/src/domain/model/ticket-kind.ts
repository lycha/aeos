// Value Object — TicketKind
//
// An EPIC carries a requirement through scoping, spec, and decomposition, then
// waits for its children. A TASK is one atomic unit of that decomposition and
// runs the build pipeline on its own.
//
// The two follow different column sequences — see EPIC_COLUMN_ORDER and
// TASK_COLUMN_ORDER in column.ts.

export const TicketKind = {
  EPIC: 'EPIC',
  TASK: 'TASK',
} as const;

export type TicketKind = (typeof TicketKind)[keyof typeof TicketKind];

const KIND_VALUES: ReadonlySet<string> = new Set(Object.values(TicketKind));

/** Type guard — narrows an arbitrary string to `TicketKind`. */
export function isValidTicketKind(value: string): value is TicketKind {
  return KIND_VALUES.has(value);
}
