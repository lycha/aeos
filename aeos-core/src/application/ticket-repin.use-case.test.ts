import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Ticket } from '../domain/model/ticket.js';
import type { ArtefactTree } from '../domain/ports/driven/artefact-tree.port.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { DecisionsLint } from '../domain/ports/driven/decisions-lint.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { StateMachineService } from '../domain/services/state-machine.js';
import type { GateRecorder } from './services/gate-recorder.js';
import { TicketRepinUseCase } from './ticket-repin.use-case.js';

const OLD = 'c0ffee1';
const NEW = 'deadbee';
const epic: Ticket = {
  id: 'AEOS-1',
  projectId: 'p',
  title: 'Checkout',
  kind: 'EPIC',
  parentId: null,
  column: 'TASK_BREAKDOWN',
  subState: 'SIGNED_OFF',
  createdAt: '2026-11-10T09:00:00.000Z',
  updatedAt: '2026-11-10T09:00:00.000Z',
  specPin: { repo: 'AEOS-aeos', commit: OLD, path: 'features/checkout' },
};
const task: Ticket = {
  ...epic,
  id: 'AEOS-2',
  kind: 'TASK',
  parentId: 'AEOS-1',
  column: 'IMPLEMENTATION',
  subState: 'BLOCKED',
  specPin: null,
};
const input = { projectId: 'p', projectPath: '/project', ticketId: 'AEOS-2' };

describe('TicketRepinUseCase', () => {
  let tickets: Record<string, Ticket>;
  let ticketRepo: { findById: ReturnType<typeof vi.fn>; setSpecCommit: ReturnType<typeof vi.fn> };
  let stateMachine: { setSubState: ReturnType<typeof vi.fn> };
  let gitGateway: { changedFiles: ReturnType<typeof vi.fn>; headCommit: ReturnType<typeof vi.fn> };
  let lint: ReturnType<typeof vi.fn>;
  let recorder: { record: ReturnType<typeof vi.fn> };
  let useCase: TicketRepinUseCase;

  beforeEach(() => {
    tickets = { 'AEOS-1': epic, 'AEOS-2': task };
    ticketRepo = {
      findById: vi.fn((_project: string, id: string) => tickets[id] ?? null),
      setSpecCommit: vi.fn(),
    };
    stateMachine = { setSubState: vi.fn().mockReturnValue({ ok: true }) };
    gitGateway = {
      changedFiles: vi.fn().mockReturnValue([]),
      headCommit: vi.fn().mockReturnValue(NEW),
    };
    lint = vi.fn().mockReturnValue({ schemaErrors: [], lintErrors: [], escalated: [] });
    recorder = { record: vi.fn().mockReturnValue({ id: 'GATE-7' }) };
    useCase = new TicketRepinUseCase(
      ticketRepo as unknown as TicketRepository,
      {
        artifactExists: () => false,
        readArtifact: () => '',
        writeArtifact: vi.fn(),
      } as unknown as ArtifactStore,
      stateMachine as unknown as StateMachineService,
      gitGateway as unknown as GitGateway,
      {
        root: () => '/project/.aeos',
        featureDir: () => '/project/.aeos/features/checkout',
        exists: () => true,
      } as unknown as ArtefactTree,
      { missingFiles: () => [], lint } as unknown as DecisionsLint,
      recorder as unknown as GateRecorder,
    );
  });

  it("moves the epic's pin to HEAD, records a repin gate, and sets a blocked task READY", () => {
    const result = useCase.execute(input);

    expect(result).toEqual({
      ok: true,
      ticketId: 'AEOS-2',
      epicId: 'AEOS-1',
      fromCommit: OLD,
      toCommit: NEW,
      gateRecordId: 'GATE-7',
    });
    expect(lint).toHaveBeenCalledWith('/project/.aeos', 'checkout');
    expect(recorder.record).toHaveBeenCalledWith('/project', task, {
      gate: 'repin',
      verdict: 'approved',
      reason: `Spec pin moved from ${OLD} to ${NEW}.`,
    });
    expect(ticketRepo.setSpecCommit).toHaveBeenCalledWith('p', 'AEOS-1', NEW);
    expect(stateMachine.setSubState).toHaveBeenCalledWith('p', 'AEOS-2', 'READY');
    // The record is written under the old pin, before the pin moves.
    expect(recorder.record.mock.invocationCallOrder[0]).toBeLessThan(
      ticketRepo.setSpecCommit.mock.invocationCallOrder[0]!,
    );
  });

  it('leaves the sub-state of a ticket that is not blocked', () => {
    expect(useCase.execute({ ...input, ticketId: 'AEOS-1' }).ok).toBe(true);
    expect(stateMachine.setSubState).not.toHaveBeenCalled();
  });

  it('is refused, as --spec is, when the feature has uncommitted changes', () => {
    gitGateway.changedFiles.mockReturnValue(['features/checkout/spec.md']);

    const result = useCase.execute(input);

    expect(!result.ok && result.error).toContain('uncommitted changes');
    expect(ticketRepo.setSpecCommit).not.toHaveBeenCalled();
    expect(recorder.record).not.toHaveBeenCalled();
  });

  it('is refused when the lint fails', () => {
    lint.mockReturnValue({ schemaErrors: [], lintErrors: ['ABS-2 unaddressed'], escalated: [] });

    expect(useCase.execute(input)).toMatchObject({ ok: false });
    expect(ticketRepo.setSpecCommit).not.toHaveBeenCalled();
  });

  it('is refused when the pin is already at HEAD', () => {
    gitGateway.headCommit.mockReturnValue(OLD);

    const result = useCase.execute(input);

    expect(!result.ok && result.error).toContain('already pinned');
    expect(recorder.record).not.toHaveBeenCalled();
  });

  it('is refused for a ticket with no spec', () => {
    tickets['AEOS-9'] = { ...task, id: 'AEOS-9', parentId: null };

    const result = useCase.execute({ ...input, ticketId: 'AEOS-9' });

    expect(!result.ok && result.error).toContain('not backed by a spec');
  });
});
