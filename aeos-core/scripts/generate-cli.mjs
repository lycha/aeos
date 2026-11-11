#!/usr/bin/env node
// Generates the command scaffold from cli-contract.yaml (I1-M4-004b, 004c):
// Commander registration with its parameter checks, argument, option and
// output types, resource lists, the environment table, the exit codes, and the
// command reference in README.md and skills/aeos/SKILL.md.
//
//   node scripts/generate-cli.mjs              write the files
//   node scripts/generate-cli.mjs --check      fail if a committed file differs
//   node scripts/generate-cli.mjs --resolved   print the contract, $refs resolved and globals applied
//   --contract <file>   another contract      --out <dir>   write (or check) under another root
//   --landed <a,b>      the landed list below, for a test
//
// Plain Node: it runs before the build. The same contract always gives the same bytes.

import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';

const ROOT = path.resolve(import.meta.dirname, '..');
const HEADER = '// GENERATED from cli-contract.yaml — do not edit';
const BEGIN = '<!-- BEGIN GENERATED CLI REFERENCE -->';
const END = '<!-- END GENERATED CLI REFERENCE -->';
const DOCS = ['README.md', 'skills/aeos/SKILL.md'];

// A proposed item is generated once the contract says `existing`. These are
// built and the contract still marks them proposed (`npm run verify:contract`
// lists each as landed); the contract is its owner's to update, so until then
// they are named here. An entry the contract no longer marks proposed stops the
// generator: delete it. A bare `--name` is that parameter on every command
// that declares it.
const LANDED = [
  '--json',
  '--yes',
  'ticket create --spec',
  'ticket create --bug',
  'ticket create --implements',
  'ticket sign-off --reason',
  'ticket move --reason',
  'ticket dod-approve --reason',
  'ticket dod-approve --verified',
  'ticket repin',
  'orchestrator clear-budget',
  'costs',
];

const flags = {};
for (let at = 2; at < process.argv.length; at++) {
  const name = process.argv[at].replace(/^--/, '');
  flags[name] = ['check', 'resolved'].includes(name) ? true : process.argv[++at];
}

// ── The contract, whole: every local $ref resolved, the globals applied ──────
function resolveRefs(node, root) {
  if (Array.isArray(node)) return node.map((item) => resolveRefs(item, root));
  if (node === null || typeof node !== 'object') return node;
  if (!('$ref' in node)) {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [key, resolveRefs(value, root)]),
    );
  }
  const target = node.$ref
    .slice(2)
    .split('/')
    .reduce((at, key) => at?.[key], root);
  if (target === undefined) throw new Error(`$ref "${node.$ref}" points nowhere.`);
  return resolveRefs(target, root);
}

const raw = yaml.load(
  fs.readFileSync(flags.contract ?? path.join(ROOT, 'cli-contract.yaml'), 'utf-8'),
);
const document = yaml.load(
  fs.readFileSync(flags.contract ?? path.join(ROOT, 'cli-contract.yaml'), 'utf-8'),
);
const contract = resolveRefs(document, document);
for (const command of Object.values(contract.commands)) {
  command.parameters = [...command.parameters, ...contract.globals.parameters];
  command.responses = { ...contract.globals.responses, ...command.responses };
}
if (flags.resolved) {
  // Exiting before the pipe drains would cut the output short.
  await new Promise((done) => process.stdout.write(`${JSON.stringify(contract, null, 2)}\n`, done));
  process.exit(0);
}

// ── What is generated: everything existing, and the proposed items that landed ─
const landedIds = flags.landed?.split(',') ?? (flags.contract ? [] : LANDED);
const proposed = new Set();
const built = (item, ...ids) => {
  if (item.status !== 'proposed') return true;
  for (const id of ids) proposed.add(id);
  return ids.some((id) => landedIds.includes(id));
};
const resources = Object.entries(contract.resources).filter(
  ([, resource]) => resource.status !== 'proposed',
);
const hasGuard = (name) => resources.some(([resource]) => resource === name);

