// Use case — TicketRun
//
// Orchestration for one column:
//
//   eligibility → context → preflight → [WORKING]
//     ↓
//   ┌─ attempt: worker → validate → commit → reviewer → verdict ─┐
//   │    verdict APPROVED*        → advance                       │
//   │    verdict REJECTED, room   → retry with review feedback ───┘
//   │    verdict REJECTED, no room→ escalate
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
import type { ExecutorResult } from '../domain/model/executor-result.js';
import type { StateMachineService } from '../domain/services/state-machine.js';
import type { ContextAssembler } from './services/context-assembler.js';
import type { PreflightService } from './services/preflight.js';
import type { AgentSpec } from '../domain/model/agent-spec.js';
import type { AssembledContext } from '../domain/model/assembled-context.js';
import type { ColumnSpec } from '../domain/model/column-spec.js';
import type { Ticket } from '../domain/model/ticket.js';
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
import { Column } from '../domain/model/column.js';
import { SubState } from '../domain/model/sub-state.js';
import { validateOutput } from '../domain/services/output-validation.js';
import { isValidColumn } from '../domain/model/column.js';
import { parseVerdict } from '../domain/services/verdict-parser.js';
import { decideNextAttempt, type LoopConfig } from '../domain/services/review-loop-policy.js';
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
}

