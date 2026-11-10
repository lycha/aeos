// Adapter — YAML+Zod implementation of ColumnSpecLoader port

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { Column, COLUMN_ORDER } from '../../domain/model/column.js';
import type { ColumnSpec } from '../../domain/model/column-spec.js';
import { ColumnSpecSchema } from './schemas.js';
import type { ColumnSpecLoader } from '../../domain/ports/driven/column-spec-loader.port.js';
import { ColumnSpecNotFoundError } from '../../shared/errors.js';
import { aeosDir } from '../filesystem/fs-project.repository.js';
import {
  columnLabels,
  labelErrors,
  type ColumnLabels,
} from '../../domain/services/column-labels.js';

/** Maps Column enum values to their YAML spec filenames (without extension). */
const COLUMN_SPEC_FILENAMES: Partial<Record<Column, string>> = {
  [Column.SPEC_REVIEW]: 'spec-review',
  [Column.TECH_SPEC]: 'tech-spec',
  [Column.TASK_BREAKDOWN]: 'task-breakdown',
  [Column.IMPLEMENTATION]: 'implementation',
  [Column.CODE_REVIEW]: 'code-review',
  [Column.QA]: 'qa',
  [Column.INTEGRATION_REVIEW]: 'integration-review',
  [Column.DOD_GATE]: 'dod-gate',
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
    const spec = ColumnSpecSchema.parse(parsed);
    // Labels are valid across the project or no column loads.
    this.labels(root);
    return spec;
  }

  /**
   * The label of every column of the project. Throws, naming the files, when
   * the labels are not valid together. A spec file that is missing or cannot
   * be read contributes no label here; `load` reports it for its own column.
   */
  labels(root?: string): ColumnLabels {
    const readYaml = (file: string): unknown => {
      try {
        return yaml.load(fs.readFileSync(path.join(aeosDir(root), file), 'utf-8'));
      } catch {
        return null;
      }
    };
    const specs: Partial<Record<Column, { label?: string }>> = {};
    const sourceOf = (column: Column): string => {
      const filename = COLUMN_SPEC_FILENAMES[column];
      return filename ? `column-specs/${filename}.yaml` : 'project.json';
    };
    for (const column of COLUMN_ORDER) {
      const parsed = COLUMN_SPEC_FILENAMES[column] ? readYaml(sourceOf(column)) : null;
      const label = (parsed as { label?: unknown } | null)?.label;
      if (typeof label === 'string') specs[column] = { label };
    }
    // project.json is JSON, which is YAML.
    const project = readYaml('project.json') as { labels?: Record<string, string> } | null;
    if (Object.values(project?.labels ?? {}).some((label) => typeof label !== 'string')) {
      throw new Error('Invalid "labels" in .aeos/project.json: every label must be text.');
    }

    const labels = columnLabels(specs, project);
    const errors = labelErrors(
      COLUMN_ORDER.map((column) => ({ column, label: labels[column], source: sourceOf(column) })),
    );
    if (errors.length > 0) throw new Error(errors.join('\n'));
    return labels;
  }
}