const commands = Object.entries(contract.commands)
  .filter(([commandPath, command]) => built(command, commandPath))
  .map(([commandPath, command]) => {
    const words = commandPath.split(' ');
    if (words.length > 2) throw new Error(`"${commandPath}": commands nest one level at most.`);
    const parameters = command.parameters.filter((parameter) =>
      built(parameter, `${commandPath} --${parameter.name}`, `--${parameter.name}`),
    );
    return {
      path: commandPath,
      group: words.length === 2 ? words[0] : null,
      name: words.at(-1),
      id: command.operationId,
      summary: command.summary,
      positional: parameters
        .filter((parameter) => parameter.in === 'argument')
        .sort((a, b) => a.position - b.position),
      named: parameters.filter((parameter) => parameter.in !== 'argument'),
      requires: command.requires.filter(hasGuard),
      conditional: (command.conditionalRequires ?? []).filter(
        (entry) => entry.status !== 'proposed' && hasGuard(entry.resource),
      ),
      responses: command.responses,
    };
  });

for (const id of landedIds) {
  const [commandPath, parameterName] = id.split(/ ?--/);
  const named =
    parameterName === undefined
      ? id in contract.commands
      : Object.entries(contract.commands).some(
          ([candidate, command]) =>
            (commandPath === '' || candidate === commandPath) &&
            command.parameters.some((parameter) => parameter.name === parameterName),
        );
  if (named && !proposed.has(id)) {
    throw new Error(
      `"${id}" is no longer marked proposed in the contract: delete it from LANDED in scripts/generate-cli.mjs.`,
    );
  }
}

