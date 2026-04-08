// Adapter — YAML+Zod implementation of ColumnSpecLoader port

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { Column } from '../../domain/model/column.js';
import { ColumnSpecSchema, type ColumnSpec } from '../../domain/model/column-spec.js';
import type { ColumnSpecLoader } from '../../domain/ports/driven/column-spec-loader.port.js';
import { ColumnSpecNotFoundError } from '../../shared/errors.js';
import { aeosDir } from '../filesystem/fs-project.repository.js';

/** Maps Column enum values to their YAML spec filenames (without extension). */
const COLUMN_SPEC_FILENAMES: Partial<Record<Column, string>> = {
  [Column.PRODUCT_SCOPING]: 'product-scoping',
  [Column.ARCH_SPIKE]: 'architecture-spike',
  [Column.TECH_SPEC]: 'tech-spec',
  [Column.IMPLEMENTATION]: 'implementation',
  [Column.CODE_REVIEW]: 'code-review',
  [Column.QA]: 'qa',
};

export class YamlColumnSpecLoader implements ColumnSpecLoader {
  /**
   * Loads and validates the column spec for the given column.
   * Throws ColumnSpecNotFoundError if the column has no spec or the file does not exist.
   * Throws ZodError if the file content does not match the schema.
   */
  load(column: Column, root?: string): ColumnSpec {
    const filename = COLUMN_SPEC_FILENAMES[column];
    if (!filename) {
      throw new ColumnSpecNotFoundError(`Column '${column}' does not have a column spec`);
    }

    const specPath = path.join(aeosDir(root), 'column-specs', filename + '.yaml');

    let raw: string;
    try {
      raw = fs.readFileSync(specPath, 'utf-8');
    } catch {
      throw new ColumnSpecNotFoundError(`Column spec file not found: ${specPath}`);
    }

    const parsed: unknown = yaml.load(raw, { schema: yaml.DEFAULT_SCHEMA });
    return ColumnSpecSchema.parse(parsed);
  }
}
