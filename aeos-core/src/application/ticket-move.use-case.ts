// Use case — TicketMove (human override to any workflow column)

import * as path from 'node:path';
import { Column, columnOrderFor } from '../domain/model/column.js';
import { SubState } from '../domain/model/sub-state.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type { PipelineLoader } from '../domain/ports/driven/pipeline-loader.port.js';
import type { StateMachineService } from '../domain/services/state-machine.js';
import type {
  TicketMoveInput,
  TicketMovePort,
  TicketMoveResult,
} from '../domain/ports/driving/ticket-move.port.js';
import type { GateRecorder } from './services/gate-recorder.js';
import { syncTicketDocument } from './services/ticket-document.js';

export class TicketMoveUseCase implements TicketMovePort {
  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly artifactStore: ArtifactStore,
    private readonly stateMachine: StateMachineService,
    private readonly gitGateway: GitGateway,
    private readonly gateRecorder: GateRecorder,
    private readonly pipelineLoader: PipelineLoader,
  ) {}

  execute(input: TicketMoveInput): TicketMoveResult {
    const { projectId, projectPath, ticketId, targetColumn, reason } = input;

    const ticket = this.ticketRepo.findById(projectId, ticketId);
    if (!ticket) {
      return { status: 'error', ticketId, error: `Ticket ${ticketId} not found` };
    }

    const pipeline = columnOrderFor(this.pipelineLoader.load(projectPath), ticket.kind);
    if (!pipeline.includes(targetColumn)) {
      return {
        status: 'error',
        ticketId,
        error: `Unknown status '${targetColumn}' for ${ticket.kind} ${ticketId}. Valid statuses: ${pipeline.join(', ')}`,
      };
    }

    const currentColumn = ticket.column;
    // Checked here as well as by the state machine: a move that will not
    // happen must not be recorded as one.
    if (currentColumn === targetColumn) {
      return { status: 'error', ticketId, error: `Already in ${currentColumn}` };
    }
    const gate = this.gateRecorder.record(projectPath, ticket, {
      gate: 'move-override',
      verdict: 'overridden',
      fromColumn: currentColumn,
      toColumn: targetColumn,
      reason,
    });

    const transitionResult = this.stateMachine.transition(projectId, ticketId, targetColumn);
    if (!transitionResult.ok) {
      return { status: 'error', ticketId, error: transitionResult.reason };
    }

    if (targetColumn === Column.DONE) {
      this.ticketRepo.updateSubState(projectId, ticketId, null);
    } else if (targetColumn !== Column.BACKLOG) {
      const subStateResult = this.stateMachine.setSubState(projectId, ticketId, SubState.READY);
      if (!subStateResult.ok) {
        return {
          status: 'error',
          ticketId,
          error: `Failed to set READY state: ${subStateResult.reason}`,
        };
      }
    }

    const nextSubState =
      targetColumn === Column.DONE || targetColumn === Column.BACKLOG ? null : SubState.READY;

    const aeosDir = path.join(projectPath, '.aeos');
    syncTicketDocument(this.artifactStore, projectPath, {
      ...ticket,
      column: targetColumn,
      subState: nextSubState,
    });
    try {
      this.gitGateway.commit(
        aeosDir,
        `[${ticketId}][HUMAN][v1][move: ${currentColumn} → ${targetColumn}]`,
      );
    } catch (err) {
      this.stateMachine.transition(projectId, ticketId, currentColumn);
      if (currentColumn === Column.DONE) {
        this.ticketRepo.updateSubState(projectId, ticketId, null);
      } else if (currentColumn !== Column.BACKLOG && ticket.subState !== null) {
        this.stateMachine.setSubState(projectId, ticketId, ticket.subState);
      }
      syncTicketDocument(this.artifactStore, projectPath, ticket);
      throw err;
    }

    return {
      status: 'moved',
      ticketId,
      fromColumn: currentColumn,
      toColumn: targetColumn,
      gateRecordId: gate.id,
    };
  }
}
