import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Command } from 'commander';
import { afterEach, describe, expect, it } from 'vitest';

import { buildProgram } from './index.js';
import { FIXTURE_CONTRACT } from './contract/contract.fixture.js';
import type { Handlers } from './generated/commands.gen.js';
import { loadContract, packageRoot } from './contract/load-contract.js';
import { done } from './result.js';

const GENERATED = ['commands', 'types', 'resources', 'environment', 'exit-codes'].map(
  (name) => `src/cli/generated/${name}.gen.ts`,
);
const DOCS = ['README.md', 'skills/aeos/SKILL.md'];

const temps: string[] = [];
const tempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-generate-'));
  temps.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** Runs `scripts/generate-cli.mjs`. */
function generate(...args: string[]): { status: number | null; output: string } {
  const run = spawnSync(
    'node',
    [path.join(packageRoot(), 'scripts', 'generate-cli.mjs'), ...args],
    { encoding: 'utf-8' },
  );
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}
const read = (root: string, file: string): string =>
  fs.readFileSync(path.join(root, file), 'utf-8');

/** Generates from a contract of the test's own into a temp directory, and returns it. */
function generateFrom(contract: string): string {
  const out = tempDir();
  const file = path.join(out, 'contract.yaml');
  fs.writeFileSync(file, contract, 'utf-8');
  const run = generate('--contract', file, '--out', out);
  expect(run.status, run.output).toBe(0);
  return out;
}

/** The fixture contract with a command that exercises every parameter shape. */
const SHAPES = `${FIXTURE_CONTRACT}
  shapes run:
    operationId: shapesRun
    summary: It's every shape
    requires: [project]
    conditionalRequires:
      - { resource: git, when: --push is given. }
      - { resource: gh, when: A pull request is opened., status: proposed, task: T-1 }
    parameters:
      - { name: epicId, in: argument, position: 1, required: false, description: Epic, schema: { type: string } }
      - { name: body-file, in: option, valueName: path, description: A file, schema: { type: string } }
      - { name: budget, in: option, valueName: usd, description: Ceiling, schema: { type: number } }
      - { name: max-steps, in: option, valueName: "n", description: Bound, schema: { type: integer } }
      - { name: ids, in: option, valueName: ids, description: Ids, separator: ",", schema: { type: array, items: { type: string } } }
      - { name: executor, in: option, valueName: type, description: Which, schema: { type: string, enum: [claude-cli, stub] } }
      - { name: push, in: flag, description: Push }
    responses:
      "0": { description: Done, data: { type: object } }
`.replace('  gh: {', '  git: { description: A git repository, fix: Run git init }\n  gh: {');

/** The fixture contract with named schemas, and a response that uses them. */
const TYPED = FIXTURE_CONTRACT.replace(
  '    Envelope: { type: object }',
  `    Envelope: { type: object }
    Kind: { enum: [EPIC, TASK] }
    Usd: { type: [number, "null"], minimum: 0, description: US dollars }
    Moved:
      type: object
      additionalProperties: false
      required: [id, kind, tags, by, next, fixed]
      properties:
        id: { type: string, pattern: "^[A-Z]+-[0-9]+$" }
        kind: { $ref: "#/components/schemas/Kind" }
        costUsd: { $ref: "#/components/schemas/Usd" }
        tags: { type: array, items: { type: string } }
        by: { type: object, additionalProperties: { $ref: "#/components/schemas/Usd" } }
        next: { anyOf: [{ $ref: "#/components/schemas/Kind" }, { type: "null" }] }
        fixed: { const: true }`,
).replace(
  '"0": { description: Moved, data: { type: object } }',
  '"0": { description: Moved, data: { $ref: "#/components/schemas/Moved" } }',
);

