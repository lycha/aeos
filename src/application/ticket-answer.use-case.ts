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
import type { DecisionPromotionService } from './services/decision-promotion.service.js';

export class TicketAnswerUseCase implements TicketAnswerPort {
  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly artifactStore: ArtifactStore,
    private readonly stateMachine: StateMachineService,
    private readonly gitGateway: GitGateway,
    private readonly decisionPromotionService: DecisionPromotionService,
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

    // 5. Promote structured questions into decisions when possible
    const promotion = this.decisionPromotionService.promote({
      projectPath,
      ticketId,
      stage: ticket.column,
      settledBy: 'human',
    });

    if (promotion.status === 'validation-error') {
      return { ok: false, error: promotion.error ?? 'Decision promotion failed' };
    }

    // 6. Transition sub-state to READY so ticket run can resume execution
    const result = this.stateMachine.setSubState(projectId, ticketId, SubState.READY);
    if (!result.ok) {
      return { ok: false, error: `Failed to set sub-state: ${result.reason}` };
    }

    // 7. Commit the answered questions file (and decisions file when promoted)
    const aeosDir = path.join(projectPath, '.aeos');
    const questionsFilePath = path.join(aeosDir, 'tickets', ticketId, questionsFilename);
    const ticketFilePath = syncTicketDocument(this.artifactStore, projectPath, {
      ...ticket,
      subState: SubState.READY,
    });
    const filesToCommit = [questionsFilePath, ticketFilePath];
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
      this.stateMachine.setSubState(projectId, ticketId, 'BLOCKED');
      syncTicketDocument(this.artifactStore, projectPath, ticket);
      throw err;
    }

    // 8. Return success
    return {
      ok: true,
      ticketId,
      warnings: promotion.status === 'legacy-skipped' ? promotion.warnings : undefined,
    };
  }
}
