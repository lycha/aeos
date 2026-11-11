// Use case — Orchestrator (drives an epic and its tasks autonomously)
//
// The control flow here is deliberately dumb: ask the policy what to do next,
// do exactly that one thing, then ask again. All judgment lives in the agents
// this schedules; none lives in the scheduler.
//
// Every loop exit is a HaltReason, including the happy ones. "Why did this
// stop?" is always answerable without reading logs.

import type { Column } from '../domain/model/column.js';
import { OrchestratorStatus, type OrchestratorState } from '../domain/model/orchestrator-state.js';
import { TicketKind } from '../domain/model/ticket-kind.js';
import type { Ticket } from '../domain/model/ticket.js';
import {
  decideNextAction,
  HaltReason,
  type OrchestratorAction,
} from '../domain/services/orchestrator-policy.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { CostRepository } from '../domain/ports/driven/cost-repository.port.js';
import type { ConfigStore } from '../domain/ports/driven/config-store.port.js';
import type { ColumnSpecLoader } from '../domain/ports/driven/column-spec-loader.port.js';
import type { PipelineLoader } from '../domain/ports/driven/pipeline-loader.port.js';
import type { AgentSpecLoader } from '../domain/ports/driven/agent-spec-loader.port.js';
import { reportsCost } from '../domain/services/executor-capabilities.js';
import type { ExecutorConfigResolver } from './services/executor-config-resolver.js';
import type { OrchestratorStateRepository } from '../domain/ports/driven/orchestrator-state-repository.port.js';
import type { TicketRunPort } from '../domain/ports/driving/ticket-run.port.js';
import { columnSpecOf, roleOf } from './services/column-roles.js';
import type { TicketRunObserver } from '../domain/model/ticket-run-event.js';
import type { TicketApprovePort } from '../domain/ports/driving/ticket-approve.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
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

function sumKnown(costs: readonly (number | null)[]): number {
  return costs.reduce<number>((total, cost) => total + (cost ?? 0), 0);
}

