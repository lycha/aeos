// Application service — PipelineGuard: holds each kind's pipeline to the one
// last accepted. A changed `.aeos/pipelines.yaml` is accepted, and recorded as
// a gate, only while no ticket of that kind is in flight.

import type { Column, Pipelines } from '../../domain/model/column.js';
import { TicketKind } from '../../domain/model/ticket-kind.js';
import type { PipelineLoader } from '../../domain/ports/driven/pipeline-loader.port.js';
import type { PipelineStateRepository } from '../../domain/ports/driven/pipeline-state-repository.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';
import type { TicketRepository } from '../../domain/ports/driven/ticket-repository.port.js';
import { isInFlight, pipelineChanged } from '../../domain/services/pipeline-change.js';
import type { GateRecorder } from './gate-recorder.js';

export class PipelineGuard {
  constructor(
    private readonly pipelineLoader: PipelineLoader,
    private readonly stateRepo: PipelineStateRepository,
    private readonly ticketRepo: TicketRepository,
    private readonly projectRepo: ProjectRepository,
    private readonly gateRecorder: GateRecorder,
    /** Told, in one line, of each change accepted. */
    private readonly notify: (line: string) => void,
  ) {}

  /** For a command that changes something. Throws while a changed pipeline has tickets in flight. */
  check(projectPath: string): void {
    const { refusals } = this.resolve(projectPath);
    if (refusals.length > 0) throw new Error(refusals.join('\n'));
  }

  /**
   * For a command that only reads: the pipelines in force. A kind whose change
   * is refused keeps its accepted order, so a person can see what is in the way.
   */
  accepted(projectPath: string): Pipelines {
    return this.resolve(projectPath).pipelines;
  }

  private resolve(projectPath: string): { pipelines: Pipelines; refusals: string[] } {
    const current = this.pipelineLoader.load(projectPath);
    const projectId = this.projectRepo.read(projectPath).id;
    const inForce: Record<TicketKind, readonly Column[]> = { ...current };
    const refusals: string[] = [];

    for (const kind of Object.values(TicketKind)) {
      const accepted = this.stateRepo.find(projectId, kind);
      if (accepted && !pipelineChanged(accepted, current[kind])) continue;
      if (accepted) {
        const inFlight = this.ticketRepo
          .findByProject(projectId)
          .filter((ticket) => ticket.kind === kind && isInFlight(ticket.column));
        if (inFlight.length > 0) {
          inForce[kind] = accepted;
          refusals.push(
            `The ${kind} pipeline in .aeos/pipelines.yaml changed while tickets are in flight: ${inFlight.map((ticket) => `${ticket.id} (${ticket.column})`).join(', ')}. Finish them or move them to BACKLOG or DONE, or restore the previous order: ${accepted.join(', ')}`,
          );
          continue;
        }
        // Recorded first: a change that cannot be recorded is not accepted.
        this.gateRecorder.recordPipelineChange(projectPath, kind, accepted, current[kind]);
        this.notify(
          `The ${kind} pipeline changed: ${accepted.join(' → ')} is now ${current[kind].join(' → ')}`,
        );
      }
      this.stateRepo.save(projectId, kind, current[kind], new Date().toISOString());
    }
    return { pipelines: inForce, refusals };
  }
}
