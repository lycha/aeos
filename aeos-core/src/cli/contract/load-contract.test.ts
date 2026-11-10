import { describe, expect, it } from 'vitest';

import { FIXTURE_CONTRACT } from './contract.fixture.js';
import { loadContract, parseContract } from './load-contract.js';

describe('parseContract', () => {
  it('resolves every $ref and applies the globals, so commands are whole', () => {
    const contract = parseContract(FIXTURE_CONTRACT);
    const move = contract.commands['ticket move'];

    expect(move.parameters.map((parameter) => parameter.name)).toEqual([
      'id',
      'status',
      'reason',
      'dry-run',
      'json',
    ]);
    expect(move.parameters[0]).toMatchObject({ in: 'argument', description: 'Ticket ID' });
    expect(Object.keys(move.responses).sort()).toEqual(['0', '1', '2', '4']);
    expect(move.responses['2']).toEqual({ description: 'Invalid arguments' });
    expect(contract.output.json.envelope).toEqual({ type: 'object' });
  });

  it('names a $ref that points nowhere', () => {
    const text = FIXTURE_CONTRACT.replace(
      '#/components/responses/missingResource',
      '#/components/responses/nowhere',
    );

    expect(() => parseContract(text)).toThrow(/#\/components\/responses\/nowhere/);
  });

  it('names a $ref that has sibling keys', () => {
    const text = FIXTURE_CONTRACT.replace(
      '- $ref: "#/components/parameters/ticketId"',
      '- { $ref: "#/components/parameters/ticketId", required: false }',
    );

    expect(() => parseContract(text)).toThrow(/#\/components\/parameters\/ticketId.*sibling/s);
  });

  it('names the path of a malformed field', () => {
    const text = FIXTURE_CONTRACT.replace('summary: Move a ticket', 'summary: [not, text]');

    expect(() => parseContract(text)).toThrow(/commands.*ticket move.*summary/s);
  });

  it('refuses an unknown key, naming where it is', () => {
    const text = FIXTURE_CONTRACT.replace(
      'operationId: ticketMove',
      'operationId: ticketMove\n    alias: mv',
    );

    expect(() => parseContract(text)).toThrow(/alias[\s\S]*ticket move|ticket move[\s\S]*alias/);
  });
});

describe('loadContract', () => {
  it('loads the approved contract', () => {
    const contract = loadContract();

    expect(contract.contractVersion).toBe(0);
    expect(Object.keys(contract.commands)).toContain('orchestrator clear-budget');
    // The global --json reaches every command.
    for (const command of Object.values(contract.commands)) {
      expect(command.parameters.map((parameter) => parameter.name)).toContain('json');
      expect(command.responses).toHaveProperty('2');
    }
  });
});