describe('scripts/generate-cli.mjs', () => {
  it('writes byte-identical output when run twice', () => {
    const [first, second] = [tempDir(), tempDir()];
    expect(generate('--out', first).status).toBe(0);
    expect(generate('--out', second).status).toBe(0);

    for (const file of [...GENERATED, ...DOCS]) {
      expect(read(second, file), file).toBe(read(first, file));
    }
  });

  it('marks every generated file as generated', () => {
    for (const file of GENERATED) {
      expect(read(packageRoot(), file).split('\n')[0], file).toBe(
        '// GENERATED from cli-contract.yaml — do not edit',
      );
    }
  });

  it('finds the committed files current, and fails on a hand edit', () => {
    expect(generate('--check').output).toBe('');
    expect(generate('--check').status).toBe(0);

    const out = tempDir();
    generate('--out', out);
    expect(generate('--check', '--out', out).status).toBe(0);
    fs.appendFileSync(path.join(out, GENERATED[0]), '// a hand edit\n');

    const check = generate('--check', '--out', out);
    expect(check.status).toBe(1);
    expect(check.output).toContain('commands.gen.ts');
  });

  it('resolves the contract to the same structure as the TypeScript loader', () => {
    const resolved = JSON.parse(generate('--resolved').output) as unknown;

    expect(resolved).toEqual(JSON.parse(JSON.stringify(loadContract())));
  });

  it('skips what is proposed, and takes the current wording, never the pending one', () => {
    const out = generateFrom(FIXTURE_CONTRACT);
    const commands = read(out, GENERATED[0]);

    expect(commands).toContain(".command('move')");
    expect(commands).toContain(".argument('<status>', 'Target status')");
    expect(commands).toContain(".requiredOption('--reason <text>', 'Why')");
    expect(commands).not.toContain('Target column');
    expect(commands).not.toContain('dry-run');
    expect(commands).not.toContain('--json');
    expect(commands).not.toContain("command('costs')");
    // A proposed resource has no guard yet.
    expect(read(out, GENERATED[2])).toContain("export type ResourceName = 'project';");
  });

  it('builds arguments, options and flags with their types and coercions', () => {
    const out = generateFrom(SHAPES);
    const commands = read(out, GENERATED[0]);
    const types = read(out, GENERATED[1]);

    expect(commands).toContain(".description('It\\'s every shape')");
    expect(commands).toContain(".argument('[epicId]', 'Epic')");
    expect(commands).toContain(".option('--body-file <path>', 'A file')");
    expect(commands).toContain(".option('--budget <usd>', 'Ceiling', parseFloat)");
    expect(commands).toContain(".option('--max-steps <n>', 'Bound', integer)");
    expect(commands).toContain(".option('--ids <ids>', 'Ids', list(','))");
    expect(commands).toContain(".option('--push', 'Push')");

    expect(types).toContain('export interface ShapesRunArgs {\n  epicId?: string;\n}');
    expect(types).toContain(
      [
        'export interface ShapesRunOptions {',
        '  bodyFile?: string;',
        '  budget?: number;',
        '  maxSteps?: number;',
        '  ids?: string[];',
        "  executor?: 'claude-cli' | 'stub';",
        '  push?: boolean;',
        '}',
      ].join('\n'),
    );
    expect(types).toContain(
      'export interface TicketMoveArgs {\n  id: string;\n  status: string;\n}',
    );
    expect(types).toContain('export interface TicketMoveOptions {\n  reason: string;\n}');

    const resources = read(out, GENERATED[2]);
    expect(resources).toContain(
      "shapesRun: { requires: ['project'], conditionalRequires: ['git'] },",
    );
    expect(read(out, GENERATED[3])).toContain(
      "AEOS_HOME: { description: 'Home', default: '~/.aeos' },",
    );
  });

  it('writes the exit-code vocabulary and the contract version', () => {
    const codes = read(generateFrom(FIXTURE_CONTRACT), GENERATED[4]);

    expect(codes).toContain('export const CONTRACT_VERSION = 1;');
    expect(codes).toContain('  success: 0,\n  failure: 1,\n  usage: 2,\n  missing_resource: 4,');
    expect(codes).toContain('export type ExitCode = (typeof EXIT)[keyof typeof EXIT];');
  });

  it('types each response data and each component schema by name', () => {
    const types = read(generateFrom(TYPED), GENERATED[1]);

    expect(types).toContain("export type Kind = 'EPIC' | 'TASK';");
    expect(types).toContain('export type Usd = number | null;');
    expect(types).toContain(
      'export type Moved = { id: string; kind: Kind; costUsd?: Usd; tags: Array<string>; by: Record<string, Usd>; next: Kind | null; fixed: true };',
    );
    expect(types).toContain('export type TicketMoveData = Moved;');
    expect(types).toContain('export type Envelope = Record<string, unknown>;');
  });

  it('stops on a schema keyword that describes shape and that it does not support', () => {
    const out = tempDir();
    const file = path.join(out, 'contract.yaml');
    fs.writeFileSync(file, TYPED.replace('fixed: { const: true }', 'fixed: { oneOf: [] }'));

    const run = generate('--contract', file, '--out', out);

    expect(run.status).not.toBe(0);
    expect(run.output).toMatch(/Moved.*oneOf/);
  });

  it('compiles the constraints of a parameter schema to checks made before the handler', () => {
    const commands = read(generateFrom(SHAPES), GENERATED[0]);

    expect(commands).toContain(
      "['--executor', options.executor, { type: 'string', enum: ['claude-cli', 'stub'] }],",
    );
    expect(commands).toContain("['--budget', options.budget, { type: 'number' }],");
    expect(commands).toContain("['--max-steps', options.maxSteps, { type: 'integer' }],");
    // A plain string has nothing to check.
    expect(commands).not.toContain("['--body-file'");
  });
});