// ── TypeScript ────────────────────────────────────────────────────────────────
const quote = (text) => `'${String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const camel = (name) => name.replace(/-(\w)/g, (_, letter) => letter.toUpperCase());
const pascal = (id) => id[0].toUpperCase() + id.slice(1);
const placeholder = (parameter) =>
  parameter.required ? `<${parameter.name}>` : `[${parameter.name}]`;
const optionFlags = (parameter) =>
  parameter.in === 'flag'
    ? `--${parameter.name}`
    : `--${parameter.name} <${parameter.valueName}>`;

function typeOf(parameter) {
  if (parameter.in === 'flag') return 'boolean';
  const schema = parameter.schema ?? {};
  if (schema.enum) return schema.enum.map(quote).join(' | ');
  if (schema.type === 'array') return 'string[]';
  return schema.type === 'number' || schema.type === 'integer' ? 'number' : 'string';
}

function coercion(parameter) {
  const type = parameter.schema?.type;
  if (type === 'number') return ', parseFloat';
  if (type === 'integer') return ', integer';
  return type === 'array' ? `, list(${quote(parameter.separator)})` : '';
}

// ── Output types: the JSON Schemas that describe shape, as TypeScript ─────────
// Keywords that only constrain a value change no type; tests hold output to them.
const VALUE_ONLY = ['description', 'pattern', 'minimum', 'exclusiveMinimum', 'format', '$schema'];
const SHAPE = [
  'type',
  'enum',
  'const',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'anyOf',
  '$ref',
];
const literal = (value) => (typeof value === 'string' ? quote(value) : String(value));

function tsType(schema, where) {
  for (const key of Object.keys(schema)) {
    // An allOf of if/then/else alone constrains values, as the envelope's does.
    const conditions =
      key === 'allOf' &&
      schema.allOf.every((member) =>
        Object.keys(member).every((word) => ['if', 'then', 'else'].includes(word)),
      );
    if (!conditions && !SHAPE.includes(key) && !VALUE_ONLY.includes(key)) {
      throw new Error(`${where}: the type generator does not support "${key}".`);
    }
  }
  if ('$ref' in schema) {
    const name = /^#\/components\/schemas\/(\w+)$/.exec(schema.$ref)?.[1];
    if (!name) throw new Error(`${where}: "${schema.$ref}" is not a schema under components.`);
    return name;
  }
  if ('const' in schema) return literal(schema.const);
  if (schema.enum) return schema.enum.map(literal).join(' | ');
  if (schema.anyOf) return schema.anyOf.map((member) => tsType(member, where)).join(' | ');
  const types = [schema.type ?? []].flat();
  if (types.length === 0) return 'unknown';
  return types
    .map((type) => {
      if (type === 'integer') return 'number';
      if (type === 'array') return `Array<${tsType(schema.items ?? {}, where)}>`;
      if (type !== 'object') return type;
      if (!schema.properties) {
        const extra = schema.additionalProperties;
        return `Record<string, ${extra && typeof extra === 'object' ? tsType(extra, where) : 'unknown'}>`;
      }
      const fields = Object.entries(schema.properties).map(
        ([name, property]) =>
          `${name}${schema.required?.includes(name) ? '' : '?'}: ${tsType(property, `${where}.${name}`)}`,
      );
      return `{ ${fields.join('; ')} }`;
    })
    .join(' | ');
}

/** What a command returns as `data`: every shape its responses declare. */
function dataType(command) {
  const shapes = Object.entries(raw.commands[command.path].responses).flatMap(([exit, response]) => {
    const declared =
      '$ref' in response ? raw.components.responses[response.$ref.split('/').at(-1)] : response;
    return declared.data ? [tsType(declared.data, `${command.path} response ${exit}`)] : [];
  });
  return [...new Set(shapes)].join(' | ') || 'null';
}

function exitCodesFile() {
  return [
    HEADER,
    '',
    `export const CONTRACT_VERSION = ${contract.contractVersion};`,
    '',
    '/** The whole exit-code vocabulary, by name. */',
    'export const EXIT = {',
    ...Object.entries(contract.exitCodes).map(([code, { name }]) => `  ${name}: ${code},`),
    '} as const;',
    '',
    'export type ExitCode = (typeof EXIT)[keyof typeof EXIT];',
    '',
  ].join('\n');
}

function typesFile() {
  const fields = (parameters) =>
    parameters
      .map((parameter) => {
        const optional = parameter.in === 'flag' || !parameter.required;
        return `  ${camel(parameter.name)}${optional ? '?' : ''}: ${typeOf(parameter)};\n`;
      })
      .join('');
  return [
    HEADER,
    '/* eslint-disable @typescript-eslint/no-empty-object-type */',
    ...commands.flatMap((command) => [
      '',
      `export interface ${pascal(command.id)}Args {\n${fields(command.positional)}}`,
      '',
      `export interface ${pascal(command.id)}Options {\n${fields(command.named)}}`,
      '',
      `export type ${pascal(command.id)}Data = ${dataType(command)};`,
    ]),
    ...Object.entries(raw.components.schemas).flatMap(([name, schema]) => [
      '',
      `export type ${name} = ${tsType(schema, name)};`,
    ]),
    '',
  ].join('\n');
}

function resourcesFile() {
  const names = (list) => `[${list.map(quote).join(', ')}]`;
  return [
    HEADER,
    '',
    `export type ResourceName = ${resources.map(([name]) => quote(name)).join(' | ') || 'never'};`,
    '',
    '/** What must be in place, and what to do when it is not. */',
    'export const RESOURCES: Record<ResourceName, { description: string; fix: string }> = {',
    ...resources.map(
      ([name, { description, fix }]) =>
        `  ${name}: { description: ${quote(description)}, fix: ${quote(fix)} },`,
    ),
    '};',
    '',
    '/** Per operationId: checked before the handler, and what the handler may ask for in a stated case. */',
    'export const COMMAND_RESOURCES = {',
    ...commands.map(
      (command) =>
        `  ${command.id}: { requires: ${names(command.requires)}, conditionalRequires: ${names(command.conditional.map((entry) => entry.resource))} },`,
    ),
    '} as const satisfies Record<',
    '  string,',
    '  { requires: readonly ResourceName[]; conditionalRequires: readonly ResourceName[] }',
    '>;',
    '',
    'export type OperationId = keyof typeof COMMAND_RESOURCES;',
    '',
    '/** The resources a command declares: the only ones its handler may `require`. */',
    'export type Declared<Id extends OperationId> =',
    "  (typeof COMMAND_RESOURCES)[Id]['requires' | 'conditionalRequires'][number];",
    '',
  ].join('\n');
}

function environmentFile() {
  return [
    HEADER,
    '',
    '/** Every variable the CLI reads. A variable not listed here is not an input. */',
    'export const ENVIRONMENT = {',
    ...Object.entries(contract.environment).map(
      ([name, variable]) =>
        `  ${name}: { description: ${quote(variable.description)}, default: ${variable.default === undefined ? 'null' : quote(variable.default)} },`,
    ),
    '} as const;',
    '',
  ].join('\n');
}

/** A parameter schema as a literal, or null when a string can be anything. */
function checkOf(schema) {
  const parts = Object.entries(schema).flatMap(([key, value]) => {
    if (key === 'items') {
      const items = checkOf(value);
      return items ? [`items: ${items}`] : [];
    }
    if (key === 'enum') return [`enum: [${value.map(quote).join(', ')}]`];
    return [`${key}: ${typeof value === 'string' ? quote(value) : value}`];
  });
  const plain =
    parts.length === 0 || (['string', 'array'].includes(schema.type) && parts.length === 1);
  return plain ? null : `{ ${parts.join(', ')} }`;
}

function commandsFile() {
  const declared = new Set();
  const register = (command) => {
    const args = command.positional.map(
      (parameter) =>
        `${camel(parameter.name)}: string${parameter.required ? '' : ' | undefined'}`,
    );
    const options = `T.${pascal(command.id)}Options`;
    // A group is declared where its first command is, so help lists them in the contract's order.
    const group =
      command.group && !declared.has(command.group)
        ? ['', `  const ${camel(command.group)} = program.command(${quote(command.group)});`]
        : [];
    if (command.group) declared.add(command.group);
    return [
      ...group,
      '',
      `  ${command.group ? camel(command.group) : 'program'}`,
      `    .command(${quote(command.name)})`,
      `    .description(${quote(command.summary)})`,
      ...command.positional.map(
        (parameter) =>
          `    .argument(${quote(placeholder(parameter))}, ${quote(parameter.description)})`,
      ),
      ...command.named.map(
        (parameter) =>
          `    .${parameter.required ? 'requiredOption' : 'option'}(${quote(optionFlags(parameter))}, ${quote(parameter.description)}${coercion(parameter)})`,
      ),
      `    .action((${[...args, `options: ${options}`].join(', ')}) =>`,
      `      run(resources, setExit, ${quote(command.id)}, ${quote(command.path)}, options, [`,
      ...[...command.positional, ...command.named].flatMap((parameter) => {
        const checked = checkOf(parameter.schema ?? {});
        const name = camel(parameter.name);
        return checked
          ? [
              `        [${quote(parameter.in === 'argument' ? parameter.name : `--${parameter.name}`)}, ${parameter.in === 'argument' ? name : `options.${name}`}, ${checked}],`,
            ]
          : [];
      }),
      '      ], (context) =>',
      `        handlers.${command.id}(${command.positional.length > 0 ? `{ ${command.positional.map((parameter) => camel(parameter.name)).join(', ')} }` : '{}'}, options, context),`,
      '      ),',
      '    );',
    ].join('\n');
  };
  return [
    HEADER,
    '',
    "import type { Command } from 'commander';",
    '',
    "import { render, setProcessExit } from '../render.js';",
    "import type { CommandContext, Resources } from '../resources.js';",
    "import { failed, missingResource, stopped, type CommandResult } from '../result.js';",
    'import {',
    '  COMMAND_RESOURCES,',
    '  type Declared,',
    '  type OperationId,',
    '  type ResourceName,',
    "} from './resources.gen.js';",
    "import type * as T from './types.gen.js';",
    '',
    'type Handler<Id extends OperationId, Args, Options, Data> = (',
    '  args: Args,',
    '  options: Options,',
    '  context: CommandContext<Declared<Id>>,',
    ') => Promise<CommandResult<Data>>;',
    '',
    '/** One handler per command, by operationId. */',
    'export interface Handlers {',
    ...commands.map(
      (command) =>
        `  ${command.id}: Handler<${quote(command.id)}, T.${pascal(command.id)}Args, T.${pascal(command.id)}Options, T.${pascal(command.id)}Data>;`,
    ),
    '}',
    '',
    'const integer = (value: string): number => parseInt(value, 10);',
    'const list =',
    '  (separator: string) =>',
    '  (value: string): string[] =>',
    '    value',
    '      .split(separator)',
    '      .map((item) => item.trim())',
    '      .filter(Boolean);',
    '',
    '/** The subset of JSON Schema a parameter may carry (the header of the contract fixes it). */',
    'interface ParameterSchema {',
    '  readonly type?: string;',
    '  readonly enum?: readonly string[];',
    '  readonly pattern?: string;',
    '  readonly minimum?: number;',
    '  readonly exclusiveMinimum?: number;',
    '  readonly format?: string;',
    '  readonly items?: ParameterSchema;',
    '}',
    '',
    '/** What is wrong with a value, or null. */',
    'function violation(value: unknown, schema: ParameterSchema): string | null {',
    '  if (Array.isArray(value)) {',
    '    return value.map((item) => violation(item, schema.items ?? {})).find(Boolean) ?? null;',
    '  }',
    "  if ((schema.type === 'number' || schema.type === 'integer') && Number.isNaN(value)) {",
    "    return 'must be a number';",
    '  }',
    '  if (schema.enum && !schema.enum.includes(String(value))) {',
    "    return `must be one of ${schema.enum.join(', ')}`;",
    '  }',
    '  if (schema.pattern && !new RegExp(schema.pattern).test(String(value))) {',
    '    return `must match ${schema.pattern}`;',
    '  }',
    '  if (schema.minimum !== undefined && Number(value) < schema.minimum) {',
    '    return `must be at least ${schema.minimum}`;',
    '  }',
    '  if (schema.exclusiveMinimum !== undefined && Number(value) <= schema.exclusiveMinimum) {',
    '    return `must be greater than ${schema.exclusiveMinimum}`;',
    '  }',
    "  if (schema.format === 'date' && !/^\\d{4}-\\d{2}-\\d{2}$/.test(String(value))) {",
    "    return 'must be a date as YYYY-MM-DD';",
    '  }',
    '  return null;',
    '}',
    '',
    '/**',
    ' * Checks the parameters, then the resources, then runs the handler; the first',
    ' * thing wrong stops it. Whatever the outcome, this is where it is written.',
    ' */',
    'async function run<Id extends OperationId, Data>(',
    '  resources: Resources,',
    '  setExit: (code: number) => void,',
    '  id: Id,',
    '  command: string,',
    '  options: { json?: boolean },',
    '  checks: readonly (readonly [string, unknown, ParameterSchema])[],',
    '  handle: (context: CommandContext<Declared<Id>>) => Promise<CommandResult<Data>>,',
    '): Promise<void> {',
    '  let result: CommandResult<unknown>;',
    '  try {',
    '    const require = (resource: ResourceName): CommandResult<never> | null =>',
    '      resources.inPlace(resource, options) ? null : missingResource(resource);',
    '    const invalid = checks',
    '      .filter(([, value]) => value !== undefined)',
    '      .map(([name, value, schema]) => [name, value, violation(value, schema)] as const)',
    '      .find(([, , problem]) => problem !== null);',
    '    const requires: readonly ResourceName[] = COMMAND_RESOURCES[id].requires;',
    '    const missing = invalid',
    '      ? undefined',
    '      : requires.find((resource) => !resources.inPlace(resource, options));',
    '    result = invalid',
    "      ? stopped('usage', 'INVALID_ARGUMENT', `${invalid[0]} ${invalid[2]}, got '${String(invalid[1])}'.`)",
    '      : missing',
    '        ? missingResource(missing)',
    '        : await handle(resources.context(require));',
    '  } catch (error) {',
    '    result = failed(error);',
    '  }',
    '  render(command, result, options.json === true, setExit);',
    '}',
    '',
    '/** Builds the whole command tree from the contract. */',
    'export function registerGenerated(',
    '  program: Command,',
    '  handlers: Handlers,',
    '  resources: Resources,',
    '  setExit: (code: number) => void = setProcessExit,',
    '): void {',
    ...commands.map(register),
    '}',
    '',
  ].join('\n');
}

// ── The command reference ─────────────────────────────────────────────────────
function reference() {
  const cell = (text) => String(text).replace(/\|/g, '\\|');
  const code = (text) => `\`${text}\``;
  const lines = [
    BEGIN,
    '<!-- Generated from cli-contract.yaml by `npm run generate:cli`. Do not edit between the markers. -->',
  ];
  for (const command of commands) {
    const parameters = [
      ...command.positional.map((parameter) => [placeholder(parameter), parameter]),
      ...command.named.map((parameter) => [optionFlags(parameter), parameter]),
    ];
    lines.push(
      '',
      `### ${code(['aeos', command.path, '[options]', ...command.positional.map(placeholder)].join(' '))}`,
      '',
      command.summary,
      '',
    );
    if (parameters.length > 0) {
      lines.push(
        '| Parameter | Description |',
        '| --- | --- |',
        ...parameters.map(
          ([usage, parameter]) =>
            `| ${code(usage)}${parameter.in === 'option' && parameter.required ? ' (required)' : ''} | ${cell(parameter.description)} |`,
        ),
        '',
      );
    }
    lines.push(
      `Requires: ${command.requires.map(code).join(', ') || 'nothing'}.${command.conditional.map((entry) => ` Also ${code(entry.resource)} when: ${entry.when}`).join('')}`,
      '',
      'Exit codes:',
      '',
      ...Object.entries(command.responses)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([exit, response]) => `- ${code(exit)} ${response.description}`),
    );
  }
  lines.push(
    '',
    '### Resources',
    '',
    '| Resource | What must be in place | Fix |',
    '| --- | --- | --- |',
    ...resources.map(
      ([name, { description, fix }]) => `| ${code(name)} | ${cell(description)} | ${cell(fix)} |`,
    ),
    '',
    '### Environment variables',
    '',
    '| Variable | Default | Description |',
    '| --- | --- | --- |',
    ...Object.entries(contract.environment).map(
      ([name, variable]) =>
        `| ${code(name)} | ${variable.default === undefined ? 'unset' : code(variable.default)} | ${cell(variable.description)} |`,
    ),
    '',
    '### Exit-code vocabulary',
    '',
    '| Code | Name | Meaning |',
    '| --- | --- | --- |',
    ...Object.entries(contract.exitCodes).map(
      ([exit, { name, meaning }]) => `| ${exit} | ${name} | ${cell(meaning)} |`,
    ),
    '',
  );
  return lines.join('\n');
}

// ── Write, or check ───────────────────────────────────────────────────────────
const base = flags.out ? path.resolve(flags.out) : ROOT;
const outputs = new Map([
  ['src/cli/generated/commands.gen.ts', commandsFile()],
  ['src/cli/generated/types.gen.ts', typesFile()],
  ['src/cli/generated/resources.gen.ts', resourcesFile()],
  ['src/cli/generated/environment.gen.ts', environmentFile()],
  ['src/cli/generated/exit-codes.gen.ts', exitCodesFile()],
]);
for (const doc of DOCS) {
  const file = [path.join(base, doc), path.join(ROOT, doc)].find((candidate) =>
    fs.existsSync(candidate),
  );
  const text = fs.readFileSync(file, 'utf-8');
  const [begin, end] = [text.indexOf(BEGIN), text.indexOf(END)];
  if (begin < 0 || end < begin) throw new Error(`${doc} has no "${BEGIN}" … "${END}" markers.`);
  outputs.set(doc, text.slice(0, begin) + reference() + text.slice(end));
}

if (flags.check) {
  const stale = [...outputs].filter(
    ([file, content]) =>
      !fs.existsSync(path.join(base, file)) ||
      fs.readFileSync(path.join(base, file), 'utf-8') !== content,
  );
  for (const [file] of stale) {
    process.stderr.write(`${file} is not what cli-contract.yaml generates.\n`);
  }
  if (stale.length > 0) {
    process.stderr.write('Run `npm run generate:cli`; never edit generated code by hand.\n');
    process.exitCode = 1;
  }
} else {
  for (const [file, content] of outputs) {
    fs.mkdirSync(path.dirname(path.join(base, file)), { recursive: true });
    fs.writeFileSync(path.join(base, file), content, 'utf-8');
  }
}
