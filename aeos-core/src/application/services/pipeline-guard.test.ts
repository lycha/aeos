import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Column, Pipelines } from '../../domain/model/column.js';
import type { Ticket } from '../../domain/model/ticket.js';
import type { TicketKind } from '../../domain/model/ticket-kind.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';
import type { TicketRepository } from '../../domain/ports/driven/ticket-repository.port.js';
import type { GateRecorder } from './gate-recorder.js';
import { PipelineGuard } from './pipeline-guard.js';

const EPIC = ['BACKLOG', 'SPEC_REVIEW', 'DONE'];
const TASK = ['BACKLOG', 'IMPLEMENTATION', 'CODE_REVIEW', 'QA', 'DONE'];
const SWAPPED = ['BACKLOG', 'IMPLEMENTATION', 'QA', 'CODE_REVIEW', 'DONE'];

const ticket = (id: string, kind: TicketKind, column: Column): Ticket =>
  ({ id, kind, column }) as Ticket;

describe('PipelineGuard', () => {
  let file: Pipelines;
  let stored: Map<string, readonly Column[]>;
  let tickets: Ticket[];
  const recordPipelineChange = vi.fn();
  const notify = vi.fn();
  let guard: PipelineGuard;

  beforeEach(() => {
    file = { EPIC, TASK };
    stored = new Map();
    tickets = [];
    recordPipelineChange.mockReset();
    notify.mockReset();
    guard = new PipelineGuard(
      { load: () => file },
      {
        find: (_projectId, kind) => stored.get(kind) ?? null,
        save: (_projectId, kind, columns) => void stored.set(kind, columns),
      },
      { findByProject: () => tickets } as unknown as TicketRepository,
      { read: () => ({ id: 'p' }) } as unknown as ProjectRepository,
      { recordPipelineChange } as unknown as GateRecorder,
      notify,
    );
  });

  it('stores the pipelines of a project it has not seen, with no gate record', () => {
    guard.check('/project');

    expect(Object.fromEntries(stored)).toEqual({ EPIC, TASK });
    expect(recordPipelineChange).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('does nothing when the file is what was accepted', () => {
    guard.check('/project');
    stored.set = vi.fn();

    guard.check('/project');

    expect(stored.set).not.toHaveBeenCalled();
    expect(recordPipelineChange).not.toHaveBeenCalled();
  });

  it('accepts a change when no ticket of that kind is in flight: record, store, one line', () => {
    guard.check('/project');
    tickets = [ticket('P-1', 'TASK', 'BACKLOG'), ticket('P-2', 'TASK', 'DONE')];
    file = { EPIC, TASK: SWAPPED };

    guard.check('/project');

    expect(recordPipelineChange).toHaveBeenCalledExactlyOnceWith('/project', 'TASK', TASK, SWAPPED);
    expect(stored.get('TASK')).toEqual(SWAPPED);
    expect(notify).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('TASK pipeline changed'),
    );
  });

  it('does not store a change whose gate record cannot be written', () => {
    guard.check('/project');
    file = { EPIC, TASK: SWAPPED };
    recordPipelineChange.mockImplementation(() => {
      throw new Error('no git identity');
    });

    expect(() => guard.check('/project')).toThrow('no git identity');
    expect(stored.get('TASK')).toEqual(TASK);
  });

  it('refuses a change while a ticket of that kind is in flight, naming it, its column and the previous order', () => {
    guard.check('/project');
    tickets = [ticket('P-1', 'TASK', 'CODE_REVIEW'), ticket('P-2', 'TASK', 'DONE')];
    file = { EPIC, TASK: SWAPPED };

    expect(() => guard.check('/project')).toThrow(
      /TASK pipeline.*P-1 \(CODE_REVIEW\).*BACKLOG.*DONE.*restore.*BACKLOG, IMPLEMENTATION, CODE_REVIEW, QA, DONE/s,
    );
    expect(stored.get('TASK')).toEqual(TASK);
    expect(recordPipelineChange).not.toHaveBeenCalled();
    // Read-only commands go on with the accepted order.
    expect(guard.accepted('/project')).toEqual({ EPIC, TASK });
  });

  it('judges each kind on its own tickets', () => {
    guard.check('/project');
    tickets = [ticket('P-1', 'TASK', 'CODE_REVIEW'), ticket('P-9', 'EPIC', 'DONE')];
    file = { EPIC: ['BACKLOG', 'DONE'], TASK };

    guard.check('/project');

    expect(stored.get('EPIC')).toEqual(['BACKLOG', 'DONE']);
    expect(recordPipelineChange).toHaveBeenCalledExactlyOnceWith('/project', 'EPIC', EPIC, [
      'BACKLOG',
      'DONE',
    ]);
  });
});
