// Application service — GateRecorder: turns a human decision at a gate into a
// gate record and appends it. Callers record before they change ticket state,
// so a decision that cannot be recorded does not happen.

import * as path from 'node:path';
import type { Column } from '../../domain/model/column.js';
import type { GateKind, GateRecord, GateVerdict } from '../../domain/model/gate-record.js';
import { runRecordPaths } from '../../domain/model/run-record.js';
import type { Ticket } from '../../domain/model/ticket.js';
import type { TicketKind } from '../../domain/model/ticket-kind.js';
import type { GateRecordStore } from '../../domain/ports/driven/gate-record-store.port.js';
import type { GitGateway } from '../../domain/ports/driven/git-gateway.port.js';
import type { RunRecordStore } from '../../domain/ports/driven/run-record-store.port.js';
import type { TicketRepository } from '../../domain/ports/driven/ticket-repository.port.js';
import { resolveSpecPin } from './spec-pin.js';

export interface GateDecision {
  readonly gate: GateKind;
  readonly verdict: GateVerdict;
  readonly fromColumn?: Column;
  readonly toColumn?: Column;
  /** Required, at least ten characters, unless the verdict is `approved`; kept when given. */
  readonly reason?: string;
}

const MIN_REASON_LENGTH = 10;

export class GateRecorder {
  constructor(
    private readonly store: GateRecordStore,
    private readonly gitGateway: GitGateway,
    private readonly ticketRepo: TicketRepository,
    private readonly runRecordStore: RunRecordStore,
  ) {}

  /** The person deciding. Throws, with the fix, when git does not know who that is. */
  decidedBy(projectPath: string): string {
    const identity = this.gitGateway.userIdentity(projectPath);
    if (!identity) {
      throw new Error(
        `A gate decision is recorded under your name, and ${projectPath} has no git identity. Set one: git config user.name "Your Name" && git config user.email you@example.com`,
      );
    }
    return identity;
  }

  /**
   * Records that a person changed a kind's pipeline. No ticket is its subject,
   * so the records share one file, `.aeos/tickets/pipelines/pipelines-gates.yaml`,
   * and the old and new order are the reason.
   */
  recordPipelineChange(
    projectPath: string,
    kind: TicketKind,
    from: readonly Column[],
    to: readonly Column[],
  ): GateRecord {
    return this.store.append(projectPath, {
      gate: 'pipeline-change',
      ticket: 'pipelines',
      column: null,
      from_column: null,
      to_column: null,
      decided_by: this.decidedBy(projectPath),
      decided_at: new Date().toISOString(),
      verdict: 'approved',
      reason: `${kind} pipeline changed from ${from.join(' → ')} to ${to.join(' → ')}`,
      overrides: null,
      evidence: [],
      spec_pin: null,
    });
  }

  /**
   * Records a decision about `ticket` as it is now: its current column is the
   * column being decided.
   */
  record(
    projectPath: string,
    ticket: Ticket,
    decision: GateDecision,
    /** Files to commit with the record; see `GateRecordStore.append`. */
    alongside?: (numbered: GateRecord) => Readonly<Record<string, string>>,
  ): GateRecord {
    const reason = decision.reason?.trim();
    // An approval needs none; one that is given is held to the same length.
    if ((decision.verdict !== 'approved' || reason) && (reason?.length ?? 0) < MIN_REASON_LENGTH) {
      throw new Error(
        'This decision needs a written reason of at least ten characters (--reason "<why>"). It is recorded with the decision.',
      );
    }
    const decidedBy = this.decidedBy(projectPath);

    const runs = this.runRecordStore
      .list(projectPath, ticket.id)
      .filter((run) => run.column === ticket.column);
    const latest = (...roles: string[]) => runs.filter((run) => roles.includes(run.role)).at(-1);
    const evidencePaths = [
      latest('reviewer')?.output,
      latest('checks')?.output,
      ...runs.map((run) => runRecordPaths(ticket.id, run.run_id).record),
    ].filter((evidencePath) => typeof evidencePath === 'string');
    // The id is `<project key>-<n>`, and the `.aeos` repository is `<project key>-aeos`.
    const repo = `${ticket.id.slice(0, ticket.id.lastIndexOf('-'))}-aeos`;
    const commit =
      evidencePaths.length > 0 ? this.gitGateway.headCommit(path.join(projectPath, '.aeos')) : '';

    const record: Omit<GateRecord, 'id'> = {
      gate: decision.gate,
      ticket: ticket.id,
      column: ticket.column,
      from_column: decision.fromColumn ?? null,
      to_column: decision.toColumn ?? null,
      decided_by: decidedBy,
      decided_at: new Date().toISOString(),
      verdict: decision.verdict,
      ...(reason ? { reason } : {}),
      overrides:
        decision.gate === 'sign-off-override'
          ? (latest('reviewer', 'checks')?.run_id ?? null)
          : null,
      evidence: evidencePaths.map((evidencePath) => ({ repo, commit, path: evidencePath })),
      spec_pin: resolveSpecPin(this.ticketRepo, ticket),
    };
    return alongside
      ? this.store.append(projectPath, record, alongside)
      : this.store.append(projectPath, record);
  }
}
