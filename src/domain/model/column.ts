// Value Object — Column enum (9 pipeline stages)

export const Column = {
  BACKLOG: 'BACKLOG',
  PRODUCT_SCOPING: 'PRODUCT_SCOPING',
  ARCH_SPIKE: 'ARCH_SPIKE',
  TECH_SPEC: 'TECH_SPEC',
  IMPLEMENTATION: 'IMPLEMENTATION',
  CODE_REVIEW: 'CODE_REVIEW',
  QA: 'QA',
  DOD_GATE: 'DOD_GATE',
  DONE: 'DONE',
} as const;

export type Column = (typeof Column)[keyof typeof Column];

/** Authoritative readonly sequence for legal forward transitions. */
export const COLUMN_ORDER = [
  Column.BACKLOG,
  Column.PRODUCT_SCOPING,
  Column.ARCH_SPIKE,
  Column.TECH_SPEC,
  Column.IMPLEMENTATION,
  Column.CODE_REVIEW,
  Column.QA,
  Column.DOD_GATE,
  Column.DONE,
] as const;

export type ColumnOrder = typeof COLUMN_ORDER;

const COLUMN_VALUES: ReadonlySet<string> = new Set(Object.values(Column));

/** Type guard — narrows an arbitrary string to `Column`. */
export function isValidColumn(value: string): value is Column {
  return COLUMN_VALUES.has(value);
}
