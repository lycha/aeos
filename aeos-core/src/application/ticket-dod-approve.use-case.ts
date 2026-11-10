// Use case — TicketDodApprove (final human gate → DONE)

import * as path from 'node:path';
import { Column } from '../domain/model/column.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type { CostRepository } from '../domain/ports/driven/cost-repository.port.js';
import type { StateMachineService } from '../domain/services/state-machine.js';
import type {
  DodReview,
  TicketDodApprovePort,
  TicketDodApproveResult,
} from '../domain/ports/driving/ticket-dod-approve.port.js';
import type { PullRequestGateway } from '../domain/ports/driven/pull-request-gateway.port.js';
import type { RunRecordStore } from '../domain/ports/driven/run-record-store.port.js';
import type { Ticket } from '../domain/model/ticket.js';
import { SubState } from '../domain/model/sub-state.js';
import { runRecordPaths } from '../domain/model/run-record.js';
import {
  addInstruments,
  conformanceYaml,
  renderConformanceMarkdown,
  renderConformanceTable,
  type InstrumentAddition,
} from '../domain/services/conformance-builder.js';
import { parseConformanceVerdicts } from '../domain/services/conformance-verdict-parser.js';
import type { ConformanceService } from './services/conformance.service.js';
import type { GateRecorder } from './services/gate-recorder.js';
import { fillConformance } from './services/pull-request-text.js';
import { syncTicketDocument } from './services/ticket-document.js';

