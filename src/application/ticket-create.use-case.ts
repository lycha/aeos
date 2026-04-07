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
export class TicketCreateUseCase implements TicketCreatePort {
  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly artifactStore: ArtifactStore,
    private readonly gitGateway: GitGateway,
  ) {}

  execute(input: TicketCreateInput): TicketCreateResult {
    const { title, projectId, projectKey, projectPath } = input;

    // 1. Atomically allocate ID + insert in a single transaction (prevents race conditions)
    const ticket = this.ticketRepo.createAtomic(projectId, (nextNum) => {
      const ticketId = `${projectKey}-${nextNum}`;
      const now = new Date().toISOString();
      return {
        id: ticketId,
        projectId,
        title,
        column: 'BACKLOG' as const,
        subState: null,
        createdAt: now,
        updatedAt: now,
      };
    });

    const ticketId = ticket.id;

    // 2. Build ticket markdown content
    const content = [
      `# Ticket: ${ticketId}`,
      '',
      '## Title',
      title,
      '',
      '## Description',
      '<!-- Fill in the ticket description here -->',
      '',
      '## Definition of Done',
      '<!-- Define acceptance criteria — evaluated at DoD Gate -->',
      '',
      '## Notes',
      '<!-- Additional context, links, constraints -->',
      '',
    ].join('\n');

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
    return { ticketId, title };
  }
}