type AttemptOutcome =
  | { kind: 'reviewed'; verdict: ReviewVerdict; reviewContent: string }
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
      const baseContext = await this.contextAssembler.assemble(
        ticketId,
        projectPath,
        columnSpec.column,
      );
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
      let feedback: string | undefined;
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

        const decision = decideNextAttempt({
          verdict: outcome.verdict,
          attempt,
          config: loopConfig,
          previousBlockerTopics: blockerHistory,
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

        if (decision.action === 'escalate') {
          emitter.emit({
            type: 'review.rejected',
            phase: 'reviewer',
            payload: {
              reviewPath: ctx.reviewAbsPath,
              reason: decision.escalation.message,
            },
          });
          return this.finishEscalatedRun(ctx, mirroredTicket, decision.escalation, attempt);
        }

        // Retry: carry the review forward so the worker revises rather than
        // regenerating from scratch, and record blockers for stall detection.
        emitter.emit({
          type: 'review.rejected',
          phase: 'reviewer',
          payload: { reviewPath: ctx.reviewAbsPath, reason: decision.reason },
        });
        blockerHistory.push([...outcome.verdict.blockerTopics]);
        feedback = outcome.reviewContent;
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
    feedback: string | undefined,
  ): Promise<AttemptOutcome> {
    const { emitter, ticketId, projectPath, projectId, aeosDir, columnSpec, workerMode, column } =
      ctx;

    // ── Worker ───────────────────────────────────────────────────
    // On a retry the context is re-assembled rather than reusing the one taken
    // before the run: the worker is being asked to revise an artifact, and the
    // pre-run snapshot does not contain it. The prior review is then attached
    // under an unambiguous name, and its raw file dropped so it appears once.
    let workerContext = ctx.baseContext;
    if (feedback) {
      const fresh = await this.contextAssembler.assemble(ticketId, projectPath, columnSpec.column);
      workerContext = this.withExtraArtifact(
        {
          ...fresh,
          priorArtifacts: fresh.priorArtifacts.filter(
            (artifact) => artifact.name !== ctx.reviewFilename,
          ),
        },
        'previous-review.md',
        feedback,
      );
    }
    const prompt = this.buildPromptFn(workerContext, ctx.workerAgentSpec);

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
      const message = err instanceof Error ? err.message : String(err);
      this.emitStageEvent(emitter, 'stage.failed', 'worker', message, {
        role: 'worker',
        executor: ctx.workerExecutorType,
        model: ctx.workerModel,
        mode: workerMode,
      });
      if (this.isInterruptedReason(message)) {
        return { kind: 'interrupted', stage: 'worker', message };
      }
      return { kind: 'failed', error: this.formatExecutorFailure('worker', column, message) };
    } finally {
      this.currentExecutor = null;
      this.interruptStage = undefined;
    }

    this.recordCost(
      projectId,
      ticketId,
      column,
      ctx.workerAgentSpec.name,
      ctx.workerExecutorType,
      ctx.workerModel,
      executorResult,
    );
    this.emitCostEvent(emitter, 'worker', executorResult);

    if (!executorResult.ok) {
      this.emitStageEvent(emitter, 'stage.failed', 'worker', executorResult.reason, {
        role: 'worker',
        executor: ctx.workerExecutorType,
        model: ctx.workerModel,
        mode: workerMode,
      });
      this.artifactStore.removeArtifact(projectPath, ticketId, ctx.artifactFilename);
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
        return { kind: 'failed', error };
      }
    }

    const validation = validateOutput(content, columnSpec);
    if (!validation.passed) {
      const error = `Output validation failed: ${validation.violations.join('; ')}`;
      this.emitStageEvent(emitter, 'stage.failed', 'validation', error);
      this.artifactStore.removeArtifact(projectPath, ticketId, ctx.artifactFilename);
      return { kind: 'failed', error };
    }

    this.emitStageEvent(emitter, 'stage.completed', 'validation', 'Validation passed');

    // ── Commit the artifact ──────────────────────────────────────
    const revision = attempt > 1 ? `v${attempt}` : 'v1';
    const workerCommitMessage = `[${ticketId}][${columnSpec.outputArtifact}][${revision}][${ctx.workerAgentSpec.name}][${attempt > 1 ? 'revise' : 'create'}]`;
    this.artifactStore.writeArtifact(projectPath, ticketId, ctx.artifactFilename, content);
    emitter.emit({
      type: 'artifact.written',
      phase: 'artifact',
      payload: { role: 'worker', path: ctx.artifactAbsPath },
    });
    this.gitGateway.commitFiles(aeosDir, [ctx.artifactAbsPath], workerCommitMessage);
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
      if (this.isInterruptedReason(message)) {
        return { kind: 'interrupted', stage: 'reviewer', message };
      }
      reviewResult = { ok: false, reason: message };
    } finally {
      this.currentExecutor = null;
      this.interruptStage = undefined;
    }

    this.recordCost(
      projectId,
      ticketId,
      column,
      ctx.reviewerAgentSpec.name,
      ctx.reviewerExecutorType,
      ctx.reviewerModel,
      reviewResult,
    );
    this.emitCostEvent(emitter, 'reviewer', reviewResult);

    if (!reviewResult.ok) {
      this.emitStageEvent(emitter, 'stage.failed', 'reviewer', reviewResult.reason, {
        role: 'reviewer',
        executor: ctx.reviewerExecutorType,
        model: ctx.reviewerModel,
        mode: 'artifact',
      });
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
    this.artifactStore.writeArtifact(projectPath, ticketId, ctx.reviewFilename, reviewContent);
    emitter.emit({
      type: 'artifact.written',
      phase: 'artifact',
      payload: { role: 'reviewer', path: ctx.reviewAbsPath },
    });
    this.gitGateway.commitFiles(aeosDir, [ctx.reviewAbsPath], reviewCommitMessage);
    emitter.emit({
      type: 'artifact.committed',
      phase: 'artifact',
      payload: {
        role: 'reviewer',
        path: ctx.reviewAbsPath,
        commitMessage: reviewCommitMessage,
      },
    });

    const parsed = parseVerdict(reviewContent);
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
        ctx.workerExecutor,
        this.createChunkObserver(emitter, 'preflight'),
      );
    } catch (err) {
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

    if (!preflightResult.blocked) return { kind: 'clear' };

    const questionsAbsPath = path.join(aeosDir, 'tickets', ticketId, preflightResult.questionsPath);
    this.gitGateway.commitFiles(
      aeosDir,
      [questionsAbsPath],
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
          error: `Ticket ${ticketId} is in BACKLOG. Run 'aeos ticket approve ${ticketId}' to advance to PRODUCT_SCOPING first.`,
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

  private recordCost(
    projectId: string,
    ticketId: string,
    column: string,
    agent: string,
    executor: string,
    model: string | undefined,
    result: ExecutorResult,
  ): void {
    const usage = result.ok ? result.usage : undefined;
    this.costRepo.record({
      ticketId,
      projectId,
      column,
      agent,
      executor,
      model: model ?? 'unknown',
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      costUsd: usage?.costUsd ?? 0,
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
        costUsd: usage?.costUsd ?? 0,
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
