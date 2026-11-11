import { describe, expect, it } from 'vitest';

import { FIXTURE_CONTRACT } from './contract.fixture.js';
import { outputProblems, schemaProblems } from './contract-output.fixture.js';
import { loadContract, parseContract } from './load-contract.js';

const contract = loadContract();

/** What `ticket ready` writes under --json, with whatever the case changes. */
const envelope = (changes: Record<string, unknown> = {}): string =>
  JSON.stringify({
    ok: true,
    command: 'ticket ready',
    exit: 0,
    contractVersion: 1,
    data: { ticketId: 'AEOS-1', subState: 'READY' },
    error: null,
    warnings: [],
    ...changes,
  });
const refusal = (exit: number, resource: string | null = null): string =>
  envelope({
    ok: false,
    exit,
    data: null,
    error: { code: 'COMMAND_FAILED', message: 'No.', resource },
  });
const check = (stdout: string, exit: number): string[] =>
  outputProblems(contract, 'ticket ready', stdout, exit);

describe('the output schemas of the contract', () => {
  it('are each valid JSON Schema', () => {
    expect(schemaProblems(contract)).toEqual([]);
  });

  it('are reported by name when one is not', () => {
    const broken = parseContract(
      FIXTURE_CONTRACT.replace('data: { type: object }', 'data: { type: nonsense }'),
    );

    expect(schemaProblems(broken)).toEqual([expect.stringMatching(/^ticket move response 0: /)]);
  });
});

describe('outputProblems', () => {
  it('passes what the contract declares, on success and on failure', () => {
    expect(check(envelope(), 0)).toEqual([]);
    expect(check(refusal(1), 1)).toEqual([]);
    expect(check(refusal(2), 2)).toEqual([]);
    expect(check(refusal(4, 'project'), 4)).toEqual([]);
  });

  it('fails an exit code that is not a key of the command responses', () => {
    expect(check(refusal(130), 130)).toEqual([
      'ticket ready: exit 130 is not a response of the command',
    ]);
  });

  it('passes exit 3 on every command: a pipeline change in flight can stop any of them', () => {
    expect(check(refusal(3), 3)).toEqual([]);
    expect(
      Object.entries(contract.commands)
        .filter(([, command]) => !('3' in command.responses))
        .map(([commandPath]) => commandPath),
    ).toEqual([]);
  });

  it('fails a field the data schema does not declare', () => {
    const stdout = envelope({ data: { ticketId: 'AEOS-1', subState: 'READY', column: 'QA' } });

    expect(check(stdout, 0)).toEqual([expect.stringMatching(/data.*additional.*column/)]);
  });

  it('fails data that is missing on success, and data where the response declares none', () => {
    expect(check(envelope({ data: null }), 0)).toEqual(['ticket ready: data is null on success']);
    expect(check(envelope({ ok: false, exit: 1, error: refusalError(), data: {} }), 1)).toEqual([
      'ticket ready: response 1 declares no data, and data is set',
    ]);
  });

  it('fails a resource named on any code but 4, and none named on 4', () => {
    expect(check(refusal(1, 'project'), 1)).toEqual([expect.stringMatching(/error\.resource/)]);
    expect(check(refusal(4), 4)).toEqual([expect.stringMatching(/error\.resource/)]);
  });

  it('fails an envelope that is not the contract shape, or is not alone on stdout', () => {
    expect(check(envelope({ ok: false }), 0)).not.toEqual([]);
    expect(check(envelope({ extra: 1 }), 0)).not.toEqual([]);
    expect(check(envelope({ exit: 1, ok: false, error: refusalError(), data: null }), 0)).toEqual([
      expect.stringMatching(/says exit 1; it exited 0/),
      expect.stringMatching(/null on success/),
    ]);
    expect(check(`Running…\n${envelope()}`, 0)).toEqual([
      expect.stringMatching(/not one JSON object/),
    ]);
  });
});

function refusalError(): { code: string; message: string; resource: null } {
  return { code: 'COMMAND_FAILED', message: 'No.', resource: null };
}