export class OrchestratorUseCase implements OrchestratorPort {
  private lastHeartbeatMs = 0;
  private interruptRequested = false;

  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly costRepo: CostRepository,
    private readonly stateRepo: OrchestratorStateRepository,
    private readonly columnSpecLoader: ColumnSpecLoader,
    private readonly configStore: ConfigStore,
    private readonly ticketRun: TicketRunPort,
    private readonly ticketApprove: TicketApprovePort,
    private readonly gitGateway: GitGateway,
    private readonly agentSpecLoader: AgentSpecLoader,
    private readonly executorConfigResolver: ExecutorConfigResolver,
    private readonly pipelineLoader: PipelineLoader,
  ) {}

  /**
   * Gives the epic its own feature branch and marks its base commit, so task
   * commits accumulate in isolation and the whole-feature diff (base..HEAD) can
   * be computed at INTEGRATION_REVIEW. No-op when the project path is not a git
   * repo, or when isolation is disabled via AEOS_GIT_ISOLATION=none.
   */
  private setUpGitIsolation(projectPath: string, epicId: string): void {
    if (process.env.AEOS_GIT_ISOLATION === 'none') return;
    if (!this.gitGateway.isRepo(projectPath)) return;
    this.gitGateway.ensureOnBranch(projectPath, `aeos/${epicId}`);
    this.gitGateway.tagHere(projectPath, `aeos-base/${epicId}`);
  }

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

    this.interruptRequested = false;

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
    if (budgetUsd !== null) this.assertExecutorsReportCost(projectId, projectPath, epic);
    const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
    const steps: OrchestratorStep[] = [];

    this.writeState(projectId, epicId, OrchestratorStatus.RUNNING, null, null, budgetUsd);
    let settled = false;

    // Isolate this epic's work on its own branch before any task runs.
    this.setUpGitIsolation(projectPath, epicId);

    try {
      for (let step = 0; step < maxSteps; step += 1) {
        // An interrupt that arrived between actions stops before scheduling the
        // next one.
        if (this.interruptRequested) {
          settled = true;
          return this.interruptedHalt(projectId, epicId, steps);
        }

        // Re-read every tick: the previous action changed the world, and a
        // stale view is how a scheduler double-runs a ticket.
        const current = this.ticketRepo.findById(projectId, epicId);
        if (!current) {
          throw new Error(`Ticket ${epicId} disappeared mid-run`);
        }
        const children = this.ticketRepo.findChildren(projectId, epicId);
        const costs = this.costsFor(projectId, epicId);
        const spentUsd = sumKnown(costs);

        const action = decideNextAction({
          epic: current,
          children,
          spentUsd,
          costUnknown: costs.includes(null),
          budgetUsd,
          autoAdvance: (column) => this.autoAdvance(projectPath, column),
          roleOf: roleOf(this.columnSpecLoader, projectPath),
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

        // Capture the column before performing — an 'advance' moves the ticket
        // on, so reading it afterwards would report the destination, not the
        // stage this step drove.
        const actingColumn = this.ticketRepo.findById(projectId, action.ticketId)?.column ?? '—';

        const { outcome, approveError } = await this.perform(
          action,
          projectId,
          projectPath,
          () => this.heartbeat(projectId, epicId),
          observer?.ticketRunObserver,
        );
        const recorded: OrchestratorStep = {
          action: action.kind,
          ticketId: action.ticketId,
          column: actingColumn,
          outcome,
        };
        steps.push(recorded);
        observer?.onStep?.(recorded);
        this.heartbeat(projectId, epicId, true);

        // An approval that fails will fail again on the next tick (a pull
        // request that cannot be opened, say), so it is the operator's turn.
        if (approveError !== undefined) {
          settled = true;
          return this.haltWith(
            projectId,
            epicId,
            HaltReason.NEEDS_HUMAN,
            approveError,
            steps,
            this.spendFor(projectId, epicId),
            OrchestratorStatus.IDLE,
          );
        }

        // The action just finished — if the operator interrupted during it, the
        // in-flight ticket was already stopped; halt now rather than scheduling
        // more work.
        if (this.interruptRequested) {
          settled = true;
          return this.interruptedHalt(projectId, epicId, steps);
        }
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

  interrupt(): void {
    // Stop scheduling, and kill whatever ticket run is in flight. interrupt() on
    // the ticket-run use case is a no-op when nothing is running.
    this.interruptRequested = true;
    void this.ticketRun.interrupt();
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

  clearBudget(projectId: string, epicId: string): OrchestratorState {
    const existing = this.stateRepo.find(projectId, epicId);
    if (!existing) {
      throw new Error(`Epic ${epicId} has no orchestrator state, so there is no budget to clear.`);
    }
    return this.writeState(
      projectId,
      epicId,
      existing.status,
      existing.haltReason,
      'Budget cleared by operator.',
      null,
    );
  }

  status(projectId: string, epicId?: string): OrchestratorState[] {
    if (epicId) {
      const state = this.stateRepo.find(projectId, epicId);
      return state ? [state] : [];
    }
    return this.stateRepo.findByProject(projectId);
  }

  spentUsd(projectId: string, epicId: string): number {
    return this.spendFor(projectId, epicId);
  }

  // ── Internals ──────────────────────────────────────────────────────

  private async perform(
    action: Extract<OrchestratorAction, { kind: 'run' | 'advance' }>,
    projectId: string,
    projectPath: string,
    onProgress: () => void,
    ticketRunObserver: TicketRunObserver | undefined,
  ): Promise<{ outcome: string; approveError?: string }> {
    if (action.kind === 'advance') {
      const result = this.ticketApprove.execute(projectId, projectPath, action.ticketId, {
        byEngine: true,
      });
      if (result.status === 'advanced') {
        return { outcome: `advanced ${result.fromColumn} → ${result.toColumn}` };
      }
      if (result.status === 'already_done') return { outcome: 'already DONE' };
      return { outcome: `approve failed: ${result.error}`, approveError: result.error };
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
        // Heartbeat the lock, then forward to the caller's live view.
        onEvent: (event) => {
          onProgress();
          ticketRunObserver?.onEvent?.(event);
        },
      },
    );
    switch (result.status) {
      case 'success':
        return { outcome: `run succeeded in ${result.attempts} attempt(s)` };
      case 'escalated':
        return { outcome: `escalated: ${result.reason}` };
      case 'blocked':
        return { outcome: `blocked: ${result.blockers.join('; ')}` };
      case 'failed':
        return { outcome: `failed: ${result.error}` };
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
   * A budget is only a ceiling if every run still to come reports what it
   * cost. Refuses when any agent of a column still ahead resolves to an
   * executor that cannot: the epic's current column and later ones, and each
   * task column unless the epic is beyond decomposition and every child is
   * past it.
   */
  private assertExecutorsReportCost(projectId: string, projectPath: string, epic: Ticket): void {
    const epicId = epic.id;
    const { EPIC: epicOrder, TASK: taskOrder } = this.pipelineLoader.load(projectPath);
    const epicAt = epicOrder.indexOf(epic.column);
    const role = roleOf(this.columnSpecLoader, projectPath);
    const canDecompose =
      epicAt <= epicOrder.findIndex((column) => role(column) === 'decomposition');
    const children = this.ticketRepo.findChildren(projectId, epicId);
    const ahead = [
      ...epicOrder.slice(Math.max(epicAt, 0)),
      ...taskOrder.filter(
        (column, at) =>
          canDecompose || children.some((child) => taskOrder.indexOf(child.column) <= at),
      ),
    ];
    for (const column of ahead) {
      const spec = columnSpecOf(this.columnSpecLoader, projectPath, column);
      // The final gate is a person's: nothing the orchestrator runs spends there.
      if (!spec || spec.role === 'final-gate') continue;
      for (const agentFile of [spec.workerAgentFile, spec.reviewerAgentFile]) {
        const agent = this.agentSpecLoader.load(agentFile, projectPath);
        const { executorType } = this.executorConfigResolver.resolveExecutorConfig(
          projectPath,
          agent,
        );
        if (!reportsCost(executorType)) {
          throw new Error(
            `Cannot run ${epicId} with a budget: agent '${agent.name}' in ${column} resolves to executor '${executorType}', which does not report cost. Use an executor that does, or run without a budget.`,
          );
        }
      }
    }
  }

  /**
   * The recorded cost of every run for the epic and its children; null where
   * the executor reported none.
   *
   * Cost is already captured per invocation by TicketRunUseCase, so this is a
   * rollup rather than new accounting.
   */
  private costsFor(projectId: string, epicId: string): (number | null)[] {
    const ticketIds = [epicId, ...this.ticketRepo.findChildren(projectId, epicId).map((t) => t.id)];
    return ticketIds.flatMap((ticketId) =>
      this.costRepo.findByTicket(projectId, ticketId).map((record) => record.costUsd),
    );
  }

  /** Known spend only: an unknown cost is not counted as zero, it halts a budgeted epic. */
  private spendFor(projectId: string, epicId: string): number {
    return sumKnown(this.costsFor(projectId, epicId));
  }

  /**
   * Column spec wins over the global setting when it has one.
   *
   * BACKLOG and DONE have no spec and fall back to the global mode, and so
   * does a final gate, which the policy never advances anyway.
   */
  private autoAdvance(projectPath: string, column: Column): boolean {
    const globalMode =
      (this.configStore.readConfig() ?? DEFAULT_GLOBAL_CONFIG).advanceMode === 'auto';

    try {
      const spec = columnSpecOf(this.columnSpecLoader, projectPath, column);
      if (!spec || spec.role === 'final-gate') return globalMode;
      return spec.advanceMode === 'auto';
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

  private interruptedHalt(
    projectId: string,
    epicId: string,
    steps: OrchestratorStep[],
  ): OrchestratorRunResult {
    return this.haltWith(
      projectId,
      epicId,
      HaltReason.INTERRUPTED,
      `Interrupted by operator after ${steps.length} action(s). The in-flight ticket was stopped and left INTERRUPTED; re-run the epic to resume.`,
      steps,
      this.spendFor(projectId, epicId),
      OrchestratorStatus.IDLE,
    );
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
