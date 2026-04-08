// Application service — ContextAssembler: reads ticket artifacts + constraints and assembles context for executor invocation

import type { ArtifactStore } from '../../domain/ports/driven/artifact-store.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';
import type { GitGateway } from '../../domain/ports/driven/git-gateway.port.js';
import type { AssembledContext } from '../../domain/model/assembled-context.js';
import { Column } from '../../domain/model/column.js';

/** Maximum characters before a diff is truncated. */
export const MAX_DIFF_CHARS = 50_000;

export class ContextAssembler {
  constructor(
    private artifactStore: ArtifactStore,
    private projectRepo: ProjectRepository,
    private gitGateway: GitGateway,
  ) {}

  async assemble(ticketId: string, projectRoot: string, column: string): Promise<AssembledContext> {
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

    // 4. Inject git diff for CODE_REVIEW column
    let codeDiff: string | null = null;
    if (column === Column.CODE_REVIEW) {
      const rawDiff = this.gitGateway.diff(projectRoot);
      if (rawDiff.trim() === '') {
        codeDiff = 'No changes detected';
      } else if (rawDiff.length > MAX_DIFF_CHARS) {
        codeDiff = `${rawDiff.slice(0, MAX_DIFF_CHARS)}\n\n[DIFF TRUNCATED — showing first 50,000 characters of ${rawDiff.length} total]`;
      } else {
        codeDiff = rawDiff;
      }
    }

    return { ticketContent, priorArtifacts, constraints, codeDiff };
  }
}