/** Every command the built CLI runs, by its path as typed. */
function leaves(command: Command, trail: string[] = []): [string, Command][] {
  if (command.commands.length === 0) return trail.length > 0 ? [[trail.join(' '), command]] : [];
  return command.commands.flatMap((child) => leaves(child, [...trail, child.name()]));
}

describe('the generated command reference', () => {
  const contract = loadContract();

  it.each(DOCS)('in %s lists every command the CLI has, as the contract describes it', (doc) => {
    const text = read(packageRoot(), doc);
    const reference = text.slice(
      text.indexOf('<!-- BEGIN GENERATED CLI REFERENCE -->'),
      text.indexOf('<!-- END GENERATED CLI REFERENCE -->'),
    );
    const built = leaves(buildProgram());
    expect(built.length).toBeGreaterThan(15);

    for (const [commandPath, command] of built) {
      const spec = contract.commands[commandPath];
      const start = reference.indexOf(`### \`aeos ${commandPath} ${command.usage()}\``);
      expect(start, commandPath).toBeGreaterThanOrEqual(0);
      const section = reference.slice(start, reference.indexOf('\n### ', start + 1));

      expect(section, commandPath).toContain(spec.summary);
      for (const option of command.options) expect(section, commandPath).toContain(option.flags);
      for (const resource of spec.requires.filter(
        (name) => contract.resources[name].status !== 'proposed',
      )) {
        expect(section, commandPath).toContain(`\`${resource}\``);
      }
      for (const [code, response] of Object.entries(spec.responses)) {
        expect(section, commandPath).toContain(`\`${code}\` ${response.description}`);
      }
    }
    expect(reference).not.toContain('aeos dashboard');
    for (const [variable, { description }] of Object.entries(contract.environment)) {
      expect(reference).toContain(`| \`${variable}\` |`);
      expect(reference).toContain(description);
    }
    for (const { name, meaning } of Object.values(contract.exitCodes)) {
      expect(reference).toContain(`| ${name} | ${meaning} |`);
    }
  });
});

describe('the built CLI', () => {
  const contract = loadContract();

  it('has the usage line of every command as the contract orders its arguments', () => {
    for (const [commandPath, command] of leaves(buildProgram())) {
      const positional = contract.commands[commandPath].parameters
        .filter((parameter) => parameter.in === 'argument')
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((parameter) => (parameter.required ? `<${parameter.name}>` : `[${parameter.name}]`));

      expect(command.usage(), commandPath).toBe(['[options]', ...positional].join(' '));
    }
  });

  it('types context.require to the resources the command declares', () => {
    const handler: Handlers['ticketList'] = async (_args, _options, context) => {
      context.require('project');
      // @ts-expect-error `ticket list` declares project and state_db, not git_repo.
      context.require('git_repo');
      return done({ tickets: [] }, '');
    };

    expect(handler).toBeTypeOf('function');
  });

  it('types a handler to the data its command declares', () => {
    const ready: Handlers['ticketReady'] = async ({ id }) =>
      done({ ticketId: id, subState: 'READY' }, '');
    const wrong: Handlers['ticketReady'] = async ({ id }) =>
      // @ts-expect-error `ticket ready` returns a SubStateChange, which has no `column`.
      done({ ticketId: id, column: 'QA' }, '');

    expect([ready, wrong]).toHaveLength(2);
  });

  it('assigns process.exitCode in exactly one place', () => {
    const assignments: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'e2e') walk(file);
        } else if (
          /\.tsx?$/.test(entry.name) &&
          !/\.(test|smoke-test|fixture)\./.test(entry.name)
        ) {
          for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
            if (/process\.exitCode\s*=[^=]/.test(line))
              assignments.push(`${entry.name}: ${line.trim()}`);
          }
        }
      }
    };
    walk(path.join(import.meta.dirname, '..'));

    expect(assignments).toEqual(['render.ts: process.exitCode = code;']);
  });

  it('registers no command by hand: src/cli/commands/ holds handlers only', () => {
    const dir = path.join(import.meta.dirname, 'commands');
    const wiring = fs
      .readdirSync(dir)
      .filter((file) => /\.(command|argument|option|requiredOption)\(/.test(read(dir, file)));

    expect(wiring).toEqual([]);
    expect(fs.readdirSync(dir).filter((file) => file.includes('.command.'))).toEqual([]);
  });
});
