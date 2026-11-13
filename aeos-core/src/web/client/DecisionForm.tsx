// Web client — the generic, contract-driven decision form (tech spec §2.4,
// §3.13, §8 step 15): one input per command parameter not already fixed or
// locked by the caller, built from `GET /api/contract`'s own parameter
// schema rather than one hand-written form per command (AC-9, AC-22). Shows
// the git identity that will be recorded before the confirm control (AC-15),
// and asks for a native confirmation first when `confirmMessage` is given
// (AC-23's budget-clear).

import { useState } from 'react';
import type { FormEvent } from 'react';

import type { ContractCommand, ContractParameter } from '../../cli/contract/contract-schema.js';
import { postCli } from './api.js';
import {
  buildParameters,
  defaultValueFor,
  visibleParameters,
  type DecisionFormField,
  type FieldValue,
} from './decision-form-data.js';

export type { DecisionFormField };

export interface DecisionFormProps {
  readonly projectKey: string;
  readonly commandPath: string;
  readonly command: ContractCommand;
  /** Already known and never rendered (e.g. `{ id: ticketId }`). */
  readonly fixedValues: Readonly<Record<string, FieldValue>>;
  /** Per-parameter overrides: a locked value, or a `<select>`'s choices. */
  readonly fields?: Readonly<Record<string, DecisionFormField>>;
  /** Shown above the confirm control when the action will be recorded as a gate (AC-15). */
  readonly gitIdentity?: string | null;
  /** Asked via `window.confirm` before the action fires (AC-23). */
  readonly confirmMessage?: string;
  readonly submitLabel: string;
  readonly onDone: () => void;
}

function renderInput(
  parameter: ContractParameter,
  field: DecisionFormField | undefined,
  value: FieldValue,
  setValue: (next: FieldValue) => void,
) {
  if (field?.options) {
    return (
      <select
        required={parameter.required}
        value={String(value)}
        onChange={(event) => setValue(event.target.value)}
      >
        <option value="" disabled>
          Choose…
        </option>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  if (parameter.in === 'flag') {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(event) => setValue(event.target.checked)}
      />
    );
  }
  const isNumber = parameter.schema?.type === 'number';
  return (
    <input
      type={isNumber ? 'number' : 'text'}
      required={parameter.required}
      value={String(value)}
      onChange={(event) => setValue(isNumber ? event.target.valueAsNumber : event.target.value)}
    />
  );
}

export function DecisionForm({
  projectKey,
  commandPath,
  command,
  fixedValues,
  fields = {},
  gitIdentity,
  confirmMessage,
  submitLabel,
  onDone,
}: DecisionFormProps) {
  const fixedNames = new Set(Object.keys(fixedValues));
  const parameters = visibleParameters(command, fixedNames, fields);
  const [values, setValues] = useState<Record<string, FieldValue>>(() =>
    Object.fromEntries(parameters.map((parameter) => [parameter.name, defaultValueFor(parameter)])),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setBusy(true);
    setError(null);
    const envelope = await postCli(
      commandPath,
      buildParameters(command, fixedValues, fields, values),
      projectKey,
    );
    setBusy(false);
    if (!envelope.ok) {
      setError(envelope.error?.message ?? 'The action failed.');
      return;
    }
    onDone();
  };

  return (
    <form onSubmit={(event) => void submit(event)}>
      {gitIdentity !== undefined && (
        <p>Recorded as: {gitIdentity ?? 'no git identity configured'}</p>
      )}
      {parameters.map((parameter) => (
        <label key={parameter.name}>
          {parameter.name}
          {renderInput(parameter, fields[parameter.name], values[parameter.name], (next) =>
            setValues((prev) => ({ ...prev, [parameter.name]: next })),
          )}
        </label>
      ))}
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>
        {submitLabel}
      </button>
    </form>
  );
}
