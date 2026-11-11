import * as path from 'node:path';
import { Command } from 'commander';
import { describe, expect, it } from 'vitest';

import { buildProgram } from '../index.js';
import { FIXTURE_CONTRACT } from './contract.fixture.js';
import { loadContract, parseContract } from './load-contract.js';
import { envVariablesRead, verifyContract } from './verify-contract.js';

const contract = parseContract(FIXTURE_CONTRACT);

/** A CLI that matches the fixture contract, with `ticket move` built as given. */
function program(move: (command: Command) => void = () => {}): Command {
  const root = new Command('aeos');
  const command = root.command('ticket').command('move').description('Move a ticket');
  command
    .argument('<id>', 'Ticket ID')
    .argument('<status>', 'Target status')
    .requiredOption('--reason <text>', 'Why');
  move(command);
  return root;
}
const verify = (cli: Command, env = ['AEOS_HOME']) => verifyContract(contract, cli, env);

describe('verifyContract', () => {
  it('finds the approved contract and the built CLI in agreement', () => {
    const report = verifyContract(
      loadContract(),
      buildProgram(),
      envVariablesRead(path.resolve(import.meta.dirname, '../..')),
    );

    expect(report.mismatches).toEqual([]);
    // What Iteration 1 has not built yet is pending, not wrong.
    expect(report.pending).toEqual(['dashboard: command (I1-M5-001)']);
    // Everything built is marked existing: nothing waits for the owner's marker.
    expect(report.landed).toEqual([]);
  });

  it('passes a CLI that matches, and lists what is proposed and absent as pending', () => {
    expect(verify(program())).toEqual({
      mismatches: [],
      pending: [
        'ticket move --dry-run: flag (T-3)',
        'ticket move --json: flag (T-9)',
        'costs: command (T-4)',
      ],
      landed: [],
    });
  });

  it('fails on an option the contract does not have, naming the command and the flag', () => {
    const report = verify(program((move) => move.option('--force', 'Skip checks')));

    expect(report.mismatches).toEqual([
      expect.stringMatching(/ticket move.*--force.*not in the contract/),
    ]);
  });

  it('fails on a command in the CLI that the contract does not have', () => {
    const cli = program();
    cli.command('extra').description('Not agreed');

    expect(verify(cli).mismatches).toEqual([expect.stringMatching(/extra.*not in the contract/)]);
  });

  it('fails on an existing command the CLI lacks, naming it', () => {
    expect(verify(new Command('aeos')).mismatches).toEqual([
      expect.stringMatching(/ticket move.*not in the CLI/),
    ]);
  });

  it('fails on an argument made optional in code', () => {
    const cli = new Command('aeos');
    cli
      .command('ticket')
      .command('move')
      .description('Move a ticket')
      .argument('<id>', 'Ticket ID')
      .argument('[status]', 'Target status')
      .requiredOption('--reason <text>', 'Why');

    expect(verify(cli).mismatches).toEqual([
      expect.stringMatching(/ticket move.*argument status.*required/),
    ]);
  });

  it("fails on an option's changed description, placeholder or mandatory-ness, naming the command and the flag", () => {
    const withReason = (flags: string, description: string, mandatory = true): Command => {
      const cli = new Command('aeos');
      const move = cli.command('ticket').command('move').description('Move a ticket');
      move.argument('<id>', 'Ticket ID').argument('<status>', 'Target status');
      if (mandatory) move.requiredOption(flags, description);
      else move.option(flags, description);
      return cli;
    };

    expect(verify(withReason('--reason <text>', 'Because')).mismatches).toEqual([
      expect.stringMatching(/ticket move --reason.*description/),
    ]);
    expect(verify(withReason('--reason <why>', 'Why')).mismatches).toEqual([
      expect.stringMatching(/ticket move --reason.*--reason <why>/),
    ]);
    expect(verify(withReason('--reason <text>', 'Why', false)).mismatches).toEqual([
      expect.stringMatching(/ticket move --reason.*mandatory/),
    ]);
  });

  it('fails on a changed summary', () => {
    const cli = program();
    cli.commands[0].commands[0].description('Relocate a ticket');

    expect(verify(cli).mismatches).toEqual([expect.stringMatching(/ticket move.*summary/)]);
  });

  it('passes the current or the pending wording, lists the pending one as landed, and fails a third', () => {
    const withStatus = (description: string): Command => {
      const cli = new Command('aeos');
      cli
        .command('ticket')
        .command('move')
        .description('Move a ticket')
        .argument('<id>', 'Ticket ID')
        .argument('<status>', description)
        .requiredOption('--reason <text>', 'Why');
      return cli;
    };

    expect(verify(withStatus('Target status'))).toMatchObject({ mismatches: [], landed: [] });
    expect(verify(withStatus('Target column'))).toMatchObject({
      mismatches: [],
      landed: ['ticket move argument status: pending wording (T-2)'],
    });
    expect(verify(withStatus('Where to')).mismatches).toEqual([
      expect.stringMatching(/ticket move.*argument status.*description/),
    ]);
  });

  it('holds a proposed item to the contract once it is present, and lists it as landed', () => {
    expect(verify(program((move) => move.option('--dry-run', 'Change nothing')))).toMatchObject({
      mismatches: [],
      landed: ['ticket move --dry-run: flag (T-3)'],
    });
    expect(verify(program((move) => move.option('--dry-run', 'Pretend'))).mismatches).toEqual([
      expect.stringMatching(/ticket move --dry-run.*description/),
    ]);
  });

  it('fails on an AEOS_* variable that is read and not declared, and on one declared and never read', () => {
    expect(verify(program(), ['AEOS_HOME', 'AEOS_SECRET']).mismatches).toEqual([
      expect.stringMatching(/AEOS_SECRET.*not declared/),
    ]);
    expect(verify(program(), []).mismatches).toEqual([
      expect.stringMatching(/AEOS_HOME.*never read/),
    ]);
  });
});

describe('envVariablesRead', () => {
  it('finds the variables non-test code reads from process.env', () => {
    const read = envVariablesRead(path.resolve(import.meta.dirname, '../..'));

    expect(read).toContain('AEOS_HOME');
    expect(read).toContain('AEOS_EXECUTOR');
  });
});
