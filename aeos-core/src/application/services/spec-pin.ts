// Application service — the spec pin of a ticket.

import type { GateRecord } from '../../domain/model/gate-record.js';
import type { SpecPin } from '../../domain/model/spec-pin.js';
import type { Ticket } from '../../domain/model/ticket.js';
import type { ArtefactTree } from '../../domain/ports/driven/artefact-tree.port.js';
import type { DecisionsLint } from '../../domain/ports/driven/decisions-lint.port.js';
import type { GateRecordStore } from '../../domain/ports/driven/gate-record-store.port.js';
import type { GitGateway } from '../../domain/ports/driven/git-gateway.port.js';
import type { TicketRepository } from '../../domain/ports/driven/ticket-repository.port.js';

const FEATURES_PREFIX = 'features/';

/** The feature a pin points at: `features/<feature>` without the prefix. */
export function featureOf(pin: SpecPin): string {
  return pin.path.slice(FEATURES_PREFIX.length);
}

/** A ticket's own pin, or its parent epic's: a task's pin is never copied. */
export function resolveSpecPin(ticketRepo: TicketRepository, ticket: Ticket): SpecPin | null {
  if (ticket.specPin) return ticket.specPin;
  if (!ticket.parentId) return null;
  return ticketRepo.findById(ticket.projectId, ticket.parentId)?.specPin ?? null;
}

/** `<repo>@<commit>`, as written in the `Spec:` commit trailer. */
export function formatSpecPin(pin: SpecPin): string {
  return `${pin.repo}@${pin.commit}`;
}

/**
 * The amendment written to the feature's decision log under this pin, if any.
 * A repin moves the pin, so a record that still carries the current commit is
 * an amendment nobody has come forward from yet.
 */
export function pendingAmendment(
  gateRecordStore: GateRecordStore,
  projectPath: string,
  pin: SpecPin,
): GateRecord | undefined {
  return gateRecordStore
    .list(projectPath, { feature: featureOf(pin) })
    .find((record) => record.gate === 'amendment' && record.spec_pin?.commit === pin.commit);
}

/**
 * Checks the feature is fit to build from, in the order the errors are useful,
 * and returns its pin at the tree's `HEAD`. Used to pin an epic and to repin it.
 */
export function pinSpec(
  deps: { artefactTree: ArtefactTree; decisionsLint: DecisionsLint; gitGateway: GitGateway },
  repo: string,
  projectPath: string,
  feature: string,
): SpecPin {
  const { artefactTree, decisionsLint, gitGateway } = deps;
  // The name becomes a path and a git pathspec.
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(feature)) {
    throw new Error(`"${feature}" is not a feature name: use the directory name under features/.`);
  }
  const treeRoot = artefactTree.root(projectPath);
  const featureDir = artefactTree.featureDir(projectPath, feature);
  const featurePath = `features/${feature}`;

  if (!artefactTree.exists(projectPath, feature)) {
    throw new Error(`Feature "${feature}" not found: ${featureDir} does not exist.`);
  }
  const missing = decisionsLint.missingFiles(featureDir);
  if (missing.length > 0) {
    throw new Error(`Feature "${feature}" is missing ${missing.join(' and ')}.`);
  }

  const lint = decisionsLint.lint(treeRoot, feature);
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

  const uncommitted = gitGateway
    .changedFiles(treeRoot)
    .filter((file) => file.startsWith(`${featurePath}/`));
  if (uncommitted.length > 0) {
    throw new Error(
      `Feature "${feature}" has uncommitted changes in ${treeRoot}: ${uncommitted.join(', ')}. Commit them first, so the epic is pinned to what you see.`,
    );
  }

  return {
    repo,
    commit: gitGateway.headCommit(treeRoot),
    path: featurePath,
  };
}
