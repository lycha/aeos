// Use case — TicketResolve (unblock an ESCALATED ticket from its escalation.md)

import * as path from 'node:path';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type { StateMachineService } from '../domain/services/state-machine.js';
import type {
  TicketResolvePort,
  TicketResolveInput,
  TicketResolveResult,
} from '../domain/ports/driving/ticket-resolve.port.js';
import { SubState } from '../domain/model/sub-state.js';
import { syncTicketDocument } from './services/ticket-document.js';
import {
  escalationFilename,
  parseEscalationResponse,
  buildResolutionDocument,
} from './services/escalation-document.js';

/** The artifact the operator's guidance is written to, picked up as prior context. */
function resolutionFilename(ticketId: string): string {
  return `${ticketId}-resolution.md`;
}

export class TicketResolveUseCase implements TicketResolvePort {
  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly artifactStore: ArtifactStore,
    private readonly stateMachine: StateMachineService,
    private readonly gitGateway: GitGateway,
  ) {}

  execute(input: TicketResolveInput): TicketResolveResult {
    const { projectId, projectPath, ticketId, confirmed } = input;

    const ticket = this.ticketRepo.findById(projectId, ticketId);
    if (!ticket) {
      return { ok: false, error: `Ticket ${ticketId} not found` };
    }

    // Only ESCALATED tickets carry an escalation.md. (Preflight BLOCKED uses
    // `aeos ticket answer` and questions.md instead.)
    if (ticket.subState !== SubState.ESCALATED) {
      return {
        ok: false,
        error: `Ticket ${ticketId} is not escalated (current state: ${ticket.subState ?? 'none'}). Only escalated tickets can be resolved; a preflight-blocked ticket uses \`aeos ticket answer\`.`,
      };
    }

    const filename = escalationFilename(ticketId);
    if (!this.artifactStore.artifactExists(projectPath, ticketId, filename)) {
      return { ok: false, error: `Escalation file not found: ${filename}` };
    }

    // Guard against resolving a file the operator never edited.
    if (!confirmed) {
      const mtime = this.artifactStore.getArtifactMtime(projectPath, ticketId, filename);
      const ticketUpdatedAt = new Date(ticket.updatedAt).getTime();
      const fileMtime = mtime ? mtime.getTime() : 0;
      if (fileMtime <= ticketUpdatedAt) {
        return { ok: false, needsConfirmation: true, reason: 'escalation file not modified' };
      }
    }

    const content = this.artifactStore.readArtifact(projectPath, ticketId, filename);
    const response = parseEscalationResponse(content);
    if (response === null) {
      return {
        ok: false,
        error: `No response found in ${filename}. Write your decision in the \`## Response\` block, then re-run.`,
      };
    }

    // Persist the operator's guidance as a context artifact for the retry.
    const reason = ticket.escalation?.reason ?? 'ESCALATED';
    this.artifactStore.writeArtifact(
      projectPath,
      ticketId,
      resolutionFilename(ticketId),
      buildResolutionDocument(ticketId, reason, response),
    );

    // READY (not ESCALATED/BLOCKED) — this also clears the stored escalation.
    const result = this.stateMachine.setSubState(projectId, ticketId, SubState.READY);
    if (!result.ok) {
      return { ok: false, error: `Failed to set sub-state: ${result.reason}` };
    }
    syncTicketDocument(this.artifactStore, projectPath, { ...ticket, subState: SubState.READY });

    // Commit the resolution + escalation artifacts (state stays in SQLite).
    const aeosDir = path.join(projectPath, '.aeos');
    try {
      this.gitGateway.commitFiles(
        aeosDir,
        [
          path.join(aeosDir, 'tickets', ticketId, resolutionFilename(ticketId)),
          path.join(aeosDir, 'tickets', ticketId, filename),
        ],
        `[${ticketId}][ESCALATION][v1][human][resolved]`,
      );
    } catch (err) {
      // Compensate: revert to ESCALATED so the state matches the uncommitted tree.
      this.stateMachine.setSubState(projectId, ticketId, SubState.ESCALATED);
      syncTicketDocument(this.artifactStore, projectPath, ticket);
      throw err;
    }

    return { ok: true, ticketId };
  }
}
