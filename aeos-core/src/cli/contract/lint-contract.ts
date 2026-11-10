// CLI contract — lint. The contract is edited by hand, so what the schema
// cannot say about it is checked here. Each finding names where it is.

import type { Contract, ContractParameter } from './contract-schema.js';

/** How a parameter is named in a finding or a report: `ticket move --reason`. */
export function parameterId(commandPath: string, parameter: ContractParameter): string {
  return parameter.in === 'argument'
    ? `${commandPath} argument ${parameter.name}`
    : `${commandPath} --${parameter.name}`;
}

const SCHEMA_KEYWORDS = [
  'type',
  'enum',
  'pattern',
  'minimum',
  'exclusiveMinimum',
  'format',
  'items',
];
const SCHEMA_TYPES = ['string', 'number', 'integer', 'boolean', 'array'];
const ITEM_KEYWORDS = ['type', 'enum', 'pattern'];

/** What a parameter schema uses outside the subset the header of the contract allows. */
function schemaFindings(schema: Record<string, unknown>): string[] {
  const findings = Object.keys(schema)
    .filter((keyword) => !SCHEMA_KEYWORDS.includes(keyword))
    .map((keyword) => `schema keyword "${keyword}" is not in the allowed subset`);
  if ('type' in schema && !SCHEMA_TYPES.includes(schema.type as string)) {
    findings.push(`schema type "${String(schema.type)}" is not in the allowed subset`);
  }
  if ('format' in schema && schema.format !== 'date') {
    findings.push(`schema format "${String(schema.format)}" is not in the allowed subset`);
  }
  if (schema.type === 'array' || 'items' in schema) {
    const items = (schema.items ?? {}) as Record<string, unknown>;
    if (schema.type !== 'array' || items.type !== 'string') {
      findings.push('an array schema is an array of string, and nothing else has items');
    }
    findings.push(
      ...Object.keys(items)
        .filter((keyword) => !ITEM_KEYWORDS.includes(keyword))
        .map((keyword) => `schema keyword "items.${keyword}" is not in the allowed subset`),
    );
  }
  return findings;
}

/** What is wrong with the contract; empty when nothing is. */
export function lintContract(contract: Contract): string[] {
  const findings: string[] = [];
  const untasked = (item: { status?: string; task?: string }): boolean =>
    item.status === 'proposed' && !item.task;

  for (const [name, resource] of Object.entries(contract.resources)) {
    if (untasked(resource)) findings.push(`resource ${name}: is proposed and names no task`);
  }

  const operations = new Map<string, string[]>();
  for (const [commandPath, command] of Object.entries(contract.commands)) {
    operations.set(command.operationId, [
      ...(operations.get(command.operationId) ?? []),
      commandPath,
    ]);
    if (untasked(command)) findings.push(`${commandPath}: is proposed and names no task`);

    const conditional = command.conditionalRequires ?? [];
    for (const resource of [...command.requires, ...conditional.map((entry) => entry.resource)]) {
      if (!(resource in contract.resources)) {
        findings.push(
          `${commandPath}: requires resource "${resource}", which is not declared under resources`,
        );
      }
    }
    for (const entry of conditional) {
      if (untasked(entry)) {
        findings.push(
          `${commandPath}: conditional resource ${entry.resource} is proposed and names no task`,
        );
      }
    }

    for (const code of Object.keys(command.responses)) {
      if (!(code in contract.exitCodes)) {
        findings.push(
          `${commandPath}: response "${code}" is not an exit code declared under exitCodes`,
        );
      }
    }
    if (!command.responses['0']?.data) {
      findings.push(`${commandPath}: needs a "0" response with a data schema`);
    }
    if (command.requires.length > 0 && !command.responses['4']) {
      findings.push(`${commandPath}: requires a resource and has no "4" response`);
    }

    const positional = command.parameters
      .filter((parameter) => parameter.in === 'argument')
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    if (positional.some((parameter, index) => parameter.position !== index + 1)) {
      findings.push(
        `${commandPath}: argument positions are ${positional.map((p) => p.position ?? 'unset').join(', ')}; they must run 1..n`,
      );
    }
    const firstOptional = positional.findIndex((parameter) => !parameter.required);
    for (const parameter of firstOptional < 0 ? [] : positional.slice(firstOptional)) {
      if (parameter.required) {
        findings.push(
          `${commandPath}: required argument ${parameter.name} comes after an optional one`,
        );
      }
    }

    for (const parameter of command.parameters) {
      const id = parameterId(commandPath, parameter);
      if (untasked(parameter)) findings.push(`${id}: is proposed and names no task`);
      if (parameter.in === 'option' && !(parameter.valueName && parameter.schema)) {
        findings.push(`${id}: an option needs a valueName and a schema`);
      }
      if (parameter.in === 'flag' && (parameter.valueName || parameter.schema)) {
        findings.push(`${id}: a flag takes neither a valueName nor a schema`);
      }
      if (parameter.in === 'option' && parameter.schema?.type === 'array' && !parameter.separator) {
        findings.push(`${id}: an array-valued option needs a separator`);
      }
      findings.push(
        ...schemaFindings(parameter.schema ?? {}).map((finding) => `${id}: ${finding}`),
      );
    }
  }

  for (const [operationId, paths] of operations) {
    if (paths.length > 1) {
      findings.push(`operationId ${operationId} is used by ${paths.join(' and ')}`);
    }
  }
  return findings;
}
