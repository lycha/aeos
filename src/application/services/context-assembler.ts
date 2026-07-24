// Application service — ContextAssembler: reads ticket artifacts + constraints and assembles context for executor invocation

import type { ArtifactStore } from '../../domain/ports/driven/artifact-store.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';
import type { GitGateway } from '../../domain/ports/driven/git-gateway.port.js';
import type { AssembledContext, PriorArtifact } from '../../domain/model/assembled-context.js';
import { Column } from '../../domain/model/column.js';

/** Maximum characters before a diff is truncated. */
export const MAX_DIFF_CHARS = 50_000;

/**
 * The parent epic's specification artifacts a child task is assembled against.
 * Suffix-matched against the parent's artifact filenames (e.g. `AEOS-1-prd.md`).
 */
const EPIC_SPEC_SUFFIXES = ['-prd.md', '-tech-spec.md'] as const;

/** Pulls the parent epic id out of the ticket document's AEOS metadata block. */
function parentEpicId(ticketContent: string): string | null {
  // The metadata block renders "- Parent: <id>" only for a task (see
  // ticket-document.ts). Absent for an epic.
  const match = ticketContent.match(/^-\s*Parent:\s*(\S+)\s*$/m);
  return match ? match[1] : null;
}

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

    // 2. Detect decisions artifact and read it when present
    const decisionsFilename = `${ticketId}-decisions.md`;
    const questionsFilename = `${ticketId}-questions.md`;
    const allFilenames = this.artifactStore.listArtifacts(projectRoot, ticketId);
    const hasDecisions = allFilenames.includes(decisionsFilename);
    const settledDecisions = hasDecisions
      ? this.artifactStore.readArtifact(projectRoot, ticketId, decisionsFilename)
      : null;

    // 3. List and read prior artifacts (excluding ticket/decisions; questions omitted once decisions exist)
    const priorArtifacts = allFilenames
      .filter(
        (filename) =>
          filename !== ticketFilename &&
          filename !== decisionsFilename &&
          !(hasDecisions && filename === questionsFilename),
      )
      .map((filename) => ({
        name: filename,
        content: this.artifactStore.readArtifact(projectRoot, ticketId, filename),
      }));

    // 3a. For a child task, inject the parent epic's spec (PRD, tech spec) so the
    //     task is built against — and does not contradict — the decisions that
    //     scoped it. The task's own artifact dir never contains these.
    const epicContext = this.gatherEpicContext(ticketContent, projectRoot);

    // 4. Read constraints
    const constraints = this.projectRepo.readConstraints(projectRoot);

    // 5. Inject a git diff for the review columns.
    //    - CODE_REVIEW reviews the working-tree diff of one task.
    //    - INTEGRATION_REVIEW reviews the whole assembled feature: every task
    //      commit on the epic branch, i.e. the range from the epic's base tag to
    //      HEAD. Task work is committed by then, so a plain `git diff HEAD` would
    //      be empty.
    let codeDiff: string | null = null;
    if (column === Column.CODE_REVIEW) {
      codeDiff = this.clampDiff(this.gitGateway.diff(projectRoot));
    } else if (column === Column.INTEGRATION_REVIEW) {
      const baseTag = `aeos-base/${ticketId}`;
      const raw = this.gitGateway.refExists(projectRoot, baseTag)
        ? this.gitGateway.diffRange(projectRoot, baseTag, 'HEAD')
        : this.gitGateway.diff(projectRoot);
      codeDiff = this.clampDiff(raw);
    }

    return { ticketContent, settledDecisions, priorArtifacts, epicContext, constraints, codeDiff };
  }

  /** Normalizes an empty diff to a marker and truncates an oversized one. */
  private clampDiff(rawDiff: string): string {
    if (rawDiff.trim() === '') return 'No changes detected';
    if (rawDiff.length > MAX_DIFF_CHARS) {
      return `${rawDiff.slice(0, MAX_DIFF_CHARS)}\n\n[DIFF TRUNCATED — showing first 50,000 characters of ${rawDiff.length} total]`;
    }
    return rawDiff;
  }

  /**
   * Reads the parent epic's PRD and tech-spec artifacts for a child task.
   * Returns [] for an epic (no parent) or when the parent has no such artifacts.
   */
  private gatherEpicContext(ticketContent: string, projectRoot: string): PriorArtifact[] {
    const epicId = parentEpicId(ticketContent);
    if (!epicId) return [];

    const parentFiles = this.artifactStore.listArtifacts(projectRoot, epicId);
    const out: PriorArtifact[] = [];
    // Preserve EPIC_SPEC_SUFFIXES order (PRD before tech spec) rather than the
    // directory's order.
    for (const suffix of EPIC_SPEC_SUFFIXES) {
      const filename = parentFiles.find((name) => name.endsWith(suffix));
      if (filename) {
        out.push({
          name: filename,
          content: this.artifactStore.readArtifact(projectRoot, epicId, filename),
        });
      }
    }
    return out;
  }
}
