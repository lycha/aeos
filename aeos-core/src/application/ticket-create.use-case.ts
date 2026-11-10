// Use case — TicketCreate

import * as path from 'node:path';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type { ArtefactTree } from '../domain/ports/driven/artefact-tree.port.js';
import type { DecisionsLint } from '../domain/ports/driven/decisions-lint.port.js';
import type { SpecPin } from '../domain/model/spec-pin.js';
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
    private readonly artefactTree: ArtefactTree,
    private readonly decisionsLint: DecisionsLint,
  ) {}

  execute(input: TicketCreateInput): TicketCreateResult {
    const { title, projectId, projectKey, projectPath, parentId, taskKey, body } = input;

    if (input.spec !== undefined && parentId) {
      throw new Error(
        '--spec backs an epic with a spec; it cannot be combined with --parent. A task inherits the pin of its epic.',
      );
    }
    if (input.spec === undefined && !parentId) {
      throw new Error(
        'An epic needs a spec: pass --spec <feature>. A person writes the spec; AEOS reviews it and builds from it. ' +
          'The skills that produce one, in order: prototype-harvest (what exists), gap-interrogation-solo or ' +
          'gap-interrogation-capture (the decisions), spec-writer (spec.md under .aeos/features/<feature>/).',
      );
    }
    const specPin =
      input.spec === undefined ? null : this.pinSpec(projectKey, projectPath, input.spec);

    // A parent makes this a task; without one it is an epic.
    const kind = parentId ? TicketKind.TASK : TicketKind.EPIC;

    // A key only identifies a task under a parent; an epic never carries one,
    // matching the port contract ("ignored without a parent").
    const resolvedTaskKey = parentId ? taskKey?.trim() || null : null;
    const titleMatches = (child: { title: string }): boolean =>
      child.title.trim().toLowerCase() === title.trim().toLowerCase();

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

      // Idempotent: decomposition creates tasks during an agentic run, which the
      // review loop may retry. A matching child short-circuits rather than
      // duplicating.
      const children = this.ticketRepo.findChildren(projectId, parentId);
      let existing: (typeof children)[number] | undefined;
      if (resolvedTaskKey) {
        const wanted = resolvedTaskKey.toLowerCase();
        // Match on the key — a retry may rephrase the title, so keying on title
        // alone would miss and duplicate. Secondarily match a KEYLESS child with
        // the same title: that is the same task from a pre-key attempt, and
        // pairing it here avoids duplicating when key usage started mid-stream.
        existing =
          children.find((child) => child.taskKey?.trim().toLowerCase() === wanted) ??
          children.find((child) => !child.taskKey && titleMatches(child));
      } else {
        existing = children.find(titleMatches);
      }
      if (existing) {
        return {
          ticketId: existing.id,
          title: existing.title,
          kind: existing.kind,
          parentId: existing.parentId,
          taskKey: existing.taskKey ?? null,
          alreadyExisted: true,
        };
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
        taskKey: resolvedTaskKey,
        specPin,
        column: 'BACKLOG' as const,
        subState: null,
        createdAt: now,
        updatedAt: now,
      };
    });

    const ticketId = ticket.id;

    // 2. Build ticket markdown content
    const content = buildInitialTicketDocument(ticket, body);

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
    return {
      ticketId,
      title,
      kind,
      parentId: parentId ?? null,
      taskKey: resolvedTaskKey,
      alreadyExisted: false,
      ...(specPin ? { specPin } : {}),
    };
  }

  /** Checks the feature is fit to build from, in the order the errors are useful, and pins it. */
  private pinSpec(projectKey: string, projectPath: string, feature: string): SpecPin {
    // The name becomes a path and a git pathspec.
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(feature)) {
      throw new Error(
        `"${feature}" is not a feature name: use the directory name under features/.`,
      );
    }
    const treeRoot = this.artefactTree.root(projectPath);
    const featureDir = this.artefactTree.featureDir(projectPath, feature);
    const featurePath = `features/${feature}`;

    if (!this.artefactTree.exists(projectPath, feature)) {
      throw new Error(`Feature "${feature}" not found: ${featureDir} does not exist.`);
    }
    const missing = this.decisionsLint.missingFiles(featureDir);
    if (missing.length > 0) {
      throw new Error(`Feature "${feature}" is missing ${missing.join(' and ')}.`);
    }

    const lint = this.decisionsLint.lint(treeRoot, feature);
    if (lint.schemaErrors.length > 0) {
      throw new Error(
        `decisions.yaml of feature "${feature}" does not match its schema: ${lint.schemaErrors.join('; ')}`,
      );
    }
    if (lint.lintErrors.length > 0) {
      throw new Error(
        `lint_decisions.py failed for feature "${feature}":\n${lint.lintErrors.map((error) => `  - ${error}`).join('\n')}`,
      );
    }
    if (lint.escalated.length > 0) {
      throw new Error(
        `Feature "${feature}" has escalated decisions: ${lint.escalated.join(', ')}. An epic cannot be built on a decision nobody has made; resolve them in decisions.yaml first.`,
      );
    }

    const uncommitted = this.gitGateway
      .changedFiles(treeRoot)
      .filter((file) => file.startsWith(`${featurePath}/`));
    if (uncommitted.length > 0) {
      throw new Error(
        `Feature "${feature}" has uncommitted changes in ${treeRoot}: ${uncommitted.join(', ')}. Commit them first, so the epic is pinned to what you see.`,
      );
    }

    return {
      repo: `${projectKey}-aeos`,
      commit: this.gitGateway.headCommit(treeRoot),
      path: featurePath,
    };
  }
}
