// Domain service — column labels: the name a person sees for a column.
//
// The identifier (`SPEC_REVIEW`) is what the database, the transition log,
// gate records and the code use; it never changes. A label is display only.

import { Column } from '../model/column.js';

export type ColumnLabels = Readonly<Record<Column, string>>;

/** Where a label was set, for an error a person can act on. */
export interface LabelSource {
  readonly column: Column;
  readonly label: string;
  /** The file, e.g. `column-specs/tech-spec.yaml`. */
  readonly source: string;
}

const MAX_LABEL_LENGTH = 40;

/** The identifier in sentence case: `SPEC_REVIEW` → `Spec review`. */
export function defaultLabel(column: Column): string {
  const words = column.toLowerCase().replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The label of a column: the `label` of its column spec, else the `labels` map
 * of `.aeos/project.json` (where `BACKLOG` and `DONE`, which have no spec, get
 * theirs), else the default.
 */
export function labelFor(
  column: Column,
  specs: Partial<Record<Column, { readonly label?: string }>>,
  projectConfig: { readonly labels?: Readonly<Record<string, string>> } | null,
): string {
  return specs[column]?.label ?? projectConfig?.labels?.[column] ?? defaultLabel(column);
}

/** The label of each of `columns`, in that order (`displayOrder` of the project's pipelines). */
export function columnLabels(
  columns: readonly Column[],
  specs: Parameters<typeof labelFor>[1],
  projectConfig: Parameters<typeof labelFor>[2],
): ColumnLabels {
  return Object.fromEntries(
    columns.map((column) => [column, labelFor(column, specs, projectConfig)]),
  );
}

/** The column a person named, by identifier or by label, in any case. An identifier wins. */
export function resolveColumn(input: string, labels: ColumnLabels): Column | null {
  const wanted = input.trim();
  const identifier = wanted.toUpperCase();
  if (Object.hasOwn(labels, identifier)) return identifier;
  return (
    Object.keys(labels).find((column) => labels[column].toLowerCase() === wanted.toLowerCase()) ??
    null
  );
}

/** What is wrong with a project's labels; empty when nothing is. */
export function labelErrors(sources: readonly LabelSource[]): string[] {
  const errors: string[] = [];
  const identifiers = new Set([Column.BACKLOG, Column.DONE, ...sources.map((s) => s.column)]);
  const seen = new Map<string, LabelSource>();
  for (const entry of sources) {
    const label = entry.label.trim();
    const where = `Column label "${entry.label}" in ${entry.source}`;
    if (label.length === 0) {
      errors.push(`${where} is empty.`);
      continue;
    }
    if (label.length > MAX_LABEL_LENGTH) {
      errors.push(`${where} is longer than ${MAX_LABEL_LENGTH} characters.`);
    }
    const identifier = label.toUpperCase();
    if (identifiers.has(identifier) && identifier !== entry.column) {
      errors.push(`${where} is the identifier of another column, ${identifier}.`);
    }
    const earlier = seen.get(label.toLowerCase());
    if (earlier) {
      errors.push(
        `${where} is also the label in ${earlier.source}. Labels must be unique within a project, whatever the case.`,
      );
    } else {
      seen.set(label.toLowerCase(), entry);
    }
  }
  return errors;
}

/**
 * Replaces each column identifier in a message with its label. For text built
 * with identifiers, which is how it is stored (halt messages are persisted).
 */
export function withColumnLabels(text: string, labels: ColumnLabels): string {
  return text.replace(/\b[A-Z][A-Z_]+\b/g, (word) =>
    Object.hasOwn(labels, word) ? labels[word] : word,
  );
}
