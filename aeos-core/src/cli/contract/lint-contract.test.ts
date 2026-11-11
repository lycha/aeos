import { describe, expect, it } from 'vitest';

import { FIXTURE_CONTRACT } from './contract.fixture.js';
import { lintContract } from './lint-contract.js';
import { loadContract, parseContract } from './load-contract.js';

/** The lint findings for the fixture with one piece of its text replaced. */
const lintWith = (from: string, to: string): string[] => {
  expect(FIXTURE_CONTRACT).toContain(from);
  return lintContract(parseContract(FIXTURE_CONTRACT.replace(from, to)));
};

describe('lintContract', () => {
  it('finds nothing in the approved contract, or in the fixture', () => {
    expect(lintContract(loadContract())).toEqual([]);
    expect(lintContract(parseContract(FIXTURE_CONTRACT))).toEqual([]);
  });

  it.each([
    [
      'a required resource that is not declared',
      'requires: [project]',
      'requires: [database]',
      /ticket move.*database/,
    ],
    [
      'a response keyed by an undeclared exit code',
      '"4": { $ref: "#/components/responses/missingResource" }',
      '"4": { description: m }\n      "7": { description: x }',
      /ticket move.*"7"/,
    ],
    [
      'no "0" response with a data schema',
      '"0": { description: Moved, data: { type: object } }',
      '"0": { description: Moved }',
      /ticket move.*"0".*data/,
    ],
    [
      'a required resource and no "4" response',
      '      "4": { $ref: "#/components/responses/missingResource" }',
      '',
      /ticket move.*"4"/,
    ],
    [
      'a proposed command with no task',
      'status: proposed\n    task: T-4',
      'status: proposed',
      /costs.*proposed.*task/,
    ],
    [
      'a proposed parameter with no task',
      'status: proposed\n        task: T-3',
      'status: proposed',
      /ticket move.*--dry-run.*task/,
    ],
    [
      'a proposed resource with no task',
      'status: proposed, task: T-1',
      'status: proposed',
      /gh.*proposed.*task/,
    ],
    [
      'a repeated operationId',
      'operationId: costs',
      'operationId: ticketMove',
      /operationId ticketMove.*ticket move.*costs/,
    ],
    [
      'argument positions that do not run 1..n',
      'position: 2',
      'position: 3',
      /ticket move.*positions/,
    ],
    [
      'a required argument after an optional one',
      'position: 1, required: true',
      'position: 1, required: false',
      /ticket move.*status.*optional/,
    ],
    [
      'an option with no valueName',
      '        valueName: text\n',
      '',
      /ticket move.*--reason.*valueName/,
    ],
    [
      'a flag with a schema',
      'description: Change nothing',
      'description: Change nothing\n        schema: { type: boolean }',
      /ticket move.*--dry-run.*flag/,
    ],
    [
      'an array-valued option with no separator',
      'description: Why\n        schema: { type: string }',
      'description: Why\n        schema: { type: array, items: { type: string } }',
      /ticket move.*--reason.*separator/,
    ],
    [
      'a parameter schema outside the allowed subset',
      'description: Why\n        schema: { type: string }',
      'description: Why\n        schema: { type: string, maxLength: 5 }',
      /ticket move.*--reason.*maxLength/,
    ],
  ])('reports %s, naming where', (_what, from, to, expected) => {
    expect(lintWith(from, to)).toEqual([expect.stringMatching(expected)]);
  });
});
