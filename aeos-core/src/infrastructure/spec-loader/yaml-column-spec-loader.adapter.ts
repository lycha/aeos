// Adapter — YAML+Zod implementation of ColumnSpecLoader port

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { Column, displayOrder } from '../../domain/model/column.js';
import type { ColumnSpec } from '../../domain/model/column-spec.js';
import { ColumnSpecSchema } from './schemas.js';
import { readPipelines } from './yaml-pipeline-loader.adapter.js';
import type { ColumnSpecLoader } from '../../domain/ports/driven/column-spec-loader.port.js';
import { ColumnSpecNotFoundError } from '../../shared/errors.js';
import { aeosDir } from '../filesystem/fs-project.repository.js';
import {
  columnLabels,
  labelErrors,
  type ColumnLabels,
} from '../../domain/services/column-labels.js';

const SPECS_DIR = 'column-specs';

/** What `.aeos/column-specs/` holds: each spec file under the column it declares. */
interface SpecFiles {
  /** Column identifier → the file that declares it, and its parsed content. */
  readonly byColumn: ReadonlyMap<string, { file: string; parsed: unknown }>;
  /** Files that are not readable YAML, for the message when a column turns out to have no spec. */
  readonly unreadable: readonly string[];
}

/**
 * Reads every `*.yaml` of the directory and indexes it by its own `column:`
 * field: the file's name means nothing. Throws when two files claim one column.
 */
function specFiles(root?: string): SpecFiles {
  const dir = path.join(aeosDir(root), SPECS_DIR);
  const byColumn = new Map<string, { file: string; parsed: unknown }>();
  const unreadable: string[] = [];
  const names = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => name.endsWith('.yaml'))
    : [];
  for (const name of names.sort()) {
    const file = `${SPECS_DIR}/${name}`;
    let parsed: unknown;
    try {
      parsed = yaml.load(fs.readFileSync(path.join(dir, name), 'utf-8'), {
        schema: yaml.DEFAULT_SCHEMA,
      });
    } catch {
      unreadable.push(file);
      continue;
    }
    const column = (parsed as { column?: unknown } | null)?.column;
    if (typeof column !== 'string') continue;
    const claimed = byColumn.get(column);
    if (claimed) {
      throw new Error(
        `Column ${column} is declared by two column specs: ${claimed.file} and ${file}. A column has one spec; remove or re-point one of them.`,
      );
    }
    byColumn.set(column, { file, parsed });
  }
  return { byColumn, unreadable };
}

export class YamlColumnSpecLoader implements ColumnSpecLoader {
  /**
   * Loads and validates the spec that declares the given column.
   * Throws ColumnSpecNotFoundError if the column has no spec (BACKLOG and DONE never do).
   * Throws ZodError if the file content does not match the schema.
   */
  load(column: Column, root?: string): ColumnSpec {
    if (column === Column.BACKLOG || column === Column.DONE) {
      throw new ColumnSpecNotFoundError(`Column '${column}' does not have a column spec`);
    }
    const { byColumn, unreadable } = specFiles(root);
    const found = byColumn.get(column);
    if (!found) {
      const dir = path.join(aeosDir(root), SPECS_DIR);
      throw new ColumnSpecNotFoundError(
        `Column spec file not found: no file in ${dir} declares \`column: ${column}\`.${unreadable.length > 0 ? ` Not readable as YAML: ${unreadable.join(', ')}.` : ''}`,
      );
    }

    const spec = ColumnSpecSchema.parse(found.parsed);
    // Labels are valid across the project or no column loads.
    this.labels(root);
    return spec;
  }

  /**
   * The label of every column of the project. Throws, naming the files, when
   * the labels are not valid together. A spec file that is missing or cannot
   * be read contributes no label here; `load` reports it for its own column.
   * `columns` are the project's, when they are not the ones its file lists.
   */
  labels(root?: string, columns = displayOrder(readPipelines(root))): ColumnLabels {
    const readYaml = (file: string): unknown => {
      try {
        return yaml.load(fs.readFileSync(path.join(aeosDir(root), file), 'utf-8'));
      } catch {
        return null;
      }
    };
    const { byColumn } = specFiles(root);
    const specs: Partial<Record<Column, { label?: string }>> = {};
    const sourceOf = (column: Column): string => byColumn.get(column)?.file ?? 'project.json';
    for (const column of columns) {
      const label = (byColumn.get(column)?.parsed as { label?: unknown } | null)?.label;
      if (typeof label === 'string') specs[column] = { label };
    }
    // project.json is JSON, which is YAML.
    const project = readYaml('project.json') as { labels?: Record<string, string> } | null;
    if (Object.values(project?.labels ?? {}).some((label) => typeof label !== 'string')) {
      throw new Error('Invalid "labels" in .aeos/project.json: every label must be text.');
    }

    const labels = columnLabels(columns, specs, project);
    const errors = labelErrors(
      columns.map((column) => ({ column, label: labels[column], source: sourceOf(column) })),
    );
    if (errors.length > 0) throw new Error(errors.join('\n'));
    return labels;
  }
}
