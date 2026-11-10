// Use case — TicketAnswer (unblock after preflight questions)

import * as path from 'node:path';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type { StateMachineService } from '../domain/services/state-machine.js';
import type {
  TicketAnswerPort,
  TicketAnswerInput,
  TicketAnswerResult,
} from '../domain/ports/driving/ticket-answer.port.js';
import { SubState } from '../domain/model/sub-state.js';
import { syncTicketDocument } from './services/ticket-document.js';
import type { GateRecorder } from './services/gate-recorder.js';
import type { DecisionPromotionService } from './services/decision-promotion.service.js';
import type { SpecAmendmentService } from './services/spec-amendment.service.js';
import type { AmendedDecision } from '../domain/ports/driven/decisions-file.port.js';
import { featureOf, resolveSpecPin } from './services/spec-pin.js';

export class TicketAnswerUseCase implements TicketAnswerPort {
  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly artifactStore: ArtifactStore,
    private readonly stateMachine: StateMachineService,
    private readonly gitGateway: GitGateway,
    private readonly decisionPromotionService: DecisionPromotionService,
    private readonly gateRecorder: GateRecorder,
    private readonly specAmendment: SpecAmendmentService,
  ) {}

  execute(input: TicketAnswerInput): TicketAnswerResult {
    const { projectId, projectPath, ticketId, confirmed } = input;

    // 1. Load ticket
    const ticket = this.ticketRepo.findById(projectId, ticketId);
    if (!ticket) {
      return { ok: false, error: `Ticket ${ticketId} not found` };
    }

    // 2. Verify ticket sub-state is BLOCKED
    if (ticket.subState !== 'BLOCKED') {
      return {
        ok: false,
        error: `Ticket ${ticketId} is not blocked (current state: ${ticket.subState ?? 'none'}). Only blocked tickets can be answered.`,
      };
    }

    // 3. Check questions file exists
    const questionsFilename = `${ticketId}-questions.md`;
    if (!this.artifactStore.artifactExists(projectPath, ticketId, questionsFilename)) {
      return { ok: false, error: `Questions file not found: ${questionsFilename}` };
    }

    // 4. Check modification time — warn if file hasn't been modified since ticket was updated
    if (!confirmed) {
      const mtime = this.artifactStore.getArtifactMtime(projectPath, ticketId, questionsFilename);
      const ticketUpdatedAt = new Date(ticket.updatedAt).getTime();
      const fileMtime = mtime ? mtime.getTime() : 0;
      if (fileMtime <= ticketUpdatedAt) {
        return {
          ok: false,
          needsConfirmation: true,
          reason: 'questions file not modified',
        };
      }
    }

    // 5. A spec-backed ticket: each answer is a decision the spec did not
    // have, so it goes to the feature's decision log first. Nothing else is
    // written if that is refused.
    const pin = resolveSpecPin(this.ticketRepo, ticket);
    let amended: AmendedDecision[] = [];
    if (pin) {
      let answered;
      try {
        answered = this.decisionPromotionService.answered(projectPath, ticketId);
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
      // A legacy questions file has no answers to read; it unblocks as before.
      if (answered) {
        this.gateRecorder.decidedBy(projectPath);
        const amendment = this.specAmendment.amend(projectPath, ticket, pin, answered);
        if (!amendment.ok) return { ok: false, error: amendment.error };
        amended = amendment.decisions;
      }
    }

    // 6. Promote structured questions into decisions when possible
    const promotion = this.decisionPromotionService.promote({
      projectPath,
      ticketId,
      stage: ticket.column,
      settledBy: 'human',
    });

    if (promotion.status === 'validation-error') {
      return { ok: false, error: promotion.error ?? 'Decision promotion failed' };
    }

    if (pin && amended.length > 0) {
      this.gateRecorder.record(projectPath, ticket, {
        gate: 'amendment',
        verdict: 'approved',
        reason: `Amended decisions.yaml of ${featureOf(pin)}: ${amended
          .map((decision) => `${decision.absence} (${decision.becomes})`)
          .join(', ')}.`,
      });
    } else {
      this.gateRecorder.record(projectPath, ticket, { gate: 'answer', verdict: 'approved' });
    }

    // 7. READY, so ticket run can resume. After an amendment the ticket stays
    // BLOCKED instead: spec.md has to catch up and be repinned first.
    const nextSubState = amended.length > 0 ? ticket.subState : SubState.READY;
    if (nextSubState !== ticket.subState) {
      const result = this.stateMachine.setSubState(projectId, ticketId, SubState.READY);
      if (!result.ok) {
        return { ok: false, error: `Failed to set sub-state: ${result.reason}` };
      }
    }

    // 8. Commit the answered questions file (and decisions file when promoted)
    const aeosDir = path.join(projectPath, '.aeos');
    const questionsFilePath = path.join(aeosDir, 'tickets', ticketId, questionsFilename);
    syncTicketDocument(this.artifactStore, projectPath, { ...ticket, subState: nextSubState });
    // The answered questions (and any promoted decisions) are artifacts and
    // stay in git. The ticket file is state — mirrored to disk, not committed.
    const filesToCommit = [questionsFilePath];
    if (promotion.status === 'promoted' && promotion.decisionsPath !== null) {
      filesToCommit.push(path.join(aeosDir, 'tickets', ticketId, promotion.decisionsPath));
    }
    try {
      this.gitGateway.commitFiles(
        aeosDir,
        filesToCommit,
        `[${ticketId}][QUESTIONS][v1][human][answered]`,
      );
    } catch (err) {
      // Compensate: revert sub-state back to BLOCKED
      if (nextSubState !== ticket.subState) {
        this.stateMachine.setSubState(projectId, ticketId, 'BLOCKED');
      }
      syncTicketDocument(this.artifactStore, projectPath, ticket);
      throw err;
    }

    return {
      ok: true,
      ticketId,
      warnings: promotion.status === 'legacy-skipped' ? promotion.warnings : undefined,
      ...(amended.length > 0
        ? { amendedDecisions: amended.map((decision) => decision.absence) }
        : {}),
    };
  }
}
