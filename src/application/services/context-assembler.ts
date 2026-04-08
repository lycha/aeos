// Application service — ContextAssembler: reads ticket artifacts + constraints and assembles context for executor invocation

import type { ArtifactStore } from '../../domain/ports/driven/artifact-store.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';
import type { AssembledContext } from '../../domain/model/assembled-context.js';

export class ContextAssembler {
  constructor(
    private artifactStore: ArtifactStore,
    private projectRepo: ProjectRepository,
  ) {}

  async assemble(ticketId: string, projectRoot: string): Promise<AssembledContext> {
    // 1. Read ticket content
    const ticketFilename = `${ticketId}-ticket.md`;
    const ticketContent = this.artifactStore.readArtifact(projectRoot, ticketId, ticketFilename);

    // 2. List and read prior artifacts (excluding the ticket file itself)
    const allFilenames = this.artifactStore.listArtifacts(projectRoot, ticketId);
    const priorArtifacts = allFilenames
      .filter((filename) => filename !== ticketFilename)
      .map((filename) => ({
        name: filename,
        content: this.artifactStore.readArtifact(projectRoot, ticketId, filename),
      }));

    // 3. Read constraints
    const constraints = this.projectRepo.readConstraints(projectRoot);

    return { ticketContent, priorArtifacts, constraints };
  }
}
