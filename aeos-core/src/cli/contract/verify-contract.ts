// CLI contract — verifier: does the built CLI say what the contract says?
//
// Compared: which commands exist, each summary, arguments, options and flags
// (flag text, mandatory-ness, description), and the AEOS_* variables read.
// Not compared, until I1-M4-004b/c make them real: `requires`, `responses`,
// `prompt` and the constraints inside parameter schemas.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';

import type { Contract } from './contract-schema.js';
import { parameterId } from './lint-contract.js';

export interface ContractReport {
  /** The CLI and the contract disagree. Any entry fails the check. */
  readonly mismatches: string[];
  /** Proposed in the contract and not built yet. Expected. */
  readonly pending: string[];
  /**
   * Marked `proposed` or `pending` in the contract and already in the CLI,
   * matching: for a person to update the contract's markers.
   */
  readonly landed: string[];
}

/** Every command that runs something, by its path as typed (`ticket move`). */
function leafCommands(command: Command, trail: string[] = []): Map<string, Command> {
  if (command.commands.length === 0) {
    return new Map(trail.length > 0 ? [[trail.join(' '), command]] : []);
  }
  return new Map(
    command.commands.flatMap((child) => [...leafCommands(child, [...trail, child.name()])]),
  );
}

export function verifyContract(
  contract: Contract,
  program: Command,
  envRead: readonly string[],
): ContractReport {
  const mismatches: string[] = [];
  const pending: string[] = [];
  const landed: string[] = [];
  const cli = leafCommands(program);

  /** The text the CLI carries must be the current wording or the pending one. */
  const wording = (
    id: string,
    what: string,
    actual: string,
    current: string,
    reworded?: { task: string; text: string },
  ): void => {
    if (actual === current) return;
    if (reworded && actual === reworded.text) {
      landed.push(`${id}: pending wording (${reworded.task})`);
      return;
    }
    mismatches.push(
      `${id}: ${what} is "${actual}" in the CLI; the contract says "${current}"${reworded ? `, or "${reworded.text}" once ${reworded.task} lands` : ''}`,
    );
  };

  for (const commandPath of cli.keys()) {
    if (!(commandPath in contract.commands)) {
      mismatches.push(`${commandPath}: in the CLI, not in the contract`);
    }
  }

  for (const [commandPath, spec] of Object.entries(contract.commands)) {
    const command = cli.get(commandPath);
    if (!command) {
      if (spec.status === 'proposed') pending.push(`${commandPath}: command (${spec.task})`);
      else mismatches.push(`${commandPath}: in the contract, not in the CLI`);
      continue;
    }
    if (spec.status === 'proposed') landed.push(`${commandPath}: command (${spec.task})`);
    wording(
      commandPath,
      'summary',
      command.description(),
      spec.summary,
      spec.pending && { task: spec.pending.task, text: spec.pending.summary },
    );

    /** Whether to compare a parameter: no for a proposed one the CLI does not have yet. */
    const expected = (parameter: (typeof spec.parameters)[number], present: boolean): boolean => {
      const label = `${parameterId(commandPath, parameter)}: ${parameter.in} (${parameter.task})`;
      if (parameter.status !== 'proposed') return true;
      (present ? landed : pending).push(label);
      return present;
    };
    const reworded = (parameter: (typeof spec.parameters)[number]) =>
      parameter.pending && { task: parameter.pending.task, text: parameter.pending.description };

    const builtArguments = command.registeredArguments;
    const positional = spec.parameters
      .filter((parameter) => parameter.in === 'argument')
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .filter((parameter) =>
        expected(
          parameter,
          builtArguments.some((built) => built.name() === parameter.name),
        ),
      );
    for (let at = 0; at < Math.max(positional.length, builtArguments.length); at++) {
      const parameter = positional[at];
      const built = builtArguments[at];
      if (!parameter) {
        mismatches.push(`${commandPath} argument ${built.name()}: in the CLI, not in the contract`);
      } else if (!built || built.name() !== parameter.name) {
        mismatches.push(
          `${parameterId(commandPath, parameter)}: position ${at + 1} in the contract; the CLI has ${built ? `argument ${built.name()}` : 'no argument'} there`,
        );
      } else {
        const id = parameterId(commandPath, parameter);
        if (built.required !== (parameter.required ?? false)) {
          const say = (required: boolean): string => (required ? 'required' : 'optional');
          mismatches.push(
            `${id}: ${say(parameter.required ?? false)} in the contract, ${say(built.required)} in the CLI`,
          );
        }
        wording(id, 'description', built.description, parameter.description, reworded(parameter));
      }
    }

    const named = spec.parameters.filter((parameter) => parameter.in !== 'argument');
    for (const built of command.options) {
      if (!named.some((parameter) => `--${parameter.name}` === built.long)) {
        mismatches.push(
          `${commandPath} ${built.long ?? built.flags}: in the CLI, not in the contract`,
        );
      }
    }
    for (const parameter of named) {
      const id = parameterId(commandPath, parameter);
      const built = command.options.find((option) => option.long === `--${parameter.name}`);
      if (!expected(parameter, built !== undefined)) continue;
      if (!built) {
        mismatches.push(`${id}: in the contract, not in the CLI`);
        continue;
      }
      const flags =
        parameter.in === 'flag'
          ? `--${parameter.name}`
          : `--${parameter.name} <${parameter.valueName}>`;
      if (built.flags !== flags) {
        mismatches.push(`${id}: the CLI declares "${built.flags}"; the contract says "${flags}"`);
      }
      if (built.mandatory !== (parameter.required ?? false)) {
        const say = (mandatory: boolean): string => (mandatory ? 'mandatory' : 'optional');
        mismatches.push(
          `${id}: ${say(parameter.required ?? false)} in the contract, ${say(built.mandatory)} in the CLI`,
        );
      }
      wording(id, 'description', built.description, parameter.description, reworded(parameter));
    }
  }

  const declared = Object.keys(contract.environment);
  for (const variable of envRead) {
    if (!declared.includes(variable)) {
      mismatches.push(`environment: ${variable} is read in src/ and not declared in the contract`);
    }
  }
  for (const variable of declared) {
    if (!envRead.includes(variable)) {
      mismatches.push(`environment: ${variable} is declared in the contract and never read`);
    }
  }
  return { mismatches, pending, landed };
}

/** The AEOS_* variables that non-test code under `srcDir` reads from `process.env`. */
export function envVariablesRead(srcDir: string): string[] {
  const read = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // The end-to-end harness is test code.
        if (entry.name !== 'e2e') walk(absolute);
      } else if (
        /\.tsx?$/.test(entry.name) &&
        !/\.(test|smoke-test|fixture)\.tsx?$/.test(entry.name)
      ) {
        for (const match of fs
          .readFileSync(absolute, 'utf-8')
          .matchAll(/process\.env(?:\.|\[['"])(AEOS_[A-Z0-9_]+)/g)) {
          read.add(match[1]);
        }
      }
    }
  };
  walk(srcDir);
  return [...read].sort();
}
