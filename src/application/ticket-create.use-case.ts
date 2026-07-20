// Use case — TicketCreate

import * as path from 'node:path';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type {
  TicketCreatePort,
  TicketCreateInput,
  TicketCreateResult,
} from '../domain/ports/driving/ticket-create.port.js';
import { TicketKind } from '../domain/model/ticket-kind.js';
import { buildInitialTicketDocument } from './services/ticket-document.js';
export class TicketCreateUseCase implements TicketCreatePort {
  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly artifactStore: ArtifactStore,
    private readonly gitGateway: GitGateway,
  ) {}

  execute(input: TicketCreateInput): TicketCreateResult {
    const { title, projectId, projectKey, projectPath, parentId } = input;

    // A parent makes this a task; without one it is an epic.
    const kind = parentId ? TicketKind.TASK : TicketKind.EPIC;

    if (parentId) {
      const parent = this.ticketRepo.findById(projectId, parentId);
      if (!parent) {
        throw new Error(`Parent ticket ${parentId} not found`);
      }
      if (parent.kind !== TicketKind.EPIC) {
        throw new Error(
          `Parent ${parentId} is a ${parent.kind}; tasks may only hang off an EPIC (one level of nesting).`,
        );
      }
    }

    // 1. Atomically allocate ID + insert in a single transaction (prevents race conditions)
    const ticket = this.ticketRepo.createAtomic(projectId, (nextNum) => {
      const ticketId = `${projectKey}-${nextNum}`;
      const now = new Date().toISOString();
      return {
        id: ticketId,
        projectId,
        title,
        kind,
        parentId: parentId ?? null,
        column: 'BACKLOG' as const,
        subState: null,
        createdAt: now,
        updatedAt: now,
      };
    });

    const ticketId = ticket.id;

    // 2. Build ticket markdown content
    const content = buildInitialTicketDocument(ticket);

    // 4. Write artifact file; compensate on failure
    const filename = `${ticketId}-ticket.md`;
    try {
      this.artifactStore.writeArtifact(projectPath, ticketId, filename, content);
    } catch (err) {
      this.ticketRepo.deleteById(projectId, ticketId);
      throw err;
    }

    // 5. Commit to .aeos/.git; compensate on failure
    const aeosDir = path.join(projectPath, '.aeos');
    try {
      this.gitGateway.commit(aeosDir, `[${ticketId}][TICKET][v1][human][create]`);
    } catch (err) {
      this.artifactStore.removeArtifact(projectPath, ticketId, filename);
      this.ticketRepo.deleteById(projectId, ticketId);
      throw err;
    }

    // 6. Return result
    return { ticketId, title, kind, parentId: parentId ?? null };
  }
}
