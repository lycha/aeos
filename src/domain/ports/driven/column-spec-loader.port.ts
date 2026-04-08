// Driven port — ColumnSpecLoader: load/validate YAML column specs

import type { Column } from '../../model/column.js';
import type { ColumnSpec } from '../../model/column-spec.js';

export interface ColumnSpecLoader {
  load(column: Column, root?: string): ColumnSpec;
}
