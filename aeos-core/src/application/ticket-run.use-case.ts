// Use case — TicketRun
//
// Orchestration for one column:
//
//   eligibility → context → preflight → [WORKING]
//     ↓
//   ┌─ attempt: worker → validate → checks → commit → reviewer → verdict ─┐
//   │    verdict APPROVED*        → advance                                │
//   │    verdict REJECTED, room   → retry with review feedback ────────────┘
//   │    verdict REJECTED, no room→ escalate
//   │    a failed check counts as REJECTED, and the reviewer is not asked
//     ↓
//   [IN_REVIEW] → [SIGNED_OFF]
//
// Two invariants worth stating because they were both violated before:
//
//   1. The reviewer verdict is read from a parsed trailer, never from the
//      review prose. See `parseVerdict`.
//   2. Escalation is not failure. A run that exhausts its revision budget
//      ends ESCALATED so an operator (or the orchestrator) can tell "needs a
//      human" apart from "something broke".
//
// Git carries artifacts only. Sub-state lives in SQLite; mirroring every
// transition into git buried the artifact commits under state churn.

import { createHash, randomInt } from 'node:crypto';
import * as path from 'node:path';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { Executor } from '../domain/ports/driven/executor.port.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type { ColumnSpecLoader } from '../domain/ports/driven/column-spec-loader.port.js';
import type { AgentSpecLoader } from '../domain/ports/driven/agent-spec-loader.port.js';
import type { RubricLoader } from '../domain/ports/driven/rubric-loader.port.js';
import type { CostRepository } from '../domain/ports/driven/cost-repository.port.js';
import type { ConfigStore } from '../domain/ports/driven/config-store.port.js';
import type { RunRecordStore } from '../domain/ports/driven/run-record-store.port.js';
import type { ProjectRepository } from '../domain/ports/driven/project-repository.port.js';
import { runRecordPaths, type RunRecord } from '../domain/model/run-record.js';
import type { ExecutorResult } from '../domain/model/executor-result.js';
import type { CostRole } from '../domain/model/cost-record.js';
import type { StateMachineService } from '../domain/services/state-machine.js';
import type { ContextAssembler } from './services/context-assembler.js';
import type { PreflightService } from './services/preflight.js';
import type { AgentSpec } from '../domain/model/agent-spec.js';
import type { AssembledContext } from '../domain/model/assembled-context.js';
import type { ColumnSpec } from '../domain/model/column-spec.js';
import type { Ticket } from '../domain/model/ticket.js';
import type { SpecPin } from '../domain/model/spec-pin.js';
import { pendingAmendment, resolveSpecPin } from './services/spec-pin.js';
import type { GateRecordStore } from '../domain/ports/driven/gate-record-store.port.js';
import type {
  TicketRunPort,
  TicketRunResult,
  ExecutorOverrides,
} from '../domain/ports/driving/ticket-run.port.js';
import type { TicketRunObserver, TicketRunPhase } from '../domain/model/ticket-run-event.js';
import type { ExecutorConfigResolver } from './services/executor-config-resolver.js';
import type { ExecutorChunkObserver } from '../domain/model/executor-invocation.js';
import type { ReviewVerdict } from '../domain/model/review-verdict.js';
import type { Escalation } from '../domain/model/escalation.js';
import { EscalationReason } from '../domain/model/escalation.js';
import { buildEscalationDocument, escalationFilename } from './services/escalation-document.js';
import { Column } from '../domain/model/column.js';
import { SubState } from '../domain/model/sub-state.js';
import { TicketKind } from '../domain/model/ticket-kind.js';
import { validateOutput } from '../domain/services/output-validation.js';
import { isValidColumn } from '../domain/model/column.js';
import { parseVerdict } from '../domain/services/verdict-parser.js';
import { findViolations, protectedGlobs } from '../domain/services/path-guard.js';
import {
  checkBlockerTopic,
  decideNextAttempt,
  type LoopConfig,
} from '../domain/services/review-loop-policy.js';
import type { Check, CheckResult } from '../domain/model/check.js';
import type { CheckRegistry } from './checks/check-registry.js';
import { DEFAULT_GLOBAL_CONFIG } from '../shared/config.js';
import { syncTicketDocument } from './services/ticket-document.js';
import { TicketRunEventEmitter } from './services/ticket-run-event-emitter.js';

/** Everything one attempt needs, resolved once before the loop starts. */
interface RunContext {
  readonly projectId: string;
  readonly projectPath: string;
  readonly ticketId: string;
  readonly aeosDir: string;
  readonly column: Column;
  readonly columnSpec: ColumnSpec;
  readonly workerAgentSpec: AgentSpec;
  readonly reviewerAgentSpec: AgentSpec;
  readonly workerExecutor: Executor;
  readonly workerMode: 'artifact' | 'agentic';
  readonly workerExecutorType: string;
  readonly workerModel: string | undefined;
  readonly reviewerExecutorType: string;
  readonly reviewerModel: string | undefined;
  readonly reviewerAgentSpecResolved: AgentSpec;
  readonly baseContext: AssembledContext;
  readonly emitter: TicketRunEventEmitter;
  readonly artifactFilename: string;
  readonly artifactAbsPath: string;
  readonly reviewFilename: string;
  readonly reviewAbsPath: string;
  /** Globs no executor invocation of this run may touch. */
  readonly protectedGlobs: readonly string[];
  /** The ticket's spec pin (its own or its epic's), written into every run record. */
  readonly specPin: SpecPin | null;
}

/** One executor invocation, as much as the call site knows about it. */
interface InvokedRun {
  readonly role: 'preflight' | 'worker' | 'reviewer';
  readonly agent: string;
  readonly executor: string;
  readonly model: string | undefined;
  readonly mode: 'artifact' | 'agentic';
  readonly attempt: number;
  readonly prompt: string;
  readonly result: ExecutorResult;
  readonly startedAt: Date;
  readonly endedAt: Date;
  /** Filename of the artefact the run wrote, when it is kept. */
  readonly output?: string;
  readonly verdict?: RunRecord['verdict'];
  /** Why the run failed although the executor itself succeeded. */
  readonly error?: string;
}

interface WrittenRun {
  readonly record: RunRecord;
  readonly files: string[];
}

/** Appends the link from an artefact to the run that produced it, as its last line. */
function linkToRun(content: string, runId: string): string {
  return `${content.trimEnd()}\n\n<!-- AEOS-RUN: ${runId} -->\n`;
}

type AttemptOutcome =
  | { kind: 'reviewed'; verdict: ReviewVerdict; reviewContent: string }
  | { kind: 'checks-failed'; check: string; output: string }
  | { kind: 'failed'; error: string }
  | { kind: 'interrupted'; stage: TicketRunPhase; message: string }
  | { kind: 'escalated'; escalation: Escalation };

