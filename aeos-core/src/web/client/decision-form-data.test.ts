import { describe, expect, it } from 'vitest';

import type { ContractCommand } from '../../cli/contract/contract-schema.js';
import { buildParameters, defaultValueFor, visibleParameters } from './decision-form-data.js';

const MOVE_COMMAND: ContractCommand = {
  operationId: 'ticketMove',
  summary: 'Move a ticket',
  requires: ['project'],
  parameters: [
    {
      name: 'id',
      in: 'argument',
      position: 1,
      description: 'Ticket ID',
      schema: { type: 'string' },
    },
    {
      name: 'status',
      in: 'argument',
      position: 2,
      required: true,
      description: 'Target column',
      schema: { type: 'string' },
    },
    {
      name: 'reason',
      in: 'option',
      required: true,
      description: 'Why',
      schema: { type: 'string' },
    },
  ],
  responses: {},
};

const APPROVE_COMMAND: ContractCommand = {
  operationId: 'ticketApprove',
  summary: 'Approve',
  requires: ['project'],
  parameters: [
    {
      name: 'id',
      in: 'argument',
      position: 1,
      description: 'Ticket ID',
      schema: { type: 'string' },
    },
    { name: 'contract', in: 'flag', description: 'Also approve the contract change' },
  ],
  responses: {},
};

describe('visibleParameters', () => {
  it('excludes a fixed parameter (the ticket id)', () => {
    const visible = visibleParameters(MOVE_COMMAND, new Set(['id']), {});
    expect(visible.map((p) => p.name)).toEqual(['status', 'reason']);
  });

  it('excludes a locked parameter (a forced flag)', () => {
    const visible = visibleParameters(APPROVE_COMMAND, new Set(['id']), {
      contract: { value: true },
    });
    expect(visible).toEqual([]);
  });

  it("AC-22: keeps the move form's `status` parameter visible, restricted to the given `availableColumns` options, rather than hiding or freeing it", () => {
    const visible = visibleParameters(MOVE_COMMAND, new Set(['id']), {
      status: { options: [{ value: 'DONE', label: 'Done' }] },
    });
    expect(visible.map((p) => p.name)).toEqual(['status', 'reason']);
  });
});

describe('defaultValueFor', () => {
  it('starts a flag unchecked', () => {
    expect(defaultValueFor(APPROVE_COMMAND.parameters[1])).toBe(false);
  });

  it('starts any other parameter empty', () => {
    expect(defaultValueFor(MOVE_COMMAND.parameters[1])).toBe('');
  });
});

describe('buildParameters', () => {
  it('sends the fixed value, the current field value, and omits nothing filled in', () => {
    const parameters = buildParameters(
      MOVE_COMMAND,
      { id: 'WEB-1' },
      {},
      { status: 'DONE', reason: 'cleanup' },
    );
    expect(parameters).toEqual({ id: 'WEB-1', status: 'DONE', reason: 'cleanup' });
  });

  it('a locked field always wins over the live form state', () => {
    const parameters = buildParameters(
      APPROVE_COMMAND,
      { id: 'WEB-1' },
      { contract: { value: true } },
      { contract: false },
    );
    expect(parameters).toEqual({ id: 'WEB-1', contract: true });
  });

  it('omits a parameter the form never got a value for', () => {
    const parameters = buildParameters(MOVE_COMMAND, { id: 'WEB-1' }, {}, {});
    expect(parameters).toEqual({ id: 'WEB-1' });
  });
});
