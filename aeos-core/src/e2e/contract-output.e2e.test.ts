// The contract test of I1-M4-004c: every command the CLI has is run under the
// stub with --json, and what it writes and how it exits is held to
// cli-contract.yaml.

import type { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { outputProblems } from '../cli/contract/contract-output.fixture.js';
import { loadContract } from '../cli/contract/load-contract.js';
import { buildProgram } from '../cli/index.js';

import { addFixtureFeature, createTempProject, runCli, type TempProject } from './harness.js';

const contract = loadContract();

/** Every command the built CLI runs, by its path as typed. */
function leaves(command: Command, trail: string[] = []): string[] {
  if (command.commands.length === 0) return trail.length > 0 ? [trail.join(' ')] : [];
  return command.commands.flatMap((child) => leaves(child, [...trail, child.name()]));
}

describe('every command under --json', () => {
  let project: TempProject;
  const stdinIsTty = process.stdin.isTTY;

  beforeEach(() => {
    project = createTempProject();
    // As under a script: no command asks a question.
    process.stdin.isTTY = false;
  });
  afterEach(() => {
    process.stdin.isTTY = stdinIsTty;
    project.cleanup();
  });

  it('writes one envelope that matches the contract, and exits with a code its command declares', async () => {
    const ran = new Map<string, number[]>();
    const problems: string[] = [];
    /** Runs `aeos <command> <args> --json`, checks it against the contract, returns `data`. */
    const json = async (command: string, ...args: string[]): Promise<Record<string, never>> => {
      const result = await runCli(...command.split(' '), ...args, '--json');
      ran.set(command, [...(ran.get(command) ?? []), result.exitCode]);
      problems.push(...outputProblems(contract, command, result.stdout, result.exitCode));
      return ((JSON.parse(result.stdout) as { data: unknown }).data ?? {}) as Record<string, never>;
    };
    const reason = ['--reason', 'The contract test walks every command.'];

    await json('project init', '--name', 'E2E', '--key', 'EE'); // before install: exit 4
    await json('install');
    await json('project init', '--name', 'E2E', '--key', 'EE');
    await json('project sync');
    addFixtureFeature();

    const epic: string = (await json('ticket create', 'An epic', '--spec', 'feature-sample'))
      .ticketId;
    const bug: string = (await json('ticket create', 'A bug', '--bug')).ticketId;
    await json('ticket list');
    await json('ticket show', epic);
    await json('ticket show', 'EE-999'); // not found: exit 1
    await json('ticket approve', epic);
    await json('ticket run', epic);
    await json('ticket run', epic, '--executor', 'nope'); // exit 2

    await json('ticket approve', bug);
    await json('ticket sign-off', bug, ...reason);
    await json('ticket ready', bug);
    await json('ticket move', bug, 'BACKLOG', ...reason);

    // Refusals: nothing is blocked or escalated, and nobody is at a terminal.
    await json('ticket answer', epic);
    await json('ticket resolve', epic);
    await json('ticket repin', epic);
    await json('ticket dod-approve', epic);

    await json('orchestrator run', epic, '--budget', '5');
    await json('orchestrator pause', epic);
    await json('orchestrator resume', epic);
    await json('orchestrator clear-budget', epic);
    await json('orchestrator status');
    await json('costs');
    await json('costs', '--project', 'NOPE'); // exit 4

    expect(problems).toEqual([]);
    expect([...ran.keys()].sort()).toEqual(leaves(buildProgram()).sort());
    // The walk is worth something only if the commands did their work: all but these succeeded once.
    const refused = [...ran].filter(([, exits]) => !exits.includes(0)).map(([command]) => command);
    expect(refused.sort()).toEqual([
      'orchestrator run',
      'ticket answer',
      'ticket dod-approve',
      'ticket resolve',
    ]);
    // Not at the final gate, which is said before anything about a terminal.
    expect(ran.get('ticket dod-approve')).toEqual([1]);
    expect(ran.get('orchestrator run')).toEqual([3]);
  }, 60_000);
});