export class TicketRunUseCase implements TicketRunPort {
  private currentExecutor: Executor | null = null;
  private interruptStage: TicketRunPhase | undefined;
  private interruptRequested = false;

  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly stateMachine: StateMachineService,
    private readonly contextAssembler: ContextAssembler,
    private readonly buildPromptFn: (context: AssembledContext, agentSpec: AgentSpec) => string,
    private readonly createExecutor: (agentSpec: AgentSpec) => Executor,
    private readonly artifactStore: ArtifactStore,
    private readonly gitGateway: GitGateway,
    private readonly columnSpecLoader: ColumnSpecLoader,
    private readonly agentSpecLoader: AgentSpecLoader,
    private readonly rubricLoader: RubricLoader,
    private readonly preflight: PreflightService,
    private readonly costRepo: CostRepository,
    private readonly executorConfigResolver: ExecutorConfigResolver,
    private readonly configStore: ConfigStore,
    private readonly runRecordStore: RunRecordStore,
    private readonly checkRegistry: CheckRegistry,
    private readonly projectRepo: ProjectRepository,
    private readonly gateRecordStore: GateRecordStore,
  ) {}

  async execute(
    projectId: string,
    projectPath: string,
    ticketId: string,
    executorOverrides?: ExecutorOverrides,
    observer?: TicketRunObserver,
  ): Promise<TicketRunResult> {
    this.interruptRequested = false;
    this.currentExecutor = null;
    this.interruptStage = undefined;

    try {
      const eligibility = this.checkEligibility(projectId, ticketId);
      if (!eligibility.ok) return eligibility.result;
      let mirroredTicket = eligibility.ticket;

      // Drift guard: an amendment means the pinned spec no longer says what was
      // decided. Nothing runs against it until someone comes forward.
      const specPin = resolveSpecPin(this.ticketRepo, mirroredTicket);
      const amendment = specPin && pendingAmendment(this.gateRecordStore, projectPath, specPin);
      if (amendment) {
        return {
          status: 'failed',
          ticketId,
          error: `The spec ${ticketId} is pinned to was amended from ${amendment.ticket} (${amendment.id}) and has not been repinned. Update spec.md, commit, then run \`aeos ticket repin ${amendment.ticket}\`.`,
        };
      }

      const branchError = this.isolateTask(projectPath, mirroredTicket);
      if (branchError) return { status: 'failed', ticketId, error: branchError };

      const columnSpec = this.columnSpecLoader.load(mirroredTicket.column, projectPath);
      const workerAgentSpec = this.agentSpecLoader.load(columnSpec.workerAgentFile, projectPath);
      const reviewerAgentSpec = this.agentSpecLoader.load(
        columnSpec.reviewerAgentFile,
        projectPath,
      );
      const resolvedWorkerConfig = this.executorConfigResolver.resolveExecutorConfig(
        projectPath,
        workerAgentSpec,
        executorOverrides,
      );

      const column = this.resolveColumn(columnSpec.column);
      if (!column) {
        return { status: 'failed', ticketId, error: `Invalid column value: ${columnSpec.column}` };
      }

      const workerMode = this.resolveWorkerExecutorMode(columnSpec, column);
      if (
        workerMode === 'agentic' &&
        !this.supportsAgenticExecution(resolvedWorkerConfig.executorType)
      ) {
        return {
          status: 'failed',
          ticketId,
          error: `Executor '${resolvedWorkerConfig.executorType}' does not support agentic IMPLEMENTATION runs. Use 'claude-cli', 'auggie-cli', 'opencode-cli', or omit --executor.`,
        };
      }

      const emitter = new TicketRunEventEmitter(projectId, ticketId, columnSpec.column, observer);
      emitter.emit({
        type: 'ticket-run.started',
        phase: 'eligibility',
        payload: {
          executor: resolvedWorkerConfig.executorType,
          model: resolvedWorkerConfig.model,
        },
      });

      const resolvedWorkerAgentSpec: AgentSpec = {
        ...workerAgentSpec,
        executor: {
          ...workerAgentSpec.executor,
          type: resolvedWorkerConfig.executorType,
          model: resolvedWorkerConfig.model,
          timeoutSeconds: resolvedWorkerConfig.timeoutMs / 1000,
        },
      };
      const resolvedReviewerConfig = this.executorConfigResolver.resolveExecutorConfig(
        projectPath,
        reviewerAgentSpec,
        executorOverrides,
      );
      const resolvedReviewerAgentSpec: AgentSpec = {
        ...reviewerAgentSpec,
        executor: {
          ...reviewerAgentSpec.executor,
          type: resolvedReviewerConfig.executorType,
          model: resolvedReviewerConfig.model,
          timeoutSeconds: resolvedReviewerConfig.timeoutMs / 1000,
        },
      };

      const aeosDir = path.join(projectPath, '.aeos');

      this.emitStageEvent(emitter, 'stage.started', 'context', 'Assembling ticket context');
      let baseContext: AssembledContext;
      try {
        baseContext = await this.contextAssembler.assemble(
          ticketId,
          projectPath,
          columnSpec.column,
          specPin,
        );
      } catch (err) {
        // Nothing has run yet and the ticket is still READY: a pinned spec that
        // cannot be read fails the run here instead of crashing the caller.
        const message = err instanceof Error ? err.message : String(err);
        emitter.emit({ type: 'ticket-run.failed', phase: 'complete', payload: { message } });
        return { status: 'failed', ticketId, error: message };
      }
      this.emitStageEvent(emitter, 'stage.completed', 'context', 'Context assembled');

      const workerExecutor = this.createExecutor(resolvedWorkerAgentSpec);
      const artifactFilename = `${ticketId}-${columnSpec.outputArtifact}`;
      const reviewFilename = `${ticketId}-${columnSpec.outputArtifact.replace('.md', '-review.md')}`;

      const ctx: RunContext = {
        projectId,
        projectPath,
        ticketId,
        aeosDir,
        column,
        columnSpec,
        workerAgentSpec,
        reviewerAgentSpec,
        workerExecutor,
        workerMode,
        workerExecutorType: resolvedWorkerConfig.executorType,
        workerModel: resolvedWorkerConfig.model,
        reviewerExecutorType: resolvedReviewerConfig.executorType,
        reviewerModel: resolvedReviewerConfig.model,
        reviewerAgentSpecResolved: resolvedReviewerAgentSpec,
        baseContext,
        emitter,
        artifactFilename,
        artifactAbsPath: path.join(aeosDir, 'tickets', ticketId, artifactFilename),
        reviewFilename,
        reviewAbsPath: path.join(aeosDir, 'tickets', ticketId, reviewFilename),
        protectedGlobs: protectedGlobs(
          this.projectRepo.readExecutorConfig(projectPath)?.protectedPaths,
        ),
        specPin,
      };

      // ── Preflight ────────────────────────────────────────────────
      const preflightOutcome = await this.runPreflight(ctx);
      if (preflightOutcome.kind === 'failed') {
        emitter.emit({
          type: 'ticket-run.failed',
          phase: 'complete',
          payload: { message: preflightOutcome.error },
        });
        return { status: 'failed', ticketId, error: preflightOutcome.error };
      }
      if (preflightOutcome.kind === 'interrupted') {
        return this.finishInterruptedRun(
          emitter,
          projectId,
          ticketId,
          projectPath,
          mirroredTicket,
          preflightOutcome.stage,
          preflightOutcome.message,
        );
      }
      if (preflightOutcome.kind === 'escalated') {
        // Preflight already set BLOCKED, and `aeos ticket answer` keys on it.
        // Overwriting with ESCALATED would make the escalation message ("answer
        // them with ...") point at a command that then refuses.
        return this.finishEscalatedRun(
          ctx,
          mirroredTicket,
          preflightOutcome.escalation,
          0,
          SubState.BLOCKED,
        );
      }

      // ── WORKING ──────────────────────────────────────────────────
      const workingTransition = this.transitionSubState(
        projectId,
        ticketId,
        projectPath,
        mirroredTicket,
        SubState.WORKING,
      );
      if (!workingTransition.ok) {
        emitter.emit({
          type: 'ticket-run.failed',
          phase: 'complete',
          payload: { message: workingTransition.error },
        });
        return { status: 'failed', ticketId, error: workingTransition.error };
      }
      mirroredTicket = workingTransition.ticket;
      emitter.emit({
        type: 'sub-state.changed',
        phase: 'state',
        payload: { from: workingTransition.previous, to: SubState.WORKING },
      });

      // ── Revision loop ────────────────────────────────────────────
      const loopConfig = this.resolveLoopConfig(columnSpec);
      const blockerHistory: string[][] = [];
      let feedback: { name: string; content: string } | undefined;
      let attempt = 1;

      for (;;) {
        emitter.emit({
          type: 'run.attempt.started',
          phase: 'worker',
          payload: {
            attempt,
            maxAttempts: loopConfig.enabled ? Math.max(1, loopConfig.maxIterations) : 1,
            carryingFeedback: feedback !== undefined,
          },
        });

        const outcome = await this.runAttempt(ctx, attempt, feedback);

        if (outcome.kind === 'interrupted') {
          return this.finishInterruptedRun(
            emitter,
            projectId,
            ticketId,
            projectPath,
            mirroredTicket,
            outcome.stage,
            outcome.message,
          );
        }

        if (outcome.kind === 'failed') {
          const failed = this.transitionSubState(
            projectId,
            ticketId,
            projectPath,
            mirroredTicket,
            SubState.FAILED,
          );
          if (failed.ok) {
            mirroredTicket = failed.ticket;
            emitter.emit({
              type: 'sub-state.changed',
              phase: 'state',
              payload: { from: failed.previous, to: SubState.FAILED },
            });
          }
          const message = failed.ok ? outcome.error : failed.error;
          emitter.emit({
            type: 'ticket-run.failed',
            phase: 'complete',
            payload: { message },
          });
          return { status: 'failed', ticketId, error: message };
        }

        if (outcome.kind === 'escalated') {
          return this.finishEscalatedRun(ctx, mirroredTicket, outcome.escalation, attempt);
        }

        const loopState = { attempt, config: loopConfig, previousBlockerTopics: blockerHistory };
        const decision =
          outcome.kind === 'checks-failed'
            ? decideNextAttempt({ ...loopState, failedCheck: outcome.check })
            : decideNextAttempt({
                ...loopState,
                verdict: outcome.verdict,
                reviewPath: ctx.reviewAbsPath,
              });

        if (decision.action === 'advance') {
          this.emitStageEvent(emitter, 'stage.completed', 'reviewer', decision.reason, {
            role: 'reviewer',
            executor: ctx.reviewerExecutorType,
            model: ctx.reviewerModel,
            mode: 'artifact',
          });
          break;
        }

        // A failed check has no review to point at; its stage.failed event
        // already said why.
        if (outcome.kind === 'reviewed') {
          emitter.emit({
            type: 'review.rejected',
            phase: 'reviewer',
            payload: {
              reviewPath: ctx.reviewAbsPath,
              reason:
                decision.action === 'escalate' ? decision.escalation.message : decision.reason,
            },
          });
        }

        if (decision.action === 'escalate') {
          return this.finishEscalatedRun(ctx, mirroredTicket, decision.escalation, attempt);
        }

        // Retry: carry the review (or the failed check's output) forward so the
        // worker revises rather than regenerating from scratch, and record
        // blockers for stall detection.
        if (outcome.kind === 'reviewed') {
          blockerHistory.push([...outcome.verdict.blockerTopics]);
          feedback = { name: 'previous-review.md', content: outcome.reviewContent };
        } else {
          blockerHistory.push([checkBlockerTopic(outcome.check)]);
          feedback = { name: 'previous-checks.md', content: outcome.output };
        }
        attempt = decision.nextAttempt;
      }

      // ── IN_REVIEW → SIGNED_OFF ───────────────────────────────────
      const inReview = this.transitionSubState(
        projectId,
        ticketId,
        projectPath,
        mirroredTicket,
        SubState.IN_REVIEW,
      );
      if (!inReview.ok) {
        emitter.emit({
          type: 'ticket-run.failed',
          phase: 'complete',
          payload: { message: inReview.error },
        });
        return { status: 'failed', ticketId, error: inReview.error };
      }
      mirroredTicket = inReview.ticket;
      emitter.emit({
        type: 'sub-state.changed',
        phase: 'state',
        payload: { from: inReview.previous, to: SubState.IN_REVIEW },
      });

      this.emitStageEvent(emitter, 'stage.started', 'sign-off', 'Signing off ticket');
      const signedOff = this.transitionSubState(
        projectId,
        ticketId,
        projectPath,
        mirroredTicket,
        SubState.SIGNED_OFF,
      );
      if (!signedOff.ok) {
        emitter.emit({
          type: 'ticket-run.failed',
          phase: 'complete',
          payload: { message: signedOff.error },
        });
        return { status: 'failed', ticketId, error: signedOff.error };
      }
      emitter.emit({
        type: 'sub-state.changed',
        phase: 'state',
        payload: { from: signedOff.previous, to: SubState.SIGNED_OFF },
      });
      this.emitStageEvent(emitter, 'stage.completed', 'sign-off', 'Ticket signed off');
      emitter.emit({
        type: 'ticket-run.completed',
        phase: 'complete',
        payload: { artifactPath: ctx.artifactAbsPath, reviewPath: ctx.reviewAbsPath },
      });

      return {
        status: 'success',
        ticketId,
        artifactPath: ctx.artifactAbsPath,
        reviewPath: ctx.reviewAbsPath,
        attempts: attempt,
      };
    } finally {
      this.currentExecutor = null;
      this.interruptStage = undefined;
      this.interruptRequested = false;
    }
  }

  async interrupt(): Promise<void> {
    this.interruptRequested = true;
    if (this.currentExecutor) {
      await this.currentExecutor.interrupt();
    }
  }

  // ── One worker → validate → review cycle ───────────────────────────

  private async runAttempt(
    ctx: RunContext,
    attempt: number,
    feedback: { name: string; content: string } | undefined,
  ): Promise<AttemptOutcome> {
    const { emitter, ticketId, projectPath, projectId, aeosDir, columnSpec, workerMode, column } =
      ctx;

    // ── Worker ───────────────────────────────────────────────────
    // On a retry the context is re-assembled rather than reusing the one taken
    // before the run: the worker is being asked to revise an artifact, and the
    // pre-run snapshot does not contain it. The prior review (or the failed
    // check's output) is then attached under an unambiguous name, and the raw
    // review file dropped so a review appears once.
    let workerContext = ctx.baseContext;
    if (feedback) {
      const fresh = await this.contextAssembler.assemble(
        ticketId,
        projectPath,
        columnSpec.column,
        ctx.specPin,
      );
      workerContext = this.withExtraArtifact(
        {
          ...fresh,
          priorArtifacts: fresh.priorArtifacts.filter(
            (artifact) =>
              feedback.name !== 'previous-review.md' || artifact.name !== ctx.reviewFilename,
          ),
        },
        feedback.name,
        feedback.content,
      );
    }
    const prompt = this.buildPromptFn(workerContext, ctx.workerAgentSpec);

    // Baseline the repo before an agentic worker touches it, on the first
    // attempt only. Whatever is already uncommitted — a previous task's work,
    // or unrelated local edits — becomes its own commit, so `git diff HEAD`
    // afterwards contains this task's changes and nothing else. Without this,
    // CODE_REVIEW reviews the accumulated tree and rejects files the ticket
    // never claimed ("orphan unacknowledged file"). Retries skip it, or the
    // rejected attempt's own work would be baselined away mid-loop.
    if (workerMode === 'agentic' && columnSpec.requiresRepoDiff !== false && attempt === 1) {
      this.gitGateway.commitAll(
        ctx.projectPath,
        `[${ctx.ticketId}][BASELINE] pre-existing changes before ${ctx.column}`,
      );
    }

    const attemptLabel = attempt > 1 ? ` (attempt ${attempt})` : '';
    this.emitStageEvent(
      emitter,
      'stage.started',
      'worker',
      `Running worker executor${attemptLabel}`,
      {
        role: 'worker',
        agent: ctx.workerAgentSpec.name,
        executor: ctx.workerExecutorType,
        model: ctx.workerModel,
        mode: workerMode,
      },
    );

    const workerRun = {
      role: 'worker',
      agent: ctx.workerAgentSpec.name,
      executor: ctx.workerExecutorType,
      model: ctx.workerModel,
      mode: workerMode,
      attempt,
      prompt,
      startedAt: new Date(),
    } as const;

    // Taken after the baseline commit, or baselined files would look untouched.
    const beforeWorker = this.changedPaths(ctx);
    let executorResult: ExecutorResult;
    try {
      this.currentExecutor = ctx.workerExecutor;
      this.interruptStage = 'worker';
      executorResult = await ctx.workerExecutor.run({
        prompt,
        outputPath: ctx.artifactAbsPath,
        ticketId,
        column,
        mode: workerMode,
        workingDirectory: workerMode === 'agentic' ? projectPath : undefined,
        onChunk: this.createChunkObserver(emitter, 'worker'),
      });
    } catch (err) {
      const message = [
        err instanceof Error ? err.message : String(err),
        this.restoreProtected(ctx, beforeWorker),
      ]
        .filter(Boolean)
        .join('\n');
      this.emitStageEvent(emitter, 'stage.failed', 'worker', message, {
        role: 'worker',
        executor: ctx.workerExecutorType,
        model: ctx.workerModel,
        mode: workerMode,
      });
      this.recordRunAlone(ctx, {
        ...workerRun,
        result: { ok: false, reason: message },
        endedAt: new Date(),
      });
      if (this.isInterruptedReason(message)) {
        return { kind: 'interrupted', stage: 'worker', message };
      }
      return { kind: 'failed', error: this.formatExecutorFailure('worker', column, message) };
    } finally {
      this.currentExecutor = null;
      this.interruptStage = undefined;
    }
    const violation = this.restoreProtected(ctx, beforeWorker);
    const run: InvokedRun = { ...workerRun, result: executorResult, endedAt: new Date() };

    this.recordCost(
      projectId,
      ticketId,
      column,
      ctx.workerAgentSpec.name,
      ctx.workerExecutorType,
      ctx.workerModel,
      executorResult,
      'worker',
    );
    this.emitCostEvent(emitter, 'worker', executorResult);

    // FAILED, not ESCALATED: the agent broke a rule.
    if (violation) {
      this.emitStageEvent(emitter, 'stage.failed', 'worker', violation, {
        role: 'worker',
        executor: ctx.workerExecutorType,
        model: ctx.workerModel,
        mode: workerMode,
      });
      this.artifactStore.removeArtifact(projectPath, ticketId, ctx.artifactFilename);
      this.recordRunAlone(ctx, { ...run, error: violation });
      return { kind: 'failed', error: violation };
    }

    if (!executorResult.ok) {
      this.emitStageEvent(emitter, 'stage.failed', 'worker', executorResult.reason, {
        role: 'worker',
        executor: ctx.workerExecutorType,
        model: ctx.workerModel,
        mode: workerMode,
      });
      this.artifactStore.removeArtifact(projectPath, ticketId, ctx.artifactFilename);
      this.recordRunAlone(ctx, run);
      if (this.isInterruptedReason(executorResult.reason)) {
        return { kind: 'interrupted', stage: 'worker', message: executorResult.reason };
      }
      return {
        kind: 'failed',
        error: this.formatExecutorFailure('worker', column, executorResult.reason),
      };
    }

    this.emitStageEvent(emitter, 'stage.completed', 'worker', 'Worker completed', {
      role: 'worker',
      executor: ctx.workerExecutorType,
      model: ctx.workerModel,
      mode: workerMode,
    });

    // ── Validation ───────────────────────────────────────────────
    const content = executorResult.content ?? '';
    this.emitStageEvent(emitter, 'stage.started', 'validation', 'Validating worker output');

    // An agentic run must change the repo — unless the column opts out, because
    // its work is not a repo edit (TASK_BREAKDOWN creates tickets). Undefined
    // means true, so IMPLEMENTATION keeps the guarantee without stating it.
    if (workerMode === 'agentic' && columnSpec.requiresRepoDiff !== false) {
      // Stage first: `git diff HEAD` does not show untracked files, so a task
      // that only adds files (a migration, a new module) would read as "no
      // changes" and fail this guarantee. Staging also makes the new files
      // tracked, so CODE_REVIEW and QA see them as part of the change set
      // instead of flagging them as untracked.
      this.gitGateway.stageAll(projectPath);
      const repoDiff = this.gitGateway.diff(projectPath).trim();
      if (repoDiff.length === 0) {
        const error = 'Agentic implementation produced no repository changes';
        this.emitStageEvent(emitter, 'stage.failed', 'validation', error);
        this.artifactStore.removeArtifact(projectPath, ticketId, ctx.artifactFilename);
        this.recordRunAlone(ctx, { ...run, error });
        return { kind: 'failed', error };
      }
    }

    const validation = validateOutput(content, columnSpec);
    if (!validation.passed) {
      const error = `Output validation failed: ${validation.violations.join('; ')}`;
      this.emitStageEvent(emitter, 'stage.failed', 'validation', error);
      this.artifactStore.removeArtifact(projectPath, ticketId, ctx.artifactFilename);
      this.recordRunAlone(ctx, { ...run, error });
      return { kind: 'failed', error };
    }

    this.emitStageEvent(emitter, 'stage.completed', 'validation', 'Validation passed');

    // ── Checks ───────────────────────────────────────────────────
    // Before the commit and the reviewer: a red build costs no model call.
    const checks = columnSpec.runChecks ? this.checkRegistry.checksFor(projectPath) : [];
    let checksFiles: string[] = [];
    if (checks.length > 0) {
      const stage = await this.runChecks(ctx, attempt, checks);
      if (!stage.passed) {
        this.recordRunAlone(ctx, run);
        return { kind: 'checks-failed', check: stage.check, output: stage.output };
      }
      checksFiles = stage.files;
    }

    // ── Commit the artifact ──────────────────────────────────────
    const revision = attempt > 1 ? `v${attempt}` : 'v1';
    const workerCommitMessage = `[${ticketId}][${columnSpec.outputArtifact}][${revision}][${ctx.workerAgentSpec.name}][${attempt > 1 ? 'revise' : 'create'}]`;
    const written = this.writeRunRecord(ctx, { ...run, output: ctx.artifactFilename });
    this.artifactStore.writeArtifact(
      projectPath,
      ticketId,
      ctx.artifactFilename,
      linkToRun(content, written.record.run_id),
    );
    emitter.emit({
      type: 'artifact.written',
      phase: 'artifact',
      payload: { role: 'worker', path: ctx.artifactAbsPath },
    });
    this.gitGateway.commitFiles(
      aeosDir,
      [ctx.artifactAbsPath, ...written.files, ...checksFiles],
      workerCommitMessage,
    );
    emitter.emit({
      type: 'artifact.committed',
      phase: 'artifact',
      payload: {
        role: 'worker',
        path: ctx.artifactAbsPath,
        commitMessage: workerCommitMessage,
      },
    });

    // ── Reviewer ─────────────────────────────────────────────────
    return this.runReview(ctx, attempt, revision);
  }

  /**
   * Runs the checks in order and stops at the first failure. Knows a check
   * only through the `Check` interface: no commands, no exit codes.
   */
  private async runChecks(
    ctx: RunContext,
    attempt: number,
    checks: readonly Check[],
  ): Promise<{ passed: true; files: string[] } | { passed: false; check: string; output: string }> {
    const { emitter, ticketId, projectPath } = ctx;
    const checksFilename = `${ticketId}-checks.md`;
    this.emitStageEvent(emitter, 'stage.started', 'checks', `Running ${checks.length} check(s)`);

    const startedAt = new Date();
    const results: CheckResult[] = [];
    for (const check of checks) {
      const checkStartedAt = Date.now();
      let result: CheckResult;
      try {
        result = await check.run({ projectPath });
      } catch (err) {
        result = {
          name: check.name,
          passed: false,
          durationMs: Date.now() - checkStartedAt,
          timedOut: false,
          outputTail: err instanceof Error ? err.message : String(err),
        };
      }
      results.push(result);
      if (!result.passed) break;
    }
    const endedAt = new Date();
    const failed = results.find((result) => !result.passed);
    const describe = (result: CheckResult): string =>
      result.passed ? 'passed' : result.timedOut ? 'timed out' : 'failed';

    const runId = this.newRunId(startedAt);
    const record: RunRecord = {
      schema_version: 0,
      run_id: runId,
      project: ctx.projectId,
      ticket: ticketId,
      column: ctx.column,
      role: 'checks',
      agent: null,
      attempt,
      executor: 'shell',
      model: null,
      mode: null,
      brief: null,
      output: failed ? null : `tickets/${ticketId}/${checksFilename}`,
      transcript: runRecordPaths(ticketId, runId).transcript,
      verdict: failed ? 'CHECKS_FAILED' : 'CHECKS_PASSED',
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      duration_ms: endedAt.getTime() - startedAt.getTime(),
      exit: !failed ? 'ok' : failed.timedOut ? 'timeout' : 'failed',
      usage: null,
      cost_usd: 0,
      cost_basis: 'none',
      spec_pin: ctx.specPin,
      error: failed ? `Check '${failed.name}' ${describe(failed)}` : null,
    };
    const files = this.runRecordStore.write(projectPath, record, {
      transcript: results
        .map(
          (result) =>
            `## ${result.name}: ${describe(result)} (${result.durationMs}ms)\n\n${result.outputTail}\n`,
        )
        .join('\n'),
    });

    if (failed) {
      const message = `Check '${failed.name}' ${describe(failed)}`;
      this.emitStageEvent(emitter, 'stage.failed', 'checks', message);
      // A table from an earlier, passing attempt would now be a false claim.
      this.artifactStore.removeArtifact(projectPath, ticketId, checksFilename);
      this.gitGateway.commitFiles(
        ctx.aeosDir,
        files,
        `[${ticketId}][RUN][${runId}][checks][${record.exit}]`,
      );
      return {
        passed: false,
        check: failed.name,
        output: `# ${message}\n\nFix this before anything else. The reviewer was not asked.\n\n\`\`\`\n${failed.outputTail}\n\`\`\`\n`,
      };
    }

    // Written into the ticket directory, so the reviewer's re-assembled
    // context carries it like any other artefact.
    const table = [
      '# Checks',
      '',
      '| Check | Result | Duration |',
      '| --- | --- | --- |',
      ...results.map(
        (result) =>
          `| ${result.name} | ${describe(result)} | ${(result.durationMs / 1000).toFixed(1)}s |`,
      ),
    ].join('\n');
    this.artifactStore.writeArtifact(
      projectPath,
      ticketId,
      checksFilename,
      linkToRun(table, runId),
    );
    this.emitStageEvent(emitter, 'stage.completed', 'checks', 'Checks passed');
    return {
      passed: true,
      files: [path.join(ctx.aeosDir, 'tickets', ticketId, checksFilename), ...files],
    };
  }

  private async runReview(
    ctx: RunContext,
    attempt: number,
    revision: string,
  ): Promise<AttemptOutcome> {
    const { emitter, ticketId, projectPath, projectId, aeosDir, column } = ctx;

    const rubricContents: string[] = [];
    for (const rubricPath of ctx.columnSpec.reviewerRubrics) {
      const rubricContent = await this.rubricLoader.load(rubricPath, projectPath);
      if (rubricContent !== null) {
        rubricContents.push(rubricContent);
      }
    }

    // Re-assembled so the reviewer sees the artifact this attempt just wrote.
    const reviewContext = await this.contextAssembler.assemble(
      ticketId,
      projectPath,
      ctx.columnSpec.column,
      ctx.specPin,
    );
    const enrichedContext =
      rubricContents.length > 0
        ? this.withExtraArtifact(
            reviewContext,
            'reviewer-rubrics.md',
            rubricContents.join('\n\n---\n\n'),
          )
        : reviewContext;

    const reviewerPrompt = this.buildPromptFn(enrichedContext, ctx.reviewerAgentSpec);
    const reviewerExecutor = this.createExecutor(ctx.reviewerAgentSpecResolved);

    this.emitStageEvent(emitter, 'stage.started', 'reviewer', 'Running reviewer executor', {
      role: 'reviewer',
      agent: ctx.reviewerAgentSpec.name,
      executor: ctx.reviewerExecutorType,
      model: ctx.reviewerModel,
      mode: 'artifact',
    });

    const reviewerRun = {
      role: 'reviewer',
      agent: ctx.reviewerAgentSpec.name,
      executor: ctx.reviewerExecutorType,
      model: ctx.reviewerModel,
      mode: 'artifact',
      attempt,
      prompt: reviewerPrompt,
      startedAt: new Date(),
    } as const;

    const beforeReviewer = this.changedPaths(ctx);
    let violation: string | undefined;
    let reviewResult: ExecutorResult;
    try {
      this.currentExecutor = reviewerExecutor;
      this.interruptStage = 'reviewer';
      reviewResult = await reviewerExecutor.run({
        prompt: reviewerPrompt,
        outputPath: ctx.reviewAbsPath,
        ticketId,
        column,
        mode: 'artifact',
        onChunk: this.createChunkObserver(emitter, 'reviewer'),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emitStageEvent(emitter, 'stage.failed', 'reviewer', message, {
        role: 'reviewer',
        executor: ctx.reviewerExecutorType,
        model: ctx.reviewerModel,
        mode: 'artifact',
      });
      reviewResult = { ok: false, reason: message };
      if (this.isInterruptedReason(message)) {
        this.recordRunAlone(ctx, { ...reviewerRun, result: reviewResult, endedAt: new Date() });
        return { kind: 'interrupted', stage: 'reviewer', message };
      }
    } finally {
      this.currentExecutor = null;
      this.interruptStage = undefined;
      violation = this.restoreProtected(ctx, beforeReviewer);
    }
    const run: InvokedRun = { ...reviewerRun, result: reviewResult, endedAt: new Date() };

    this.recordCost(
      projectId,
      ticketId,
      column,
      ctx.reviewerAgentSpec.name,
      ctx.reviewerExecutorType,
      ctx.reviewerModel,
      reviewResult,
      'reviewer',
    );
    this.emitCostEvent(emitter, 'reviewer', reviewResult);

    // A failure, not a missing verdict: nothing this reviewer wrote is kept.
    if (violation) {
      this.emitStageEvent(emitter, 'stage.failed', 'reviewer', violation, {
        role: 'reviewer',
        executor: ctx.reviewerExecutorType,
        model: ctx.reviewerModel,
        mode: 'artifact',
      });
      this.artifactStore.removeArtifact(projectPath, ticketId, ctx.reviewFilename);
      this.recordRunAlone(ctx, { ...run, error: violation });
      return { kind: 'failed', error: violation };
    }

    if (!reviewResult.ok) {
      this.emitStageEvent(emitter, 'stage.failed', 'reviewer', reviewResult.reason, {
        role: 'reviewer',
        executor: ctx.reviewerExecutorType,
        model: ctx.reviewerModel,
        mode: 'artifact',
      });
      this.recordRunAlone(ctx, run);
      if (this.isInterruptedReason(reviewResult.reason)) {
        return { kind: 'interrupted', stage: 'reviewer', message: reviewResult.reason };
      }
      // A reviewer that cannot run leaves us with no verdict. Escalate rather
      // than advancing unreviewed work or looping on an unfixable condition.
      return {
        kind: 'escalated',
        escalation: {
          reason: EscalationReason.UNPARSEABLE_VERDICT,
          message: `Reviewer executor failed, so the artifact is unreviewed: ${reviewResult.reason}`,
          attempt,
          artifactPath: ctx.artifactAbsPath,
        },
      };
    }

    const reviewContent = reviewResult.content ?? '';
    const reviewCommitMessage = `[${ticketId}][REVIEW][${revision}][${ctx.reviewerAgentSpec.name}][create]`;
    const parsed = parseVerdict(reviewContent);
    const written = this.writeRunRecord(ctx, {
      ...run,
      output: ctx.reviewFilename,
      verdict: parsed.ok ? parsed.verdict.verdict : 'UNPARSEABLE',
    });
    this.artifactStore.writeArtifact(
      projectPath,
      ticketId,
      ctx.reviewFilename,
      linkToRun(reviewContent, written.record.run_id),
    );
    emitter.emit({
      type: 'artifact.written',
      phase: 'artifact',
      payload: { role: 'reviewer', path: ctx.reviewAbsPath },
    });
    this.gitGateway.commitFiles(
      aeosDir,
      [ctx.reviewAbsPath, ...written.files],
      reviewCommitMessage,
    );
    emitter.emit({
      type: 'artifact.committed',
      phase: 'artifact',
      payload: {
        role: 'reviewer',
        path: ctx.reviewAbsPath,
        commitMessage: reviewCommitMessage,
      },
    });

    if (!parsed.ok) {
      this.emitStageEvent(emitter, 'stage.failed', 'reviewer', parsed.reason, {
        role: 'reviewer',
        executor: ctx.reviewerExecutorType,
        model: ctx.reviewerModel,
        mode: 'artifact',
      });
      return {
        kind: 'escalated',
        escalation: {
          reason: EscalationReason.UNPARSEABLE_VERDICT,
          message: parsed.reason,
          attempt,
          artifactPath: ctx.reviewAbsPath,
        },
      };
    }

    return { kind: 'reviewed', verdict: parsed.verdict, reviewContent };
  }

  private async runPreflight(
    ctx: RunContext,
  ): Promise<
    | { kind: 'clear' }
    | { kind: 'failed'; error: string }
    | { kind: 'interrupted'; stage: TicketRunPhase; message: string }
    | { kind: 'escalated'; escalation: Escalation }
  > {
    const { emitter, ticketId, projectId, projectPath, aeosDir } = ctx;

    this.emitStageEvent(emitter, 'stage.started', 'preflight', 'Running preflight checks', {
      role: 'preflight',
      agent: ctx.workerAgentSpec.name,
      executor: ctx.workerExecutorType,
      model: ctx.workerModel,
      mode: 'artifact',
    });

    // PreflightService owns the invocation, so the executor is wrapped to see
    // the prompt and the result it would otherwise keep to itself.
    let invoked:
      | Pick<InvokedRun, 'prompt' | 'result' | 'startedAt' | 'endedAt' | 'error'>
      | undefined;
    const recordingExecutor: Executor = {
      run: async (invocation) => {
        const startedAt = new Date();
        const settle = (result: ExecutorResult): ExecutorResult => {
          invoked = { prompt: invocation.prompt, result, startedAt, endedAt: new Date() };
          this.recordCost(
            projectId,
            ticketId,
            ctx.column,
            ctx.workerAgentSpec.name,
            ctx.workerExecutorType,
            ctx.workerModel,
            result,
            'preflight',
          );
          return result;
        };
        const before = this.changedPaths(ctx);
        let result: ExecutorResult;
        try {
          result = settle(await ctx.workerExecutor.run(invocation));
        } catch (err) {
          this.restoreProtected(ctx, before);
          settle({ ok: false, reason: err instanceof Error ? err.message : String(err) });
          throw err;
        }
        const violation = this.restoreProtected(ctx, before);
        if (violation) {
          invoked = invoked && { ...invoked, error: violation };
          throw new Error(violation);
        }
        return result;
      },
      interrupt: () => ctx.workerExecutor.interrupt(),
    };
    const preflightRun = (): InvokedRun | undefined =>
      invoked && {
        role: 'preflight',
        agent: ctx.workerAgentSpec.name,
        executor: ctx.workerExecutorType,
        model: ctx.workerModel,
        mode: 'artifact',
        attempt: 1,
        ...invoked,
      };

    let preflightResult;
    try {
      this.currentExecutor = ctx.workerExecutor;
      this.interruptStage = 'preflight';
      preflightResult = await this.preflight.run(
        ticketId,
        projectId,
        projectPath,
        ctx.baseContext,
        ctx.columnSpec,
        ctx.workerAgentSpec,
        recordingExecutor,
        this.createChunkObserver(emitter, 'preflight'),
      );
    } catch (err) {
      const failedRun = preflightRun();
      if (failedRun) this.recordRunAlone(ctx, failedRun);
      const message = err instanceof Error ? err.message : String(err);
      this.emitStageEvent(emitter, 'stage.failed', 'preflight', message, {
        role: 'preflight',
        executor: ctx.workerExecutorType,
        model: ctx.workerModel,
        mode: 'artifact',
      });
      if (this.isInterruptedReason(message)) {
        return { kind: 'interrupted', stage: 'preflight', message };
      }
      return { kind: 'failed', error: message };
    } finally {
      this.currentExecutor = null;
      this.interruptStage = undefined;
    }

    this.emitStageEvent(
      emitter,
      'stage.completed',
      'preflight',
      preflightResult.blocked ? 'Preflight found blockers' : 'Preflight passed',
      {
        role: 'preflight',
        executor: ctx.workerExecutorType,
        model: ctx.workerModel,
        mode: 'artifact',
      },
    );

    // Undefined when preflight is disabled for the column: nothing was invoked.
    const run = preflightRun();
    if (!preflightResult.blocked) {
      if (run) this.recordRunAlone(ctx, run);
      return { kind: 'clear' };
    }

    const questionsAbsPath = path.join(aeosDir, 'tickets', ticketId, preflightResult.questionsPath);
    const runFiles = run
      ? this.writeRunRecord(ctx, { ...run, output: preflightResult.questionsPath }).files
      : [];
    this.gitGateway.commitFiles(
      aeosDir,
      [questionsAbsPath, ...runFiles],
      `[${ticketId}][QUESTIONS][v1][preflight][blocked]`,
    );

    return {
      kind: 'escalated',
      escalation: {
        reason: EscalationReason.PREFLIGHT_BLOCKERS,
        message: `Preflight raised blocking questions. Answer them with \`aeos ticket answer ${ticketId}\`.`,
        artifactPath: questionsAbsPath,
      },
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private checkEligibility(
    projectId: string,
    ticketId: string,
  ): { ok: true; ticket: Ticket } | { ok: false; result: TicketRunResult } {
    const ticket = this.ticketRepo.findById(projectId, ticketId);
    if (!ticket) {
      return {
        ok: false,
        result: { status: 'failed', ticketId, error: `Ticket ${ticketId} not found` },
      };
    }
    if (ticket.column === Column.BACKLOG) {
      return {
        ok: false,
        result: {
          status: 'failed',
          ticketId,
          error: `Ticket ${ticketId} is in BACKLOG. Run 'aeos ticket approve ${ticketId}' to advance to SPEC_REVIEW first.`,
        },
      };
    }
    if (ticket.column === Column.DONE) {
      return {
        ok: false,
        result: { status: 'failed', ticketId, error: `Ticket ${ticketId} is already DONE.` },
      };
    }
    if (ticket.column === Column.DOD_GATE) {
      return {
        ok: false,
        result: { status: 'failed', ticketId, error: 'DoD gate is human-only' },
      };
    }
    if (ticket.subState === SubState.WORKING) {
      return {
        ok: false,
        result: { status: 'failed', ticketId, error: 'Ticket is already running' },
      };
    }
    if (ticket.subState === SubState.BLOCKED) {
      return {
        ok: false,
        result: {
          status: 'blocked',
          ticketId,
          blockers: ['Ticket is blocked — run `aeos ticket answer` first'],
        },
      };
    }
    return { ok: true, ticket };
  }

  /**
   * Keeps a task's commits off the default branch. A standalone task gets its
   * own `aeos/<taskId>` branch and base tag, as the orchestrator gives an
   * epic; a child task belongs on its epic's branch, which the orchestrator
   * set up, so one found on the default branch is refused. Returns the refusal.
   */
  private isolateTask(projectPath: string, ticket: Ticket): string | null {
    if (
      ticket.kind !== TicketKind.TASK ||
      process.env.AEOS_GIT_ISOLATION === 'none' ||
      !this.gitGateway.isRepo(projectPath)
    ) {
      return null;
    }
    if (ticket.parentId === null) {
      this.gitGateway.ensureOnBranch(projectPath, `aeos/${ticket.id}`);
      this.gitGateway.tagHere(projectPath, `aeos-base/${ticket.id}`);
      return null;
    }
    const defaultBranch = this.gitGateway.defaultBranch(projectPath);
    if (this.gitGateway.currentBranch(projectPath) !== defaultBranch) return null;
    return `Refusing to run task ${ticket.id} on the default branch '${defaultBranch}'. Drive it with \`aeos orchestrator run ${ticket.parentId}\`, or check out \`aeos/${ticket.parentId}\` first.`;
  }

  /**
   * Column setting wins when present; otherwise the global cap applies.
   * `maxIterations` is optional in the column spec precisely so "unset" is
   * distinguishable from an explicit value.
   */
  private resolveLoopConfig(columnSpec: ColumnSpec): LoopConfig {
    const global = this.configStore.readConfig() ?? DEFAULT_GLOBAL_CONFIG;
    return {
      enabled: global.reviewLoop.enabled,
      maxIterations: columnSpec.maxIterations ?? global.reviewLoop.maxIterations,
      escalation: columnSpec.escalation,
    };
  }

  private withExtraArtifact(
    context: AssembledContext,
    name: string,
    content: string,
  ): AssembledContext {
    return {
      ...context,
      priorArtifacts: [...context.priorArtifacts, { name, content }],
    };
  }

  /**
   * `subState` defaults to ESCALATED but is overridable, because some
   * escalations have a more specific state that other commands key on —
   * preflight blockers stay BLOCKED so `aeos ticket answer` still accepts them.
   */
  private finishEscalatedRun(
    ctx: RunContext,
    ticket: Ticket,
    escalation: Escalation,
    attempt: number,
    subState: (typeof SubState)[keyof typeof SubState] = SubState.ESCALATED,
  ): TicketRunResult {
    const transition = this.transitionSubState(
      ctx.projectId,
      ctx.ticketId,
      ctx.projectPath,
      ticket,
      subState,
    );
    if (transition.ok) {
      ctx.emitter.emit({
        type: 'sub-state.changed',
        phase: 'state',
        payload: { from: transition.previous, to: subState },
      });
    }

    // Persist the reason so `aeos ticket show` and the orchestrator can explain
    // the stall after the run ends — the event below is live-only. Written after
    // the sub-state transition, which retains escalation for ESCALATED/BLOCKED.
    this.ticketRepo.setEscalation(ctx.projectId, ctx.ticketId, {
      reason: escalation.reason,
      message: escalation.message,
      artifactPath: escalation.artifactPath ?? null,
    });

    // Write the human-facing escalation artifact so the operator can respond in
    // a file and `aeos ticket resolve`, mirroring the preflight questions flow.
    // The BLOCKED (preflight) path already has its own questions.md, so only the
    // true ESCALATED path gets an escalation.md.
    if (subState === SubState.ESCALATED) {
      this.artifactStore.writeArtifact(
        ctx.projectPath,
        ctx.ticketId,
        escalationFilename(ctx.ticketId),
        buildEscalationDocument({
          ticketId: ctx.ticketId,
          column: ctx.column,
          reason: escalation.reason,
          message: escalation.message,
          artifactPath: escalation.artifactPath ?? null,
        }),
      );
    }

    ctx.emitter.emit({
      type: 'ticket-run.escalated',
      phase: 'complete',
      payload: {
        reason: escalation.reason,
        message: escalation.message,
        attempt,
        artifactPath: escalation.artifactPath,
      },
    });

    return {
      status: 'escalated',
      ticketId: ctx.ticketId,
      reason: escalation.reason,
      message: escalation.message,
      attempts: attempt,
      artifactPath: escalation.artifactPath,
    };
  }

  private resolveColumn(columnString: string): Column | null {
    return isValidColumn(columnString) ? columnString : null;
  }

  private resolveWorkerExecutorMode(
    columnSpec: ColumnSpec,
    column: Column,
  ): 'artifact' | 'agentic' {
    if (columnSpec.executorMode) {
      return columnSpec.executorMode;
    }
    return column === Column.IMPLEMENTATION ? 'agentic' : 'artifact';
  }

  private supportsAgenticExecution(executorType: AgentSpec['executor']['type']): boolean {
    return (
      executorType === 'claude-cli' ||
      executorType === 'auggie-cli' ||
      executorType === 'opencode-cli' ||
      executorType === 'stub'
    );
  }

  /** What differs from HEAD in the project and in `.aeos`, relative to the project root. */
  private changedPaths(ctx: RunContext): Set<string> {
    return new Set([
      // `.aeos` is its own repository; the project's must not speak for it.
      ...this.gitGateway.changedFiles(ctx.projectPath).filter((file) => !file.startsWith('.aeos/')),
      ...this.gitGateway.changedFiles(ctx.aeosDir).map((file) => `.aeos/${file}`),
    ]);
  }

  /**
   * Restores every protected path that changed since `before` and says which,
   * or returns undefined when none did. Called straight after an executor
   * returns, so the engine's own later writes under `.aeos/` never count.
   *
   * shortcut: a set difference, so a further edit to a protected file that
   * was already uncommitted before the run goes unseen; compare content
   * hashes if operators keep such files dirty.
   */
  private restoreProtected(ctx: RunContext, before: ReadonlySet<string>): string | undefined {
    const touched = [...this.changedPaths(ctx)].filter((file) => !before.has(file));
    const violations = findViolations(touched, ctx.protectedGlobs);
    if (violations.length === 0) return undefined;

    const inAeos = violations.filter((file) => file.startsWith('.aeos/'));
    const inProject = violations.filter((file) => !file.startsWith('.aeos/'));
    if (inAeos.length > 0) {
      this.gitGateway.restoreFiles(
        ctx.aeosDir,
        inAeos.map((file) => file.slice('.aeos/'.length)),
      );
    }
    if (inProject.length > 0) this.gitGateway.restoreFiles(ctx.projectPath, inProject);
    return `The run changed protected paths, which have been restored: ${violations.join(', ')}`;
  }

  private newRunId(startedAt: Date): string {
    const timestamp = startedAt.toISOString().replace(/[-:]|\.\d+/g, '');
    return `RUN-${timestamp}-${randomInt(36 ** 4)
      .toString(36)
      .padStart(4, '0')}`;
  }

  /** Writes the record, the brief and the log of one executor invocation. */
  private writeRunRecord(ctx: RunContext, run: InvokedRun): WrittenRun {
    const { result } = run;
    const error = run.error ?? (result.ok ? null : result.reason);
    const usage = result.ok ? result.usage : undefined;
    const costUsd = usage?.costUsd ?? null;
    const runId = this.newRunId(run.startedAt);
    const paths = runRecordPaths(ctx.ticketId, runId);

    const record: RunRecord = {
      schema_version: 0,
      run_id: runId,
      project: ctx.projectId,
      ticket: ctx.ticketId,
      column: ctx.column,
      role: run.role,
      agent: run.agent,
      attempt: run.attempt,
      executor: run.executor,
      model: run.model ?? null,
      mode: run.mode,
      brief: {
        path: paths.brief,
        sha256: createHash('sha256').update(run.prompt).digest('hex'),
      },
      output: run.output ? `tickets/${ctx.ticketId}/${run.output}` : null,
      transcript: paths.transcript,
      verdict: run.verdict ?? null,
      started_at: run.startedAt.toISOString(),
      ended_at: run.endedAt.toISOString(),
      duration_ms: run.endedAt.getTime() - run.startedAt.getTime(),
      exit:
        error === null
          ? 'ok'
          : this.isInterruptedReason(error)
            ? 'interrupted'
            : error.startsWith('Executor timeout')
              ? 'timeout'
              : 'failed',
      usage: usage ? { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens } : null,
      cost_usd: costUsd,
      cost_basis:
        costUsd === null ? 'unknown' : run.executor === 'stub' ? 'none' : 'executor-estimate',
      spec_pin: ctx.specPin,
      error,
    };

    // A failed executor returns no stream, so its reason is all the log there is.
    const transcript = result.ok ? (result.transcript ?? result.content ?? '') : result.reason;
    const files = this.runRecordStore.write(ctx.projectPath, record, {
      brief: run.prompt,
      transcript,
    });
    return { record, files };
  }

  /** For a run that left no artefact to be committed with. */
  private recordRunAlone(ctx: RunContext, run: InvokedRun): void {
    const { record, files } = this.writeRunRecord(ctx, run);
    this.gitGateway.commitFiles(
      ctx.aeosDir,
      files,
      `[${ctx.ticketId}][RUN][${record.run_id}][${record.role}][${record.exit}]`,
    );
  }

  private recordCost(
    projectId: string,
    ticketId: string,
    column: string,
    agent: string,
    executor: string,
    model: string | undefined,
    result: ExecutorResult,
    role: CostRole,
  ): void {
    const usage = result.ok ? result.usage : undefined;
    this.costRepo.record({
      role,
      ticketId,
      projectId,
      column,
      agent,
      executor,
      model: model ?? 'unknown',
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      costUsd: usage?.costUsd ?? null,
      recordedAt: new Date().toISOString(),
    });
  }

  /**
   * Syncs the ticket markdown to disk without committing.
   *
   * Sub-state is authoritative in SQLite; git carries artifacts. Committing on
   * every transition produced hundreds of `[STATE]` commits per epic and buried
   * the artifact history a human actually reads.
   */
  private transitionSubState(
    projectId: string,
    ticketId: string,
    projectPath: string,
    ticket: Ticket,
    nextSubState: (typeof SubState)[keyof typeof SubState],
  ): { ok: true; ticket: Ticket; previous: Ticket['subState'] } | { ok: false; error: string } {
    const previous = ticket.subState;
    const result = this.stateMachine.setSubState(projectId, ticketId, nextSubState);
    if (!result.ok) {
      return { ok: false, error: `Failed to set ${nextSubState} state: ${result.reason}` };
    }

    const nextTicket = { ...ticket, subState: nextSubState };
    syncTicketDocument(this.artifactStore, projectPath, nextTicket);
    return { ok: true, ticket: nextTicket, previous };
  }

  private formatExecutorFailure(
    stage: 'worker' | 'reviewer',
    column: Column,
    reason: string,
  ): string {
    const capitalizedStage = stage === 'worker' ? 'Worker' : 'Reviewer';
    return `${capitalizedStage} executor failed in ${column}:\n${reason}`;
  }

  private createChunkObserver(
    emitter: TicketRunEventEmitter,
    source: 'preflight' | 'worker' | 'reviewer',
  ): ExecutorChunkObserver {
    return (stream, chunk) => {
      emitter.emit({
        type: stream === 'stdout' ? 'executor.stdout.chunk' : 'executor.stderr.chunk',
        phase: source,
        payload: { source, chunk },
      });
    };
  }

  private emitStageEvent(
    emitter: TicketRunEventEmitter,
    type: 'stage.started' | 'stage.completed' | 'stage.failed',
    stage: TicketRunPhase,
    message: string,
    metadata?: {
      role?: 'preflight' | 'worker' | 'reviewer';
      agent?: string;
      executor?: string;
      model?: string;
      mode?: 'artifact' | 'agentic';
    },
  ): void {
    emitter.emit({
      type,
      phase: stage,
      payload: { stage, message, ...metadata },
    });
  }

  private emitCostEvent(
    emitter: TicketRunEventEmitter,
    role: 'worker' | 'reviewer',
    result: ExecutorResult,
  ): void {
    const usage = result.ok ? result.usage : undefined;
    emitter.emit({
      type: 'cost.recorded',
      phase: role,
      payload: {
        role,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        costUsd: usage?.costUsd ?? null,
      },
    });
  }

  private isInterruptedReason(reason: string): boolean {
    return this.interruptRequested || reason.includes('Execution interrupted by operator');
  }

  private finishInterruptedRun(
    emitter: TicketRunEventEmitter,
    projectId: string,
    ticketId: string,
    projectPath: string,
    ticket: Ticket,
    stage: TicketRunPhase,
    reason: string,
  ): TicketRunResult {
    const interrupted = this.transitionSubState(
      projectId,
      ticketId,
      projectPath,
      ticket,
      SubState.INTERRUPTED,
    );
    const message = interrupted.ok
      ? reason || 'Execution interrupted by operator'
      : interrupted.error;

    emitter.emit({
      type: 'ticket-run.interrupted',
      phase: 'complete',
      payload: { message, stage },
    });

    if (interrupted.ok) {
      emitter.emit({
        type: 'sub-state.changed',
        phase: 'state',
        payload: { from: interrupted.previous, to: SubState.INTERRUPTED },
      });
    }

    return { status: 'failed', ticketId, error: message };
  }
}
