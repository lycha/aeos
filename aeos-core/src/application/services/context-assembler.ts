// Application service — ContextAssembler: reads ticket artifacts + constraints and assembles context for executor invocation

import type { ArtifactStore } from '../../domain/ports/driven/artifact-store.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';
import type { GitGateway } from '../../domain/ports/driven/git-gateway.port.js';
import type { ArtefactTree } from '../../domain/ports/driven/artefact-tree.port.js';
import type { AssembledContext, PriorArtifact } from '../../domain/model/assembled-context.js';
import type { SpecPin } from '../../domain/model/spec-pin.js';
import { Column } from '../../domain/model/column.js';
import { scenariosFor } from '../../domain/services/criteria-trace.js';

/** Maximum characters before a diff is truncated. */
export const MAX_DIFF_CHARS = 50_000;

/**
 * The parent epic's artifact a child task is assembled against, matched by
 * suffix (`AEOS-1-tech-spec.md`). The human-written spec comes through the pin.
 */
const EPIC_TECH_SPEC_SUFFIX = '-tech-spec.md';

/** Pulls the parent epic id out of the ticket document's AEOS metadata block. */
function parentEpicId(ticketContent: string): string | null {
  // The metadata block renders "- Parent: <id>" only for a task (see
  // ticket-document.ts). Absent for an epic.
  const match = ticketContent.match(/^-\s*Parent:\s*(\S+)\s*$/m);
  return match ? match[1] : null;
}

/** The criteria a task claims: "- Implements: AC-1, AC-2" of the metadata block. */
function claimedCriteria(ticketContent: string): string[] {
  const match = ticketContent.match(/^-\s*Implements:\s*(.+)$/m);
  return match ? match[1]!.split(',').map((id) => id.trim()) : [];
}

/**
 * The bounded context a spec belongs to: `context:` in the front matter of
 * spec.md, else in `meta` of decisions.yaml. Null when neither names one.
 */
function specContext(specMd: string, decisionsYaml: string): string | null {
  const frontMatter = /^---\n([\s\S]*?)\n---/.exec(specMd)?.[1] ?? '';
  const name =
    /^context:[ \t]*(.+)$/m.exec(frontMatter)?.[1] ??
    /^meta:\n(?:[ \t]+.*\n)*?[ \t]+context:[ \t]*(.+)$/m.exec(decisionsYaml)?.[1];
  const context = name?.trim().replace(/^["']|["']$/g, '');
  // The name becomes a path in the tree.
  return context && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(context) ? context : null;
}

export class ContextAssembler {
  constructor(
    private artifactStore: ArtifactStore,
    private projectRepo: ProjectRepository,
    private gitGateway: GitGateway,
    private artefactTree: ArtefactTree,
  ) {}

  /**
   * `specPin` is the ticket's pin (its own or its parent epic's, see
   * `resolveSpecPin`), or null for a ticket that is not spec-backed.
   */
  async assemble(
    ticketId: string,
    projectRoot: string,
    column: string,
    specPin: SpecPin | null = null,
  ): Promise<AssembledContext> {
    // 1. Read ticket content
    const ticketFilename = `${ticketId}-ticket.md`;
    const ticketContent = this.artifactStore.readArtifact(projectRoot, ticketId, ticketFilename);

    // 2. Detect decisions artifact and read it when present
    const decisionsFilename = `${ticketId}-decisions.md`;
    const questionsFilename = `${ticketId}-questions.md`;
    // The gate records of a ticket with no spec: a log of decisions, not an input.
    const gatesFilename = `${ticketId}-gates.yaml`;
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
          filename !== gatesFilename &&
          // The markdown report says the same, for a reader.
          filename !== `${ticketId}-criteria-trace.json` &&
          !(hasDecisions && filename === questionsFilename),
      )
      .map((filename) => ({
        name: filename,
        content: this.artifactStore.readArtifact(projectRoot, ticketId, filename),
      }));

    // 3a. For a child task, inject the parent epic's tech spec so the task is
    //     built against — and does not contradict — the decisions that scoped
    //     it. The task's own artifact dir never contains it.
    const epicContext = this.gatherEpicContext(ticketContent, projectRoot);

    // 3b. The pinned spec, for a spec-backed ticket.
    const pinned = specPin
      ? this.readPinnedSpec(projectRoot, specPin, claimedCriteria(ticketContent))
      : null;

    // 4. Read constraints: the project's first, then those of the spec's context.
    const constraints =
      [this.projectRepo.readConstraints(projectRoot), pinned?.constraints ?? null]
        .filter((part) => part !== null)
        .join('\n\n') || null;

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

    return {
      ticketContent,
      settledDecisions,
      priorArtifacts,
      epicContext,
      spec: pinned?.spec ?? [],
      specPin,
      constraints,
      codeDiff,
    };
  }

  /**
   * Reads the spec through git at the pinned commit, never from the working
   * tree: a later edit must not change what an in-flight run is told.
   */
  private readPinnedSpec(
    projectRoot: string,
    pin: SpecPin,
    claims: string[],
  ): { spec: PriorArtifact[]; constraints: string | null } {
    const treeRoot = this.artefactTree.root(projectRoot);
    const read = (file: string): string => {
      try {
        return this.gitGateway.showFile(treeRoot, pin.commit, file);
      } catch {
        throw new Error(
          `Cannot read the pinned spec ${pin.repo}@${pin.commit}: ${file} is not readable at that commit in ${treeRoot}. The spec is never read from the working tree. Check that the commit still exists in the .aeos repository.`,
        );
      }
    };
    const inFeature = (name: string): PriorArtifact => ({
      name,
      content: read(`${pin.path}/${name}`),
    });

    const spec = [inFeature('spec.md'), inFeature('decisions.yaml')];
    // A task that claims criteria is given the scenarios tagged with them and
    // no others; anything else gets every scenario.
    const scenariosDir = `${pin.path}/features`;
    for (const file of this.gitGateway.listFiles(treeRoot, pin.commit, scenariosDir)) {
      if (!file.endsWith('.feature')) continue;
      const feature = inFeature(file.slice(pin.path.length + 1));
      const content = claims.length > 0 ? scenariosFor(feature.content, claims) : feature.content;
      if (content !== null) spec.push({ ...feature, content });
    }

    const context = specContext(spec[0]!.content, spec[1]!.content);
    if (!context) return { spec, constraints: null };
    const contextFiles = this.gitGateway.listFiles(treeRoot, pin.commit, `contexts/${context}`);
    const glossary = `contexts/${context}/glossary.md`;
    if (contextFiles.includes(glossary)) spec.push({ name: glossary, content: read(glossary) });
    const constraints = `contexts/${context}/CONSTRAINTS.md`;
    return {
      spec,
      constraints: contextFiles.includes(constraints) ? read(constraints) : null,
    };
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
   * Reads the parent epic's tech spec for a child task.
   * Returns [] for an epic (no parent) or when the parent has none.
   */
  private gatherEpicContext(ticketContent: string, projectRoot: string): PriorArtifact[] {
    const epicId = parentEpicId(ticketContent);
    if (!epicId) return [];

    const filename = this.artifactStore
      .listArtifacts(projectRoot, epicId)
      .find((name) => name.endsWith(EPIC_TECH_SPEC_SUFFIX));
    return filename
      ? [
          {
            name: filename,
            content: this.artifactStore.readArtifact(projectRoot, epicId, filename),
          },
        ]
      : [];
  }
}
