// Test fixture — the output half of the contract check (I1-M4-004c): is what a
// command wrote under --json what the contract declares for the way it exited?
// It lives in test code because the JSON Schema validator is a dev dependency.

import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';

import type { Contract } from './contract-schema.js';

const compile = (schema: unknown): ValidateFunction =>
  new Ajv2020({ allErrors: true }).compile(schema as object);

/** Every output schema of the contract that is not itself valid JSON Schema 2020-12. */
export function schemaProblems(contract: Contract): string[] {
  const schemas: [string, unknown][] = [
    ...Object.entries(contract.components.schemas).map(([name, schema]): [string, unknown] => [
      `components.schemas.${name}`,
      schema,
    ]),
    ...Object.entries(contract.commands).flatMap(([commandPath, command]) =>
      Object.entries(command.responses).flatMap(([exit, response]): [string, unknown][] =>
        response.data ? [[`${commandPath} response ${exit}`, response.data]] : [],
      ),
    ),
  ];
  return schemas.flatMap(([where, schema]) => {
    try {
      compile(schema);
      return [];
    } catch (error) {
      return [`${where}: ${error instanceof Error ? error.message : String(error)}`];
    }
  });
}

/** What is wrong with a command's stdout under --json and its exit code. Empty when nothing is. */
export function outputProblems(
  contract: Contract,
  commandPath: string,
  stdout: string,
  exitCode: number,
): string[] {
  let envelope: { exit?: unknown; data?: unknown; error?: { resource?: unknown } | null };
  try {
    envelope = JSON.parse(stdout) as typeof envelope;
  } catch {
    return [`${commandPath}: stdout is not one JSON object: ${stdout.slice(0, 200)}`];
  }
  const problems: string[] = [];
  const said = (validate: ValidateFunction, what: string): void => {
    for (const error of validate.errors ?? []) {
      problems.push(
        `${commandPath}: ${what}${error.instancePath} ${error.message} ${JSON.stringify(error.params)}`,
      );
    }
  };

  const validEnvelope = compile(contract.components.schemas.Envelope);
  if (!validEnvelope(envelope)) said(validEnvelope, 'envelope');
  if (envelope.exit !== exitCode) {
    problems.push(
      `${commandPath}: the envelope says exit ${String(envelope.exit)}; it exited ${exitCode}`,
    );
  }

  const response = contract.commands[commandPath].responses[String(exitCode)];
  if (!response) {
    problems.push(`${commandPath}: exit ${exitCode} is not a response of the command`);
  } else if (envelope.data === null) {
    if (exitCode === 0 && response.data) problems.push(`${commandPath}: data is null on success`);
  } else if (!response.data) {
    problems.push(`${commandPath}: response ${exitCode} declares no data, and data is set`);
  } else {
    const validData = compile(response.data);
    if (!validData(envelope.data)) said(validData, 'data');
  }

  const names = envelope.error?.resource != null;
  if (names !== (exitCode === 4)) {
    problems.push(`${commandPath}: error.resource is set exactly when the exit code is 4`);
  }
  return problems;
}
