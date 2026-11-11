#!/usr/bin/env node
// Generates the command scaffold from cli-contract.yaml (I1-M4-004b): Commander
// registration, argument and option types, resource lists, the environment
// table, and the command reference in README.md and skills/aeos/SKILL.md.
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

// A proposed item is generated once the contract says `existing`. These ten are
// built and the contract still marks them proposed (`npm run verify:contract`
// lists each as landed); the contract is its owner's to update, so until then
// they are named here. An entry the contract no longer marks proposed stops the
// generator: delete it.
const LANDED = [
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
const built = (id, item) => {
  if (item.status !== 'proposed') return true;
  proposed.add(id);
  return landedIds.includes(id);
};
const resources = Object.entries(contract.resources).filter(
  ([, resource]) => resource.status !== 'proposed',
);
const hasGuard = (name) => resources.some(([resource]) => resource === name);

const commands = Object.entries(contract.commands)
  .filter(([commandPath, command]) => built(commandPath, command))
  .map(([commandPath, command]) => {
    const words = commandPath.split(' ');
    if (words.length > 2) throw new Error(`"${commandPath}": commands nest one level at most.`);
    const parameters = command.parameters.filter((parameter) =>
      built(`${commandPath} --${parameter.name}`, parameter),
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
  const named = id.includes(' --')
    ? contract.commands[id.split(' --')[0]]?.parameters.some(
        (parameter) => parameter.name === id.split(' --')[1],
      )
    : id in contract.commands;
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
      `      run(resources, ${quote(command.id)}, options, (context) =>`,
      `        handlers.${command.id}(${command.positional.length > 0 ? `{ ${command.positional.map((parameter) => camel(parameter.name)).join(', ')} }` : '{}'}, options, context),`,
      '      ),',
      '    );',
    ].join('\n');
  };
  return [
    HEADER,
    '/* eslint-disable no-console */',
    '',
    "import type { Command } from 'commander';",
    '',
    "import type { CommandContext, Resources } from '../resources.js';",
    'import {',
    '  COMMAND_RESOURCES,',
    '  RESOURCES,',
    '  type Declared,',
    '  type OperationId,',
    '  type ResourceName,',
    "} from './resources.gen.js';",
    "import type * as T from './types.gen.js';",
    '',
    'type Handler<Id extends OperationId, Args, Options> = (',
    '  args: Args,',
    '  options: Options,',
    '  context: CommandContext<Declared<Id>>,',
    ') => Promise<void>;',
    '',
    '/** One handler per command, by operationId. */',
    'export interface Handlers {',
    ...commands.map(
      (command) =>
        `  ${command.id}: Handler<${quote(command.id)}, T.${pascal(command.id)}Args, T.${pascal(command.id)}Options>;`,
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
    "/** Checks the command's resources, then runs its handler. The first one missing stops it. */",
    'async function run<Id extends OperationId>(',
    '  resources: Resources,',
    '  id: Id,',
    '  options: object,',
    '  handle: (context: CommandContext<Declared<Id>>) => Promise<void>,',
    '): Promise<void> {',
    '  const require = (resource: ResourceName): boolean => {',
    '    if (resources.inPlace(resource, options)) return true;',
    '    const { description, fix } = RESOURCES[resource];',
    '    console.error(`Error: a required resource is not in place: ${resource}.\\n  ${description}\\n  ${fix}`);',
    '    process.exitCode = 1;',
    '    return false;',
    '  };',
    '  const requires: readonly ResourceName[] = COMMAND_RESOURCES[id].requires;',
    '  if (requires.every(require)) await handle(resources.context(require));',
    '}',
    '',
    '/** Builds the whole command tree from the contract. */',
    'export function registerGenerated(',
    '  program: Command,',
    '  handlers: Handlers,',
    '  resources: Resources,',
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
