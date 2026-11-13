// Web client — pure logic for DecisionForm (AC-9, AC-17, AC-22, AC-23): which
// of a command's parameters need an input, and how to turn the current field
// values into the `parameters` object the generic proxy (`postCli`) expects.
// Kept pure so the branching is unit-testable with no DOM, the same split
// Board.tsx/board-data.ts already use.

import type { ContractCommand, ContractParameter } from '../../cli/contract/contract-schema.js';

export type FieldValue = string | number | boolean;

export interface DecisionFormField {
  /** Locked to this value: never rendered, always sent as-is (AC-17's forced `--contract`). */
  readonly value?: FieldValue;
  /** Overrides the default input with a `<select>` of these choices (AC-22's move columns). */
  readonly options?: ReadonlyArray<{ readonly value: string; readonly label: string }>;
}

/** The parameters a form must render an input for: every one not fixed or locked. */
export function visibleParameters(
  command: ContractCommand,
  fixedNames: ReadonlySet<string>,
  fields: Readonly<Record<string, DecisionFormField>>,
): ContractParameter[] {
  return command.parameters.filter(
    (parameter) =>
      // `--json` is a global the proxy always adds; it is never a form field.
      parameter.name !== 'json' &&
      !fixedNames.has(parameter.name) &&
      fields[parameter.name]?.value === undefined,
  );
}

/** The value a rendered input starts with: unchecked for a flag, empty otherwise. */
export function defaultValueFor(parameter: ContractParameter): FieldValue {
  return parameter.in === 'flag' ? false : '';
}

/**
 * Merges fixed values (e.g. `id`), locked field values (e.g. a forced
 * `--contract`), and the form's current field state into one `parameters`
 * object — the exact shape `buildArgv` (cli-proxy.ts) expects, keyed by the
 * contract's own (kebab-case) parameter names.
 */
export function buildParameters(
  command: ContractCommand,
  fixedValues: Readonly<Record<string, FieldValue>>,
  fields: Readonly<Record<string, DecisionFormField>>,
  values: Readonly<Record<string, FieldValue>>,
): Record<string, FieldValue> {
  const parameters: Record<string, FieldValue> = { ...fixedValues };
  for (const parameter of command.parameters) {
    const { name } = parameter;
    if (name in parameters) continue;
    const locked = fields[name]?.value;
    if (locked !== undefined) {
      parameters[name] = locked;
    } else if (name in values) {
      parameters[name] = values[name];
    }
  }
  return parameters;
}
