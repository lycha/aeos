// Application service — SpecAmendmentService: a decision made after the spec
// was pinned goes back to the feature's decision log, so the spec keeps
// describing what the code does.

import * as path from 'node:path';

import type { SpecPin } from '../../domain/model/spec-pin.js';
import type { Ticket } from '../../domain/model/ticket.js';
import type { ArtefactTree } from '../../domain/ports/driven/artefact-tree.port.js';
import type {
  AmendedDecision,
  DecisionsFile,
} from '../../domain/ports/driven/decisions-file.port.js';
import type { DecisionsLint } from '../../domain/ports/driven/decisions-lint.port.js';
import type { GateRecordStore } from '../../domain/ports/driven/gate-record-store.port.js';
import type { GitGateway } from '../../domain/ports/driven/git-gateway.port.js';
import type { AnsweredQuestion } from './decision-promotion.service.js';
import { featureOf, pendingAmendment } from './spec-pin.js';

export type SpecAmendmentResult =
  | { ok: true; decisions: AmendedDecision[] }
  | { ok: false; error: string };

export class SpecAmendmentService {
  constructor(
    private readonly artefactTree: ArtefactTree,
    private readonly decisionsFile: DecisionsFile,
    private readonly decisionsLint: DecisionsLint,
    private readonly gitGateway: GitGateway,
    private readonly gateRecordStore: GateRecordStore,
  ) {}

  /**
   * Adds each answer to `decisions.yaml` of the pinned feature, lints, and
   * commits. A refusal leaves the file as it was.
   */
  amend(
    projectPath: string,
    ticket: Ticket,
    pin: SpecPin,
    answered: readonly AnsweredQuestion[],
  ): SpecAmendmentResult {
    const feature = featureOf(pin);
    const treeRoot = this.artefactTree.root(projectPath);
    const decisionsPath = `${pin.path}/decisions.yaml`;

    // Two amendments under one pin would need a merge nobody has reviewed.
    const pending = pendingAmendment(this.gateRecordStore, projectPath, pin);
    if (pending) {
      return {
        ok: false,
        error: `Feature "${feature}" already has an amendment from ${pending.ticket} that has not been repinned. Update spec.md, commit, and run \`aeos ticket repin ${pending.ticket}\` first; then answer again.`,
      };
    }
    if (this.gitGateway.changedFiles(treeRoot).includes(decisionsPath)) {
      return {
        ok: false,
        error: `${decisionsPath} has uncommitted changes in ${treeRoot}. Commit or discard them first, so the amendment is the only change.`,
      };
    }

    const decisions = this.decisionsFile.amend(
      this.artefactTree.featureDir(projectPath, feature),
      answered.map(({ id, question, answer }) => ({
        question,
        resolution: answer,
        evidence: `${ticket.id}: tickets/${ticket.id}/${ticket.id}-questions.md#${id}`,
      })),
    );
    let errors: string[];
    try {
      const lint = this.decisionsLint.lint(treeRoot, feature);
      errors = [...lint.schemaErrors, ...lint.lintErrors];
    } catch (err) {
      this.gitGateway.restoreFiles(treeRoot, [decisionsPath]);
      throw err;
    }
    if (errors.length > 0) {
      this.gitGateway.restoreFiles(treeRoot, [decisionsPath]);
      return {
        ok: false,
        error: `The amendment was not written: lint_decisions.py failed for feature "${feature}" with it.\n${errors.map((error) => `  - ${error}`).join('\n')}`,
      };
    }
    this.gitGateway.commitFiles(
      treeRoot,
      [path.join(treeRoot, decisionsPath)],
      `decide(${feature}): amendment from ${ticket.id}`,
    );
    return { ok: true, decisions };
  }
}
