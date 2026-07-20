// Use case — Orchestrator (drives an epic and its tasks autonomously)
//
// The control flow here is deliberately dumb: ask the policy what to do next,
// do exactly that one thing, then ask again. All judgment lives in the agents
// this schedules; none lives in the scheduler.
//
// Every loop exit is a HaltReason, including the happy ones. "Why did this
// stop?" is always answerable without reading logs.

import { Column, isValidColumn } from '../domain/model/column.js';
import { OrchestratorStatus, type OrchestratorState } from '../domain/model/orchestrator-state.js';
import { TicketKind } from '../domain/model/ticket-kind.js';
import {
  decideNextAction,
  HaltReason,
  type OrchestratorAction,
} from '../domain/services/orchestrator-policy.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { CostRepository } from '../domain/ports/driven/cost-repository.port.js';
import type { ConfigStore } from '../domain/ports/driven/config-store.port.js';
import type { ColumnSpecLoader } from '../domain/ports/driven/column-spec-loader.port.js';
import type { OrchestratorStateRepository } from '../domain/ports/driven/orchestrator-state-repository.port.js';
import type { TicketRunPort } from '../domain/ports/driving/ticket-run.port.js';
import type { TicketApprovePort } from '../domain/ports/driving/ticket-approve.port.js';
import type {
  OrchestratorPort,
  OrchestratorObserver,
  OrchestratorRunOptions,
  OrchestratorRunResult,
  OrchestratorStep,
} from '../domain/ports/driving/orchestrator.port.js';
import { DEFAULT_GLOBAL_CONFIG } from '../shared/config.js';

/** Bound on actions per invocation — a policy/world disagreement must not spin. */
const DEFAULT_MAX_STEPS = 100;

/**
 * A RUNNING row untouched for this long is treated as abandoned.
 *
 * Safe to keep short because the run heartbeats off its own event stream
 * rather than only between actions — a live run touches the row continuously,
 * so silence really does mean the process is gone.
 */
const STALE_AFTER_MS = 5 * 60 * 1000;

/** Minimum gap between heartbeat writes; events arrive far faster than this. */
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

