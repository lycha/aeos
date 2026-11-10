// CLI contract — loads `cli-contract.yaml` into whole commands: every local
// `$ref` resolved and the globals applied.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import { z } from 'zod';

import { ContractSchema, type Contract } from './contract-schema.js';

const REF_PREFIX = '#/components/';

/** The package root holds the contract, from `src/cli/contract/` and from `dist/cli/contract/`. */
export function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

/** Replaces each `{ $ref }` with what it names. `trail` is the references being resolved. */
function resolveRefs(node: unknown, root: unknown, trail: readonly string[] = []): unknown {
  if (Array.isArray(node)) return node.map((item) => resolveRefs(item, root, trail));
  if (node === null || typeof node !== 'object') return node;
  const record = node as Record<string, unknown>;
  if (!('$ref' in record)) {
    return Object.fromEntries(
      Object.entries(record).map(([key, value]) => [key, resolveRefs(value, root, trail)]),
    );
  }

  const ref = record.$ref;
  if (typeof ref !== 'string' || !ref.startsWith(REF_PREFIX)) {
    throw new Error(
      `Invalid $ref ${JSON.stringify(ref)}: a reference is local, "${REF_PREFIX}<kind>/<name>".`,
    );
  }
  const siblings = Object.keys(record).filter((key) => key !== '$ref');
  if (siblings.length > 0) {
    throw new Error(
      `$ref "${ref}" has sibling keys (${siblings.join(', ')}). A $ref stands alone.`,
    );
  }
  if (trail.includes(ref)) {
    throw new Error(`$ref "${ref}" refers to itself: ${[...trail, ref].join(' → ')}.`);
  }
  const target = ref
    .slice(2)
    .split('/')
    .reduce<unknown>(
      (at, key) =>
        at !== null && typeof at === 'object' ? (at as Record<string, unknown>)[key] : undefined,
      root,
    );
  if (target === undefined)
    throw new Error(`$ref "${ref}" points nowhere: there is no such component.`);
  return resolveRefs(target, root, [...trail, ref]);
}

/** Parses the text of a contract. Throws naming the bad reference or the path of the bad field. */
export function parseContract(text: string): Contract {
  const document = yaml.load(text);
  const parsed = ContractSchema.safeParse(resolveRefs(document, document));
  if (!parsed.success) {
    throw new Error(`Invalid CLI contract:\n${z.prettifyError(parsed.error)}`);
  }
  const contract = parsed.data;
  const { globals } = contract;
  return {
    ...contract,
    commands: Object.fromEntries(
      Object.entries(contract.commands).map(([commandPath, command]) => [
        commandPath,
        {
          ...command,
          parameters: [...command.parameters, ...globals.parameters],
          responses: { ...globals.responses, ...command.responses },
        },
      ]),
    ),
  };
}

export function loadContract(file = path.join(packageRoot(), 'cli-contract.yaml')): Contract {
  return parseContract(fs.readFileSync(file, 'utf-8'));
}