export class TicketDodApproveUseCase implements TicketDodApprovePort {
  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly artifactStore: ArtifactStore,
    private readonly stateMachine: StateMachineService,
    private readonly gitGateway: GitGateway,
    private readonly costRepo: CostRepository,
    private readonly gateRecorder: GateRecorder,
    private readonly conformance: ConformanceService,
    private readonly runRecordStore: RunRecordStore,
    private readonly pullRequestGateway: PullRequestGateway,
  ) {}

  async review(
    projectId: string,
    projectPath: string,
    ticketId: string,
    verified: readonly string[] = [],
  ): Promise<{ ok: true; review: DodReview } | { ok: false; error: string }> {
    const found = this.atTheGate(projectId, ticketId);
    if (!found.ok) return found;
    const { ticket } = found;
    const prUrl = ticket.prUrl ?? null;
    if (!ticket.specPin) return { ok: true, review: { report: null, prUrl } };

    // Rebuilt now, so the report is about the commit being approved.
    const { report } = await this.conformance.buildConformance(projectPath, ticketId);
    const unknown = verified.filter((id) => !report.criteria.some((c) => c.id === id));
    if (unknown.length > 0) {
      return {
        ok: false,
        error: `--verified names ${unknown.join(', ')}, which the spec of ${ticketId} does not contain.`,
      };
    }
    const person = verified.length > 0 ? this.gateRecorder.decidedBy(projectPath) : '';
    return {
      ok: true,
      review: {
        report: addInstruments(report, [
          ...this.agentVerdicts(projectPath, ticket).filter((addition) =>
            report.criteria.some((c) => c.id === addition.id && c.verdict === 'unverified'),
          ),
          // The gate record that will carry the decision is cited once it has an id.
          ...verified.map(
            (id): InstrumentAddition => ({
              id,
              instrument: { kind: 'human', name: person, result: 'pass' },
            }),
          ),
        ]),
        prUrl,
      },
    };
  }

  /** The verdicts of the column's last worker run, when the run was signed off. */
  private agentVerdicts(projectPath: string, ticket: Ticket): InstrumentAddition[] {
    if (ticket.subState !== SubState.SIGNED_OFF) return [];
    const run = this.runRecordStore
      .list(projectPath, ticket.id)
      .filter((record) => record.column === ticket.column && record.role === 'worker')
      .at(-1);
    if (!run?.output || !run.agent) return [];
    const filename = path.basename(run.output);
    if (!this.artifactStore.artifactExists(projectPath, ticket.id, filename)) return [];
    const parsed = parseConformanceVerdicts(
      this.artifactStore.readArtifact(projectPath, ticket.id, filename),
    );
    if (!parsed.ok) return [];
    const agent = run.agent;
    return parsed.verdicts.map((verdict) => ({
      id: verdict.id,
      instrument: {
        kind: 'agent',
        name: agent,
        result: verdict.result,
        evidence: runRecordPaths(ticket.id, run.run_id).record,
      },
      notes: verdict.justification,
    }));
  }

  private atTheGate(
    projectId: string,
    ticketId: string,
  ): { ok: true; ticket: Ticket } | { ok: false; error: string } {
    const ticket = this.ticketRepo.findById(projectId, ticketId);
    if (!ticket) return { ok: false, error: `Ticket ${ticketId} not found` };
    if (ticket.column !== Column.DOD_GATE) {
      return {
        ok: false,
        error: `Ticket ${ticketId} is not in DOD_GATE (current column: ${ticket.column}). Only DOD_GATE tickets can be approved via dod-approve.`,
      };
    }
    return { ok: true, ticket };
  }

  execute(
    projectId: string,
    projectPath: string,
    ticketId: string,
    approved: boolean,
    reason?: string,
    review?: DodReview,
  ): TicketDodApproveResult {
    // 1. Load ticket; it must be at the gate
    const found = this.atTheGate(projectId, ticketId);
    if (!found.ok) return { status: 'error', ticketId, error: found.error };
    const { ticket } = found;

    // 2. A spec-backed ticket is decided on its conformance report.
    const report = review?.report ?? null;
    if (ticket.specPin && !report) {
      return {
        status: 'error',
        ticketId,
        error: `Ticket ${ticketId} is spec-backed: its conformance report must be reviewed before the decision.`,
      };
    }

    // 3. A no is a decision too: record it, and leave the ticket at the gate.
    if (!approved) {
      this.gateRecorder.record(projectPath, ticket, {
        gate: 'definition-of-done',
        verdict: 'rejected',
        reason,
      });
      return { status: 'cancelled', ticketId };
    }
    const open = report ? report.summary.fail + report.summary.unverified : 0;
    if (open > 0 && !reason?.trim()) {
      return {
        status: 'error',
        ticketId,
        error: `${report!.summary.fail} failed and ${report!.summary.unverified} unverified of ${report!.summary.total} criteria: approving ${ticketId} needs --reason "<why>". It is recorded with the decision. To vouch for a criterion yourself, use --verified <ids>.`,
      };
    }
    const decision = {
      gate: 'definition-of-done',
      verdict: 'approved',
      fromColumn: Column.DOD_GATE,
      toColumn: Column.DONE,
      ...(reason?.trim() ? { reason } : {}),
    } as const;
    // The report is committed with the decision, in one commit, beside its gates file.
    const gate = report
      ? this.gateRecorder.record(projectPath, ticket, decision, (numbered) => {
          const cited = {
            ...report,
            criteria: report.criteria.map((criterion) => ({
              ...criterion,
              instruments: criterion.instruments.map((instrument) =>
                instrument.kind === 'human' && !instrument.evidence
                  ? { ...instrument, evidence: `${ticket.specPin!.path}/gates.yaml#${numbered.id}` }
                  : instrument,
              ),
            })),
          };
          return {
            'conformance.yaml': conformanceYaml(cited),
            'conformance.md': renderConformanceMarkdown(cited),
          };
        })
      : this.gateRecorder.record(projectPath, ticket, decision);

    // 4. Transition column to DONE
    const transitionResult = this.stateMachine.transition(projectId, ticketId, Column.DONE);
    if (!transitionResult.ok) {
      return { status: 'error', ticketId, error: transitionResult.reason };
    }

    // 5. Set sub-state to null (DONE is terminal — no active sub-state).
    //    StateMachineService.setSubState() requires a valid SubState value,
    //    so we go through the repository directly to clear it.
    this.ticketRepo.updateSubState(projectId, ticketId, null);

    // 6. Commit approval to git
    const aeosDir = path.join(projectPath, '.aeos');
    syncTicketDocument(this.artifactStore, projectPath, {
      ...ticket,
      column: Column.DONE,
      subState: null,
    });
    try {
      this.gitGateway.commit(aeosDir, `[${ticketId}][HUMAN][v1][dod-approve: DOD_GATE → DONE]`);
    } catch (err) {
      // Compensate: revert column back to DOD_GATE and restore previous sub-state
      this.stateMachine.transition(projectId, ticketId, Column.DOD_GATE);
      if (ticket.subState !== null) {
        this.stateMachine.setSubState(projectId, ticketId, ticket.subState);
      }
      syncTicketDocument(this.artifactStore, projectPath, ticket);
      throw err;
    }

    // 7. Calculate total cost
    const costRecords = this.costRepo.findByTicket(projectId, ticketId);
    // One unknown cost makes the total unknown; a partial sum would read as the whole.
    const totalCostUsd = costRecords.reduce<number | null>(
      (sum, r) => (sum === null || r.costUsd === null ? null : sum + r.costUsd),
      0,
    );

    // 8. The pull request shows what was approved. The decision is already made.
    let warning: string | undefined;
    if (report && ticket.prUrl) {
      try {
        this.pullRequestGateway.updateBody({
          cwd: projectPath,
          head: `aeos/${ticketId}`,
          update: (body) => fillConformance(body, renderConformanceTable(report)),
        });
      } catch (err) {
        warning = `The conformance summary could not be written to ${ticket.prUrl}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    // 9. Return success
    return {
      status: 'approved',
      ticketId,
      totalCostUsd,
      ...(gate?.id ? { gateRecordId: gate.id } : {}),
      ...(warning ? { warning } : {}),
    };
  }
}
