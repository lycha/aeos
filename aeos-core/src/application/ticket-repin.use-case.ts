// Use case — TicketRepin (come forward from an amended spec)

import { SubState } from '../domain/model/sub-state.js';
import type { ArtefactTree } from '../domain/ports/driven/artefact-tree.port.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { DecisionsLint } from '../domain/ports/driven/decisions-lint.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type {
  TicketRepinInput,
  TicketRepinPort,
  TicketRepinResult,
} from '../domain/ports/driving/ticket-repin.port.js';
import type { StateMachineService } from '../domain/services/state-machine.js';
import type { GateRecorder } from './services/gate-recorder.js';
import { featureOf, pinSpec } from './services/spec-pin.js';
import { syncTicketDocument } from './services/ticket-document.js';

export class TicketRepinUseCase implements TicketRepinPort {
  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly artifactStore: ArtifactStore,
    private readonly stateMachine: StateMachineService,
    private readonly gitGateway: GitGateway,
    private readonly artefactTree: ArtefactTree,
    private readonly decisionsLint: DecisionsLint,
    private readonly gateRecorder: GateRecorder,
  ) {}

  execute(input: TicketRepinInput): TicketRepinResult {
    const { projectId, projectPath, ticketId } = input;
    const ticket = this.ticketRepo.findById(projectId, ticketId);
    if (!ticket) return { ok: false, error: `Ticket ${ticketId} not found` };

    // The pin lives on the epic; a task reaches it through its parent.
    const epic = ticket.specPin
      ? ticket
      : ticket.parentId
        ? this.ticketRepo.findById(projectId, ticket.parentId)
        : null;
    const pin = epic?.specPin;
    if (!epic || !pin) {
      return {
        ok: false,
        error: `Ticket ${ticketId} is not backed by a spec; there is no pin to move.`,
      };
    }

    let next;
    try {
      next = pinSpec(
        {
          artefactTree: this.artefactTree,
          decisionsLint: this.decisionsLint,
          gitGateway: this.gitGateway,
        },
        pin.repo,
        projectPath,
        featureOf(pin),
      );
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    if (next.commit === pin.commit) {
      return {
        ok: false,
        error: `${epic.id} is already pinned to the current spec (${pin.repo}@${pin.commit}). Commit the amended spec first.`,
      };
    }

    // Recorded under the old pin, before anything moves.
    const gate = this.gateRecorder.record(projectPath, ticket, {
      gate: 'repin',
      verdict: 'approved',
      reason: `Spec pin moved from ${pin.commit} to ${next.commit}.`,
    });
    this.ticketRepo.setSpecCommit(projectId, epic.id, next.commit);
    syncTicketDocument(this.artifactStore, projectPath, { ...epic, specPin: next });

    if (ticket.subState === SubState.BLOCKED) {
      const result = this.stateMachine.setSubState(projectId, ticket.id, SubState.READY);
      if (!result.ok) return { ok: false, error: `Failed to set READY state: ${result.reason}` };
      syncTicketDocument(this.artifactStore, projectPath, {
        ...ticket,
        specPin: ticket.id === epic.id ? next : ticket.specPin,
        subState: SubState.READY,
      });
    }

    return {
      ok: true,
      ticketId: ticket.id,
      epicId: epic.id,
      fromCommit: pin.commit,
      toCommit: next.commit,
      gateRecordId: gate.id,
    };
  }
}