export class OrchestratorUseCase implements OrchestratorPort {
  private lastHeartbeatMs = 0;

  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly costRepo: CostRepository,
    private readonly stateRepo: OrchestratorStateRepository,
    private readonly columnSpecLoader: ColumnSpecLoader,
    private readonly configStore: ConfigStore,
    private readonly ticketRun: TicketRunPort,
    private readonly ticketApprove: TicketApprovePort,
  ) {}

  async run(
    projectId: string,
    projectPath: string,
    epicId: string,
    options: OrchestratorRunOptions = {},
    observer?: OrchestratorObserver,
  ): Promise<OrchestratorRunResult> {
    const epic = this.ticketRepo.findById(projectId, epicId);
    if (!epic) {
      throw new Error(`Ticket ${epicId} not found`);
    }
    if (epic.kind !== TicketKind.EPIC) {
      throw new Error(
        `${epicId} is a ${epic.kind}. The orchestrator drives epics; a task is scheduled as part of its parent.`,
      );
    }

    const existing = this.stateRepo.find(projectId, epicId);

    // Both early returns deliberately leave stored state alone: a paused epic
    // stays paused, and a live run's RUNNING row is not ours to overwrite.
    if (existing?.status === OrchestratorStatus.PAUSED) {
      return {
        epicId,
        haltReason: HaltReason.NEEDS_HUMAN,
        message: `Epic ${epicId} is paused. Run \`aeos orchestrator resume ${epicId}\` first.`,
        steps: [],
        spentUsd: this.spendFor(projectId, epicId),
      };
    }

    if (existing?.status === OrchestratorStatus.RUNNING && !this.isStale(existing.updatedAt)) {
      return {
        epicId,
        haltReason: HaltReason.NEEDS_HUMAN,
        message: `Epic ${epicId} is already being driven by another run (last heartbeat ${existing.updatedAt}). Wait for it, or clear the lock with \`aeos orchestrator resume ${epicId}\` if you are sure it is gone.`,
        steps: [],
        spentUsd: this.spendFor(projectId, epicId),
      };
    }

    // A budget supplied on this run persists, so later runs inherit the ceiling.
    const budgetUsd = options.budgetUsd ?? existing?.budgetUsd ?? null;
    const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
    const steps: OrchestratorStep[] = [];

    this.writeState(projectId, epicId, OrchestratorStatus.RUNNING, null, null, budgetUsd);
    let settled = false;

    try {
      for (let step = 0; step < maxSteps; step += 1) {
        // Re-read every tick: the previous action changed the world, and a
        // stale view is how a scheduler double-runs a ticket.
        const current = this.ticketRepo.findById(projectId, epicId);
        if (!current) {
          throw new Error(`Ticket ${epicId} disappeared mid-run`);
        }
        const children = this.ticketRepo.findChildren(projectId, epicId);
        const spentUsd = this.spendFor(projectId, epicId);

        const action = decideNextAction({
          epic: current,
          children,
          spentUsd,
          budgetUsd,
          autoAdvance: (column) => this.autoAdvance(projectPath, column),
        });

        if (action.kind === 'halt') {
          settled = true;
          return this.haltWith(
            projectId,
            epicId,
            action.reason,
            action.message,
            steps,
            spentUsd,
            OrchestratorStatus.IDLE,
          );
        }

        const outcome = await this.perform(action, projectId, projectPath, () =>
          this.heartbeat(projectId, epicId),
        );
        const recorded: OrchestratorStep = {
          action: action.kind,
          ticketId: action.ticketId,
          outcome,
        };
        steps.push(recorded);
        observer?.onStep?.(recorded);
        this.heartbeat(projectId, epicId, true);
      }

      settled = true;
      return this.haltWith(
        projectId,
        epicId,
        HaltReason.NEEDS_HUMAN,
        `Stopped after ${maxSteps} actions without reaching a terminal state. This usually means a ticket is cycling — inspect it with \`aeos ticket show ${epicId}\`.`,
        steps,
        this.spendFor(projectId, epicId),
        OrchestratorStatus.IDLE,
      );
    } finally {
      // An exception must not leave the epic marked RUNNING — that would look
      // like a live run and lock out the next one until the staleness window
      // elapsed. The error itself still propagates to the caller.
      if (!settled) {
        this.writeState(
          projectId,
          epicId,
          OrchestratorStatus.IDLE,
          null,
          `Run ended unexpectedly after ${steps.length} action(s). See the command output for the error.`,
          budgetUsd,
        );
      }
    }
  }

  pause(projectId: string, epicId: string): OrchestratorState {
    const existing = this.stateRepo.find(projectId, epicId);
    return this.writeState(
      projectId,
      epicId,
      OrchestratorStatus.PAUSED,
      existing?.haltReason ?? null,
      'Paused by operator.',
      existing?.budgetUsd ?? null,
    );
  }

  resume(projectId: string, epicId: string): OrchestratorState {
    const existing = this.stateRepo.find(projectId, epicId);
    return this.writeState(
      projectId,
      epicId,
      OrchestratorStatus.IDLE,
      null,
      'Resumed by operator.',
      existing?.budgetUsd ?? null,
    );
  }

  status(projectId: string, epicId?: string): OrchestratorState[] {
    if (epicId) {
      const state = this.stateRepo.find(projectId, epicId);
      return state ? [state] : [];
    }
    return this.stateRepo.findByProject(projectId);
  }

  // ── Internals ──────────────────────────────────────────────────────

  private async perform(
    action: Extract<OrchestratorAction, { kind: 'run' | 'advance' }>,
    projectId: string,
    projectPath: string,
    onProgress: () => void,
  ): Promise<string> {
    if (action.kind === 'advance') {
      const result = this.ticketApprove.execute(projectId, projectPath, action.ticketId);
      if (result.status === 'advanced') {
        return `advanced ${result.fromColumn} → ${result.toColumn}`;
      }
      if (result.status === 'already_done') return 'already DONE';
      return `approve failed: ${result.error}`;
    }

    // A single agentic run can exceed 30 minutes. Riding the run's own event
    // stream keeps the lock fresh throughout, so the staleness window can stay
    // short enough to be useful after a crash.
    const result = await this.ticketRun.execute(
      projectId,
      projectPath,
      action.ticketId,
      undefined,
      {
        onEvent: () => onProgress(),
      },
    );
    switch (result.status) {
      case 'success':
        return `run succeeded in ${result.attempts} attempt(s)`;
      case 'escalated':
        return `escalated: ${result.reason}`;
      case 'blocked':
        return `blocked: ${result.blockers.join('; ')}`;
      case 'failed':
        return `failed: ${result.error}`;
    }
  }

  /** True when a RUNNING row has gone quiet long enough to be presumed dead. */
  private isStale(updatedAt: string): boolean {
    const last = Date.parse(updatedAt);
    // An unparseable timestamp is treated as stale: refusing to run forever on
    // a corrupt row is worse than the small risk of overlapping with a live one.
    if (Number.isNaN(last)) return true;
    return Date.now() - last > STALE_AFTER_MS;
  }

  /** Throttled liveness write. `force` bypasses the throttle at action boundaries. */
  private heartbeat(projectId: string, epicId: string, force = false): void {
    const now = Date.now();
    if (!force && now - this.lastHeartbeatMs < HEARTBEAT_INTERVAL_MS) return;
    this.lastHeartbeatMs = now;
    this.stateRepo.touch(projectId, epicId, new Date(now).toISOString());
  }

  /**
   * Sums recorded spend for the epic and every child.
   *
   * Cost is already captured per invocation by TicketRunUseCase, so this is a
   * rollup rather than new accounting.
   */
  private spendFor(projectId: string, epicId: string): number {
    const ticketIds = [epicId, ...this.ticketRepo.findChildren(projectId, epicId).map((t) => t.id)];
    let total = 0;
    for (const ticketId of ticketIds) {
      for (const record of this.costRepo.findByTicket(projectId, ticketId)) {
        total += record.costUsd;
      }
    }
    return total;
  }

  /**
   * Column spec wins over the global setting when it has one.
   *
   * Columns with no spec (BACKLOG, DONE, DOD_GATE) fall back to the global
   * mode — loading a spec for them throws by design.
   */
  private autoAdvance(projectPath: string, column: Column): boolean {
    const globalMode =
      (this.configStore.readConfig() ?? DEFAULT_GLOBAL_CONFIG).advanceMode === 'auto';

    if (column === Column.BACKLOG || column === Column.DONE || column === Column.DOD_GATE) {
      return globalMode;
    }
    if (!isValidColumn(column)) return globalMode;

    try {
      return this.columnSpecLoader.load(column, projectPath).advanceMode === 'auto';
    } catch {
      return globalMode;
    }
  }

  private writeState(
    projectId: string,
    epicId: string,
    status: OrchestratorStatus,
    haltReason: OrchestratorState['haltReason'],
    message: string | null,
    budgetUsd: number | null,
  ): OrchestratorState {
    const state: OrchestratorState = {
      projectId,
      epicId,
      status,
      haltReason,
      message,
      budgetUsd,
      updatedAt: new Date().toISOString(),
    };
    this.stateRepo.upsert(state);
    return state;
  }

  private haltWith(
    projectId: string,
    epicId: string,
    reason: HaltReason,
    message: string,
    steps: OrchestratorStep[],
    spentUsd: number,
    status: OrchestratorStatus,
  ): OrchestratorRunResult {
    this.writeState(
      projectId,
      epicId,
      status,
      reason,
      message,
      this.stateRepo.find(projectId, epicId)?.budgetUsd ?? null,
    );
    return { epicId, haltReason: reason, message, steps, spentUsd };
  }
}
