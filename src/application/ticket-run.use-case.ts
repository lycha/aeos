// Use case — TicketRun (orchestration: preflight → executor → validate → review → sign-off)

import * as path from 'node:path';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { Executor } from '../domain/ports/driven/executor.port.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type { ColumnSpecLoader } from '../domain/ports/driven/column-spec-loader.port.js';
import type { AgentSpecLoader } from '../domain/ports/driven/agent-spec-loader.port.js';
import type { RubricLoader } from '../domain/ports/driven/rubric-loader.port.js';
import type { CostRepository } from '../domain/ports/driven/cost-repository.port.js';
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
import { Column } from '../domain/model/column.js';
import { SubState } from '../domain/model/sub-state.js';
import { validateOutput } from '../domain/services/output-validation.js';
import { isValidColumn } from '../domain/model/column.js';
import { syncTicketDocument } from './services/ticket-document.js';
import { TicketRunEventEmitter } from './services/ticket-run-event-emitter.js';

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
      const ticket = this.ticketRepo.findById(projectId, ticketId);
      if (!ticket) {
        return { status: 'failed', ticketId, error: `Ticket ${ticketId} not found` };
      }

      if (ticket.column === Column.BACKLOG) {
        return {
          status: 'failed',
          ticketId,
          error: `Ticket ${ticketId} is in BACKLOG. Run 'aeos ticket approve ${ticketId}' to advance to PRODUCT_SCOPING first.`,
        };
      }
      if (ticket.column === Column.DONE) {
        return {
          status: 'failed',
          ticketId,
          error: `Ticket ${ticketId} is already DONE.`,
        };
      }
      if (ticket.column === Column.DOD_GATE) {
        return { status: 'failed', ticketId, error: 'DoD gate is human-only' };
      }
      if (ticket.subState === SubState.WORKING) {
        return { status: 'failed', ticketId, error: 'Ticket is already running' };
      }
      if (ticket.subState === SubState.BLOCKED) {
        return {
          status: 'blocked',
          ticketId,
          blockers: ['Ticket is blocked — run `aeos ticket answer` first'],
        };
      }

      const columnSpec = this.columnSpecLoader.load(ticket.column, projectPath);
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
        return {
          status: 'failed',
          ticketId,
          error: `Invalid column value: ${columnSpec.column}`,
        };
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

      const workerExecutor = this.createExecutor(resolvedWorkerAgentSpec);
      const aeosDir = path.join(projectPath, '.aeos');
      let mirroredTicket = ticket;

      this.emitStageEvent(emitter, 'stage.started', 'context', 'Assembling ticket context');
      const assembledContext = await this.contextAssembler.assemble(
        ticketId,
        projectPath,
        columnSpec.column,
      );
      this.emitStageEvent(emitter, 'stage.completed', 'context', 'Context assembled');

      this.emitStageEvent(emitter, 'stage.started', 'preflight', 'Running preflight checks', {
        role: 'preflight',
        executor: resolvedWorkerConfig.executorType,
        model: resolvedWorkerConfig.model,
        mode: 'artifact',
      });

      let preflightResult;
      try {
        this.currentExecutor = workerExecutor;
        this.interruptStage = 'preflight';
        preflightResult = await this.preflight.run(
          ticketId,
          projectId,
          projectPath,
          assembledContext,
          columnSpec,
          workerAgentSpec,
          workerExecutor,
          this.createChunkObserver(emitter, 'preflight'),
        );
      } catch (err) {
        this.currentExecutor = null;
        this.interruptStage = undefined;
        const message = err instanceof Error ? err.message : String(err);
        this.emitStageEvent(emitter, 'stage.failed', 'preflight', message, {
          role: 'preflight',
          executor: resolvedWorkerConfig.executorType,
          model: resolvedWorkerConfig.model,
          mode: 'artifact',
        });
        if (this.isInterruptedReason(message)) {
          return this.finishInterruptedRun(
            emitter,
            projectId,
            ticketId,
            projectPath,
            mirroredTicket,
            'preflight',
            message,
          );
        }
        emitter.emit({
          type: 'ticket-run.failed',
          phase: 'complete',
          payload: { message },
        });
        return { status: 'failed', ticketId, error: message };
      }
      this.currentExecutor = null;
      this.interruptStage = undefined;

      this.emitStageEvent(
        emitter,
        'stage.completed',
        'preflight',
        preflightResult.blocked ? 'Preflight found blockers' : 'Preflight passed',
        {
          role: 'preflight',
          executor: resolvedWorkerConfig.executorType,
          model: resolvedWorkerConfig.model,
          mode: 'artifact',
        },
      );

      if (preflightResult.blocked) {
        const questionsAbsPath = path.join(
          aeosDir,
          'tickets',
          ticketId,
          preflightResult.questionsPath,
        );
        const previous = mirroredTicket.subState;
        const ticketFilePath = this.syncMirroredTicket(projectPath, {
          ...mirroredTicket,
          subState: SubState.BLOCKED,
        });
        mirroredTicket = { ...mirroredTicket, subState: SubState.BLOCKED };
        this.gitGateway.commitFiles(
          aeosDir,
          [questionsAbsPath, ticketFilePath],
          `[${ticketId}][QUESTIONS][v1][preflight][blocked]`,
        );
        emitter.emit({
          type: 'ticket-run.blocked',
          phase: 'complete',
          payload: {
            blockers: [`Preflight questions written to ${preflightResult.questionsPath}`],
          },
        });
        emitter.emit({
          type: 'sub-state.changed',
          phase: 'state',
          payload: { from: previous, to: SubState.BLOCKED },
        });
        return {
          status: 'blocked',
          ticketId,
          blockers: [`Preflight questions written to ${preflightResult.questionsPath}`],
        };
      }

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

      const prompt = this.buildPromptFn(assembledContext, workerAgentSpec);
      const artifactFilename = `${ticketId}-${columnSpec.outputArtifact}`;
      const artifactAbsPath = path.join(aeosDir, 'tickets', ticketId, artifactFilename);

      this.emitStageEvent(emitter, 'stage.started', 'worker', 'Running worker executor', {
        role: 'worker',
        executor: resolvedWorkerConfig.executorType,
        model: resolvedWorkerConfig.model,
        mode: workerMode,
      });

      let executorResult: ExecutorResult;
      try {
        this.currentExecutor = workerExecutor;
        this.interruptStage = 'worker';
        executorResult = await workerExecutor.run({
          prompt,
          outputPath: artifactAbsPath,
          ticketId,
          column,
          mode: workerMode,
          workingDirectory: workerMode === 'agentic' ? projectPath : undefined,
          onChunk: this.createChunkObserver(emitter, 'worker'),
        });
      } catch (err) {
        this.currentExecutor = null;
        this.interruptStage = undefined;
        const message = err instanceof Error ? err.message : String(err);
        this.emitStageEvent(emitter, 'stage.failed', 'worker', message, {
          role: 'worker',
          executor: resolvedWorkerConfig.executorType,
          model: resolvedWorkerConfig.model,
          mode: workerMode,
        });
        if (this.isInterruptedReason(message)) {
          return this.finishInterruptedRun(
            emitter,
            projectId,
            ticketId,
            projectPath,
            mirroredTicket,
            'worker',
            message,
          );
        }
        const error = this.formatExecutorFailure('worker', column, message);
        emitter.emit({
          type: 'ticket-run.failed',
          phase: 'complete',
          payload: { message: error },
        });
        return { status: 'failed', ticketId, error };
      }
      this.currentExecutor = null;
      this.interruptStage = undefined;

      this.recordCost(
        projectId,
        ticketId,
        column,
        workerAgentSpec.name,
        resolvedWorkerConfig.executorType,
        resolvedWorkerConfig.model,
        executorResult,
      );
      this.emitCostEvent(emitter, 'worker', executorResult);

      if (!executorResult.ok) {
        this.emitStageEvent(emitter, 'stage.failed', 'worker', executorResult.reason, {
          role: 'worker',
          executor: resolvedWorkerConfig.executorType,
          model: resolvedWorkerConfig.model,
          mode: workerMode,
        });
        this.artifactStore.removeArtifact(projectPath, ticketId, artifactFilename);
        if (this.isInterruptedReason(executorResult.reason)) {
          return this.finishInterruptedRun(
            emitter,
            projectId,
            ticketId,
            projectPath,
            mirroredTicket,
            'worker',
            executorResult.reason,
          );
        }

        const failedTransition = this.transitionSubState(
          projectId,
          ticketId,
          projectPath,
          mirroredTicket,
          SubState.FAILED,
        );
        if (!failedTransition.ok) {
          emitter.emit({
            type: 'ticket-run.failed',
            phase: 'complete',
            payload: { message: failedTransition.error },
          });
          return { status: 'failed', ticketId, error: failedTransition.error };
        }
        emitter.emit({
          type: 'sub-state.changed',
          phase: 'state',
          payload: { from: failedTransition.previous, to: SubState.FAILED },
        });
        mirroredTicket = failedTransition.ticket;
        const error = this.formatExecutorFailure('worker', column, executorResult.reason);
        emitter.emit({
          type: 'ticket-run.failed',
          phase: 'complete',
          payload: { message: error },
        });
        return { status: 'failed', ticketId, error };
      }

      this.emitStageEvent(emitter, 'stage.completed', 'worker', 'Worker completed', {
        role: 'worker',
        executor: resolvedWorkerConfig.executorType,
        model: resolvedWorkerConfig.model,
        mode: workerMode,
      });

      const content = executorResult.content ?? '';
      this.emitStageEvent(emitter, 'stage.started', 'validation', 'Validating worker output');

      if (workerMode === 'agentic') {
        const repoDiff = this.gitGateway.diff(projectPath).trim();
        if (repoDiff.length === 0) {
          this.emitStageEvent(
            emitter,
            'stage.failed',
            'validation',
            'Agentic implementation produced no repository changes',
          );
          this.artifactStore.removeArtifact(projectPath, ticketId, artifactFilename);
          const failedTransition = this.transitionSubState(
            projectId,
            ticketId,
            projectPath,
            mirroredTicket,
            SubState.FAILED,
          );
          if (!failedTransition.ok) {
            emitter.emit({
              type: 'ticket-run.failed',
              phase: 'complete',
              payload: { message: failedTransition.error },
            });
            return { status: 'failed', ticketId, error: failedTransition.error };
          }
          emitter.emit({
            type: 'sub-state.changed',
            phase: 'state',
            payload: { from: failedTransition.previous, to: SubState.FAILED },
          });
          mirroredTicket = failedTransition.ticket;
          const error = 'Agentic implementation produced no repository changes';
          emitter.emit({
            type: 'ticket-run.failed',
            phase: 'complete',
            payload: { message: error },
          });
          return { status: 'failed', ticketId, error };
        }
      }

      const validation = validateOutput(content, columnSpec);
      if (!validation.passed) {
        const error = `Output validation failed: ${validation.violations.join('; ')}`;
        this.emitStageEvent(emitter, 'stage.failed', 'validation', error);
        this.artifactStore.removeArtifact(projectPath, ticketId, artifactFilename);
        const failedTransition = this.transitionSubState(
          projectId,
          ticketId,
          projectPath,
          mirroredTicket,
          SubState.FAILED,
        );
        if (!failedTransition.ok) {
          emitter.emit({
            type: 'ticket-run.failed',
            phase: 'complete',
            payload: { message: failedTransition.error },
          });
          return { status: 'failed', ticketId, error: failedTransition.error };
        }
        emitter.emit({
          type: 'sub-state.changed',
          phase: 'state',
          payload: { from: failedTransition.previous, to: SubState.FAILED },
        });
        mirroredTicket = failedTransition.ticket;
        emitter.emit({
          type: 'ticket-run.failed',
          phase: 'complete',
          payload: { message: error },
        });
        return { status: 'failed', ticketId, error };
      }

      this.emitStageEvent(emitter, 'stage.completed', 'validation', 'Validation passed');

      const workerCommitMessage = `[${ticketId}][${columnSpec.outputArtifact}][v1][${workerAgentSpec.name}][create]`;
      this.artifactStore.writeArtifact(projectPath, ticketId, artifactFilename, content);
      emitter.emit({
        type: 'artifact.written',
        phase: 'artifact',
        payload: { role: 'worker', path: artifactAbsPath },
      });
      this.gitGateway.commitFiles(aeosDir, [artifactAbsPath], workerCommitMessage);
      emitter.emit({
        type: 'artifact.committed',
        phase: 'artifact',
        payload: { role: 'worker', path: artifactAbsPath, commitMessage: workerCommitMessage },
      });

      const reviewFilename = `${ticketId}-${columnSpec.outputArtifact.replace('.md', '-review.md')}`;
      const reviewAbsPath = path.join(aeosDir, 'tickets', ticketId, reviewFilename);

      const rubricContents: string[] = [];
      for (const rubricPath of columnSpec.reviewerRubrics) {
        const rubricContent = await this.rubricLoader.load(rubricPath, projectPath);
        if (rubricContent !== null) {
          rubricContents.push(rubricContent);
        }
      }

      const reviewContext = await this.contextAssembler.assemble(
        ticketId,
        projectPath,
        columnSpec.column,
      );

      const enrichedContext =
        rubricContents.length > 0
          ? {
              ...reviewContext,
              priorArtifacts: [
                ...reviewContext.priorArtifacts,
                { name: 'reviewer-rubrics.md', content: rubricContents.join('\n\n---\n\n') },
              ],
            }
          : reviewContext;

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

      const reviewerPrompt = this.buildPromptFn(enrichedContext, reviewerAgentSpec);
      const reviewerExecutor = this.createExecutor(resolvedReviewerAgentSpec);
      this.emitStageEvent(emitter, 'stage.started', 'reviewer', 'Running reviewer executor', {
        role: 'reviewer',
        executor: resolvedReviewerConfig.executorType,
        model: resolvedReviewerConfig.model,
        mode: 'artifact',
      });

      let reviewResult: ExecutorResult;
      try {
        this.currentExecutor = reviewerExecutor;
        this.interruptStage = 'reviewer';
        reviewResult = await reviewerExecutor.run({
          prompt: reviewerPrompt,
          outputPath: reviewAbsPath,
          ticketId,
          column,
          mode: 'artifact',
          onChunk: this.createChunkObserver(emitter, 'reviewer'),
        });
      } catch (err) {
        this.currentExecutor = null;
        this.interruptStage = undefined;
        const message = err instanceof Error ? err.message : String(err);
        this.emitStageEvent(emitter, 'stage.failed', 'reviewer', message, {
          role: 'reviewer',
          executor: resolvedReviewerConfig.executorType,
          model: resolvedReviewerConfig.model,
          mode: 'artifact',
        });
        if (this.isInterruptedReason(message)) {
          return this.finishInterruptedRun(
            emitter,
            projectId,
            ticketId,
            projectPath,
            mirroredTicket,
            'reviewer',
            message,
          );
        }
        reviewResult = { ok: false, reason: message };
      }
      this.currentExecutor = null;
      this.interruptStage = undefined;

      this.recordCost(
        projectId,
        ticketId,
        column,
        reviewerAgentSpec.name,
        resolvedReviewerConfig.executorType,
        resolvedReviewerConfig.model,
        reviewResult,
      );
      this.emitCostEvent(emitter, 'reviewer', reviewResult);

      if (!reviewResult.ok) {
        this.emitStageEvent(emitter, 'stage.failed', 'reviewer', reviewResult.reason, {
          role: 'reviewer',
          executor: resolvedReviewerConfig.executorType,
          model: resolvedReviewerConfig.model,
          mode: 'artifact',
        });
        if (this.isInterruptedReason(reviewResult.reason)) {
          return this.finishInterruptedRun(
            emitter,
            projectId,
            ticketId,
            projectPath,
            mirroredTicket,
            'reviewer',
            reviewResult.reason,
          );
        }
      } else {
        this.emitStageEvent(emitter, 'stage.completed', 'reviewer', 'Reviewer completed', {
          role: 'reviewer',
          executor: resolvedReviewerConfig.executorType,
          model: resolvedReviewerConfig.model,
          mode: 'artifact',
        });

        const reviewContent = reviewResult.content ?? '';
        const reviewCommitMessage = `[${ticketId}][REVIEW][v1][reviewer-agent][create]`;
        this.artifactStore.writeArtifact(projectPath, ticketId, reviewFilename, reviewContent);
        emitter.emit({
          type: 'artifact.written',
          phase: 'artifact',
          payload: { role: 'reviewer', path: reviewAbsPath },
        });
        this.gitGateway.commitFiles(aeosDir, [reviewAbsPath], reviewCommitMessage);
        emitter.emit({
          type: 'artifact.committed',
          phase: 'artifact',
          payload: { role: 'reviewer', path: reviewAbsPath, commitMessage: reviewCommitMessage },
        });

        const normalizedReview = reviewContent.toUpperCase();
        const isRejected =
          normalizedReview.includes('REJECTED') ||
          (normalizedReview.includes('FAIL') && !normalizedReview.includes('APPROVED'));

        if (isRejected) {
          emitter.emit({
            type: 'review.rejected',
            phase: 'reviewer',
            payload: {
              reviewPath: reviewAbsPath,
              reason: 'Reviewer rejected the artifact. See review for details.',
            },
          });

          const failedTransition = this.transitionSubState(
            projectId,
            ticketId,
            projectPath,
            mirroredTicket,
            SubState.FAILED,
          );
          if (!failedTransition.ok) {
            emitter.emit({
              type: 'ticket-run.failed',
              phase: 'complete',
              payload: { message: failedTransition.error, reviewPath: reviewAbsPath },
            });
            return {
              status: 'failed',
              ticketId,
              error: failedTransition.error,
              reviewPath: reviewAbsPath,
            };
          }

          emitter.emit({
            type: 'sub-state.changed',
            phase: 'state',
            payload: { from: failedTransition.previous, to: SubState.FAILED },
          });
          mirroredTicket = failedTransition.ticket;
          const error = 'Reviewer rejected the artifact. See review for details.';
          emitter.emit({
            type: 'ticket-run.failed',
            phase: 'complete',
            payload: { message: error, reviewPath: reviewAbsPath },
          });
          return { status: 'failed', ticketId, error, reviewPath: reviewAbsPath };
        }
      }

      const inReviewTransition = this.transitionSubState(
        projectId,
        ticketId,
        projectPath,
        mirroredTicket,
        SubState.IN_REVIEW,
      );
      if (!inReviewTransition.ok) {
        emitter.emit({
          type: 'ticket-run.failed',
          phase: 'complete',
          payload: { message: inReviewTransition.error },
        });
        return { status: 'failed', ticketId, error: inReviewTransition.error };
      }
      emitter.emit({
        type: 'sub-state.changed',
        phase: 'state',
        payload: { from: inReviewTransition.previous, to: SubState.IN_REVIEW },
      });
      mirroredTicket = inReviewTransition.ticket;

      this.emitStageEvent(emitter, 'stage.started', 'sign-off', 'Signing off ticket');
      const signedOffTransition = this.transitionSubState(
        projectId,
        ticketId,
        projectPath,
        mirroredTicket,
        SubState.SIGNED_OFF,
      );
      if (!signedOffTransition.ok) {
        emitter.emit({
          type: 'ticket-run.failed',
          phase: 'complete',
          payload: { message: signedOffTransition.error },
        });
        return { status: 'failed', ticketId, error: signedOffTransition.error };
      }
      emitter.emit({
        type: 'sub-state.changed',
        phase: 'state',
        payload: { from: signedOffTransition.previous, to: SubState.SIGNED_OFF },
      });
      mirroredTicket = signedOffTransition.ticket;
      this.emitStageEvent(emitter, 'stage.completed', 'sign-off', 'Ticket signed off');
      emitter.emit({
        type: 'ticket-run.completed',
        phase: 'complete',
        payload: { artifactPath: artifactAbsPath, reviewPath: reviewAbsPath },
      });

      return {
        status: 'success',
        ticketId,
        artifactPath: artifactAbsPath,
        reviewPath: reviewAbsPath,
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

  private resolveColumn(columnString: string): Column | null {
    if (isValidColumn(columnString)) {
      return columnString;
    }
    return null;
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

  private syncMirroredTicket(projectPath: string, ticket: Ticket): string {
    return syncTicketDocument(this.artifactStore, projectPath, ticket);
  }

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
    this.commitMirroredSubState(
      projectPath,
      nextTicket,
      `[${ticketId}][STATE][v1][sub-state: ${nextSubState}]`,
    );
    return { ok: true, ticket: nextTicket, previous };
  }

  private commitMirroredSubState(projectPath: string, ticket: Ticket, message: string): void {
    const aeosDir = path.join(projectPath, '.aeos');
    const ticketFilePath = this.syncMirroredTicket(projectPath, ticket);
    this.gitGateway.commitFiles(aeosDir, [ticketFilePath], message);
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
      executor?: string;
      model?: string;
      mode?: 'artifact' | 'agentic';
    },
  ): void {
    emitter.emit({
      type,
      phase: stage,
      payload: {
        stage,
        message,
        ...metadata,
      },
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
    const interruptedTransition = this.transitionSubState(
      projectId,
      ticketId,
      projectPath,
      ticket,
      SubState.INTERRUPTED,
    );
    const message =
      interruptedTransition.ok === false
        ? interruptedTransition.error
        : reason || 'Execution interrupted by operator';

    emitter.emit({
      type: 'ticket-run.interrupted',
      phase: 'complete',
      payload: { message, stage },
    });

    if (interruptedTransition.ok) {
      emitter.emit({
        type: 'sub-state.changed',
        phase: 'state',
        payload: { from: interruptedTransition.previous, to: SubState.INTERRUPTED },
      });
    }

    return { status: 'failed', ticketId, error: message };
  }
}
