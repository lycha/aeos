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
import { parseVerdict } from '../domain/services/verdict-parser.js';
import { findViolations, protectedGlobs } from '../domain/services/path-guard.js';
import {
  checkBlockerTopic,
  decideNextAttempt,
  type LoopConfig,
} from '../domain/services/review-loop-policy.js';
import type { Check, CheckResult } from '../domain/model/check.js';
import type { CheckRegistry } from './checks/check-registry.js';
import type { CriteriaCollector } from './services/criteria-collector.js';
import type { ConformanceService } from './services/conformance.service.js';
import { parseConformanceVerdicts } from '../domain/services/conformance-verdict-parser.js';
import { parseRepro } from '../domain/services/repro-parser.js';
import type { FileHasher } from '../domain/ports/driven/file-hasher.port.js';
import type { GeneratorStampStore } from '../domain/ports/driven/generator-stamp-store.port.js';
import type { GeneratorConfig } from '../domain/model/project-executor-config.js';
import {
  renderReproEvidence,
  reproductionBrief,
  type ReproState,
} from './services/repro-evidence.js';
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
  /** Run before an agentic worker, each when its inputs changed. */
  readonly generators: readonly GeneratorConfig[];
  /** Globs of the project's contracts: a worker that changes one marks the ticket. */
  readonly contractGlobs: readonly string[];
  /** The ticket's spec pin (its own or its epic's), written into every run record. */
  readonly specPin: SpecPin | null;
  /**
   * At the final gate: the criteria no instrument answered, which the worker
   * must judge. Empty means no agent is needed; null off the gate.
   */
  readonly judging: readonly string[] | null;
  /**
   * The two task instructions of a bug's implementation, which then runs the
   * worker twice: reproduce, fix. Null for anything else.
   */
  readonly bugTrack: NonNullable<AgentSpec['bugTrack']> | null;
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
    private readonly criteriaCollector: CriteriaCollector,
    private readonly conformanceService: ConformanceService,
    private readonly fileHasher: FileHasher,
    private readonly generatorStampStore: GeneratorStampStore,
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

      this.isolateTask(projectPath, mirroredTicket);

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

      const column = columnSpec.column;

      // The gate's column builds a conformance report, which takes a spec.
      const finalGate = columnSpec.role === 'final-gate';
      if (finalGate && !mirroredTicket.specPin) {
        return { status: 'failed', ticketId, error: 'DoD gate is human-only' };
      }

      // A column whose worker edits the repository says so in its spec.
      const workerMode = columnSpec.executorMode ?? 'artifact';
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

      // A bug is implemented in two phases, wherever code is written.
      const isBugFix = mirroredTicket.track === 'bug' && workerMode === 'agentic';
      if (isBugFix && !workerAgentSpec.bugTrack) {
        return {
          status: 'failed',
          ticketId,
          error: `${ticketId} is a bug, and ${columnSpec.workerAgentFile} has no \`bugTrack\` instructions (reproduce, fix). \`aeos project sync\` shows the template's.`,
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

      // ── Final gate: the conformance report ───────────────────────
      // Built before the context is assembled, so the worker and the reviewer
      // are both briefed with it.
      let judging: string[] | null = null;
      if (finalGate) {
        try {
          judging = await this.writeConformance(projectPath, ticketId);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          emitter.emit({ type: 'ticket-run.failed', phase: 'complete', payload: { message } });
          return { status: 'failed', ticketId, error: message };
        }
      }
      // Every criterion already has its answer: there is nothing to ask an agent.
      const noAgent = judging?.length === 0;

      this.emitStageEvent(emitter, 'stage.started', 'context', 'Assembling ticket context');
      let baseContext: AssembledContext;
      try {
        baseContext = await this.contextAssembler.assemble(
          ticketId,
          projectPath,
          columnSpec.diffContext ?? 'none',
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
      const projectConfig = this.projectRepo.readExecutorConfig(projectPath);
      const generators = projectConfig?.generators ?? [];
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
        // An agent builds on generated code and may not edit it.
        protectedGlobs: protectedGlobs([
          ...(projectConfig?.protectedPaths ?? []),
          ...generators.flatMap((generator) => generator.outputs),
        ]),
        generators,
        contractGlobs: [
          ...(projectConfig?.contracts ?? []),
          ...generators.flatMap((generator) => generator.inputs),
        ],
        specPin,
        judging,
        bugTrack: (isBugFix && workerAgentSpec.bugTrack) || null,
      };

      // ── Pre-worker checks ────────────────────────────────────────
      // Before preflight: a failure here is a person's to resolve, so no model
      // is asked anything and no attempt is used.
      const preWorkerChecks = this.checkRegistry.preWorkerChecksFor(
        mirroredTicket,
        specPin,
        columnSpec.role ?? 'standard',
      );
      if (preWorkerChecks.length > 0) {
        const escalation = await this.runPreWorkerChecks(ctx, preWorkerChecks);
        if (escalation) return this.finishEscalatedRun(ctx, mirroredTicket, escalation, 0);
      }

      // ── Preflight ────────────────────────────────────────────────
      const preflightOutcome = noAgent
        ? ({ kind: 'clear' } as const)
        : await this.runPreflight(ctx);
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
        if (noAgent) break;
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
    const { emitter, ticketId, projectPath, aeosDir, columnSpec, workerMode } = ctx;

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
        columnSpec.diffContext ?? 'none',
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

    // ── Generators ───────────────────────────────────────────────
    // On the first attempt only: later ones carry the worker's uncommitted
    // work, which a commit of generated files must not sweep up. Only where the
    // worker edits the repository: any other column may be on the default branch.
    if (workerMode === 'agentic' && columnSpec.requiresRepoDiff !== false && attempt === 1) {
      const failure = await this.runGenerators(ctx);
      if (failure) return failure;
    }

    // ── Bug track: the reproducing test comes first ──────────────
    // Once it has been seen to fail and is committed, every later attempt and
    // run is the fix alone.
    let repro: ReproState | null = null;
    if (ctx.bugTrack) {
      const known = this.readRepro(ctx);
      const reproduced = known ?? (await this.reproduce(ctx, attempt, workerContext));
      if ('kind' in reproduced) return reproduced;
      repro = reproduced;
      workerContext = this.withExtraArtifact(
        // Feedback that was answered by reproducing is not feedback on the fix.
        known
          ? workerContext
          : {
              ...workerContext,
              priorArtifacts: workerContext.priorArtifacts.filter(
                (artifact) => artifact.name !== feedback?.name,
              ),
            },
        'reproduction.md',
        reproductionBrief(repro),
      );
    }

    const worker = await this.invokeWorker(ctx, attempt, workerContext, repro ? 'fix' : undefined);
    if ('kind' in worker) return worker;
    const { run, content, contractPaths } = worker;

    // The fix may not weaken the test it has to pass.
    if (repro) {
      const now = this.fileHasher.sha256(projectPath, Object.keys(repro.files));
      const modified = Object.keys(repro.files).filter((file) => now[file] !== repro.files[file]);
      if (modified.length > 0) {
        // shortcut: restored to HEAD, which is the [REPRO] commit unless a later
        // run baselined over it; then the person restores it from that commit.
        this.gitGateway.restoreFiles(projectPath, modified);
        const error = `The reproducing test was modified: ${modified.join(', ')}. The fix must make the test pass without editing it; what was committed has been restored.`;
        this.emitStageEvent(emitter, 'stage.failed', 'validation', error);
        this.artifactStore.removeArtifact(projectPath, ticketId, ctx.artifactFilename);
        this.recordRunAlone(ctx, { ...run, error });
        return { kind: 'failed', error };
      }
    }

    // ── Validation ───────────────────────────────────────────────
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
    let checksFiles: string[] = [];
    if (repro) {
      const proven = await this.proveFixed(ctx, attempt, repro);
      if (!Array.isArray(proven)) {
        this.recordRunAlone(ctx, run);
        return proven;
      }
      checksFiles = proven;
    }
    const checks = columnSpec.runChecks ? this.checkRegistry.checksFor(projectPath) : [];
    if (checks.length > 0) {
      const stage = await this.runChecks(ctx, attempt, checks);
      if (!stage.passed) {
        this.recordRunAlone(ctx, run);
        return { kind: 'checks-failed', check: stage.check, output: stage.output };
      }
      checksFiles = [...checksFiles, ...stage.files];
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

    // ── Bug track: a fix does not change a contract ──────────────
    // The work is committed and the ticket marked; whether this is a bug fix
    // at all is a person's call, so the reviewer is not asked.
    if (repro && contractPaths.length > 0) {
      const message = `${ticketId}: this fix changes a contract; it is a behaviour change, not a bug fix (${contractPaths.join(', ')}). To accept it as one, \`aeos ticket sign-off ${ticketId} --reason "<why>"\` and then \`aeos ticket approve ${ticketId} --contract\`; otherwise re-file it as a feature.`;
      this.emitStageEvent(emitter, 'stage.failed', 'validation', message);
      return {
        kind: 'escalated',
        escalation: {
          reason: EscalationReason.CONTRACT_CHANGE,
          message,
          attempt,
          artifactPath: ctx.artifactAbsPath,
        },
      };
    }

    // ── Final gate: one verdict for each criterion asked about ───
    // Never coerced: a judgement that cannot be read is a person's to sort out.
    if (ctx.judging) {
      const parsed = parseConformanceVerdicts(content, ctx.judging);
      if (!parsed.ok) {
        this.emitStageEvent(emitter, 'stage.failed', 'validation', parsed.reason);
        return {
          kind: 'escalated',
          escalation: {
            reason: EscalationReason.UNPARSEABLE_VERDICT,
            message: parsed.reason,
            attempt,
            artifactPath: ctx.artifactAbsPath,
          },
        };
      }
    }

    // ── Reviewer ─────────────────────────────────────────────────
    return this.runReview(ctx, attempt, revision);
  }

  /**
   * Builds the conformance report of a spec-backed epic at its final gate and
   * commits it to the ticket directory, from where it reaches every context.
   * Returns the criteria no instrument answered.
   */
  private async writeConformance(projectPath: string, ticketId: string): Promise<string[]> {
    const { report, markdown } = await this.conformanceService.buildConformance(
      projectPath,
      ticketId,
    );
    const judging = report.criteria
      .filter((criterion) => criterion.verdict === 'unverified')
      .map((criterion) => criterion.id);
    const filename = `${ticketId}-conformance.md`;
    this.artifactStore.writeArtifact(
      projectPath,
      ticketId,
      filename,
      judging.length > 0
        ? `${markdown}\n## To judge\n\nJudge exactly these criteria: ${judging.join(', ')}\n`
        : markdown,
    );
    const aeosDir = path.join(projectPath, '.aeos');
    this.gitGateway.commitFiles(
      aeosDir,
      [path.join(aeosDir, 'tickets', ticketId, filename)],
      `[${ticketId}][conformance.md][engine][build]`,
    );
    return judging;
  }

  /**
   * Runs each generator whose inputs differ from those of its last run here,
   * records the run, and commits what it wrote to the project as
   * `[<ticket>][GENERATED] <name>`. Returns the failure of the first that fails.
   */
  private async runGenerators(ctx: RunContext): Promise<AttemptOutcome | null> {
    const { ticketId, projectPath } = ctx;
    for (const generator of ctx.generators) {
      const files = new Set([
        ...this.gitGateway.listFiles(projectPath, 'HEAD', '.'),
        ...this.gitGateway.changedFiles(projectPath),
      ]);
      const inputs = findViolations([...files].sort(), generator.inputs);
      const hash = createHash('sha256')
        .update(JSON.stringify(this.fileHasher.sha256(projectPath, inputs)))
        .digest('hex');
      const stamps = this.generatorStampStore.read(projectPath);
      if (stamps[generator.name] === hash) continue;

      const stage = await this.performChecks(
        ctx,
        1,
        [this.checkRegistry.generatorCheck(generator)],
        'shell',
        () => null,
        'generator',
      );
      this.gitGateway.commitFiles(
        ctx.aeosDir,
        stage.files,
        `[${ticketId}][RUN][${stage.runId}][generator][${stage.record.exit}]`,
      );
      if (stage.failed) {
        const error = `${stage.record.error}:\n${stage.failed.outputTail}`;
        this.emitStageEvent(ctx.emitter, 'stage.failed', 'checks', error);
        return { kind: 'failed', error };
      }

      // shortcut: an output the generator deleted is not committed here
      // (commitFiles takes files that exist); the worker's diff carries it.
      const written = this.fileHasher.sha256(
        projectPath,
        findViolations(this.gitGateway.changedFiles(projectPath), generator.outputs),
      );
      this.gitGateway.commitFiles(
        projectPath,
        Object.keys(written)
          .filter((file) => written[file] !== null)
          .map((file) => path.join(projectPath, file)),
        `[${ticketId}][GENERATED] ${generator.name}`,
      );
      this.generatorStampStore.write(projectPath, { ...stamps, [generator.name]: hash });
      this.emitStageEvent(ctx.emitter, 'stage.completed', 'checks', `Generated ${generator.name}`);
    }
    return null;
  }

  /**
   * One invocation of the column's worker: brief, run, protected paths, cost.
   * Returns the run and what it wrote, or how the attempt ends. A bug's
   * implementation calls it twice, once per phase, each with its instruction.
   */
  private async invokeWorker(
    ctx: RunContext,
    attempt: number,
    context: AssembledContext,
    bugPhase?: 'reproduce' | 'fix',
  ): Promise<{ run: InvokedRun; content: string; contractPaths: string[] } | AttemptOutcome> {
    const { emitter, ticketId, projectPath, projectId, workerMode, column } = ctx;
    const prompt = this.buildPromptFn(
      context,
      bugPhase && ctx.bugTrack
        ? { ...ctx.workerAgentSpec, taskInstruction: ctx.bugTrack[bugPhase] }
        : ctx.workerAgentSpec,
    );

    const attemptLabel = `${bugPhase ? ` (${bugPhase})` : ''}${attempt > 1 ? ` (attempt ${attempt})` : ''}`;
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
        ...(bugPhase ? { bugPhase } : {}),
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

    // A contract path is not protected: the diff is the proposal. The ticket
    // carries it to the approval, where a person decides.
    const contractPaths =
      ctx.contractGlobs.length > 0
        ? findViolations(
            [...this.changedPaths(ctx)].filter((file) => !beforeWorker.has(file)),
            ctx.contractGlobs,
          )
        : [];
    if (contractPaths.length > 0) {
      const carried = this.ticketRepo.findById(projectId, ticketId)?.contractChange?.paths ?? [];
      this.ticketRepo.setContractChange(projectId, ticketId, {
        paths: [...new Set([...carried, ...contractPaths])].sort(),
        // What was approved before does not cover what changed since.
        approvedBy: null,
      });
    }

    return { run, content: executorResult.content ?? '', contractPaths };
  }

  /** The record of a reproduction this ticket already has, if any. */
  private readRepro(ctx: RunContext): ReproState | null {
    const filename = `${ctx.ticketId}-repro.json`;
    return this.artifactStore.artifactExists(ctx.projectPath, ctx.ticketId, filename)
      ? (JSON.parse(
          this.artifactStore.readArtifact(ctx.projectPath, ctx.ticketId, filename),
        ) as ReproState)
      : null;
  }

  /**
   * Phase A of a bug: the worker adds a failing test and names the command
   * that runs it. The command must fail; then the test is committed as
   * `[<id>][REPRO]` and its files' hashes are kept.
   */
  private async reproduce(
    ctx: RunContext,
    attempt: number,
    context: AssembledContext,
  ): Promise<ReproState | AttemptOutcome> {
    const { emitter, ticketId, projectPath, aeosDir } = ctx;
    const worker = await this.invokeWorker(ctx, attempt, context, 'reproduce');
    if ('kind' in worker) return worker;

    const parsed = parseRepro(worker.content);
    if (!parsed.ok) {
      this.emitStageEvent(emitter, 'stage.failed', 'validation', parsed.reason);
      this.recordRunAlone(ctx, { ...worker.run, error: parsed.reason });
      return {
        kind: 'escalated',
        escalation: {
          reason: EscalationReason.UNPARSEABLE_REPRO,
          message: parsed.reason,
          attempt,
          artifactPath: ctx.artifactAbsPath,
        },
      };
    }

    const red = this.checkRegistry.reproCheck(parsed.command, 'red');
    const stage = await this.performChecks(ctx, attempt, [red], 'shell', () => null);
    const outputTail = stage.results[0]!.outputTail;
    this.recordRunAlone(ctx, worker.run);
    if (stage.failed) {
      const message = `The test does not reproduce the bug: \`${parsed.command}\` ${stage.failed.timedOut ? 'timed out' : 'exited 0'} before any fix.`;
      this.emitStageEvent(emitter, 'stage.failed', 'checks', message);
      this.gitGateway.commitFiles(
        aeosDir,
        stage.files,
        `[${ticketId}][RUN][${stage.runId}][checks][${stage.record.exit}]`,
      );
      return {
        kind: 'checks-failed',
        check: red.name,
        output: `# ${message}\n\nA reproducing test fails until the bug is fixed. Change the test so that it does, and do not fix the bug yet.\n\n\`\`\`\n${outputTail}\n\`\`\`\n`,
      };
    }
    this.emitStageEvent(emitter, 'stage.completed', 'checks', 'The test fails: bug reproduced');

    const files = this.gitGateway
      .changedFiles(projectPath)
      .filter((file) => !file.startsWith('.aeos/'));
    const state: ReproState = {
      command: parsed.command,
      red: { exitCode: red.exitCode, outputTail },
      files: this.fileHasher.sha256(projectPath, files),
    };
    this.gitGateway.commitFiles(
      projectPath,
      files.map((file) => path.join(projectPath, file)),
      `[${ticketId}][REPRO] failing test that reproduces the bug`,
    );
    const stateFilename = `${ticketId}-repro.json`;
    this.artifactStore.writeArtifact(
      projectPath,
      ticketId,
      stateFilename,
      `${JSON.stringify(state, null, 2)}\n`,
    );
    this.gitGateway.commitFiles(
      aeosDir,
      [path.join(aeosDir, 'tickets', ticketId, stateFilename), ...stage.files],
      `[${ticketId}][RUN][${stage.runId}][checks][${stage.record.exit}]`,
    );
    return state;
  }

  /**
   * After the fix: the same command must now pass. Writes `<id>-repro.md` and
   * returns the files to commit with the artefact, or the rejection.
   */
  private async proveFixed(
    ctx: RunContext,
    attempt: number,
    repro: ReproState,
  ): Promise<string[] | AttemptOutcome> {
    const { emitter, ticketId, projectPath, aeosDir } = ctx;
    const evidenceFilename = `${ticketId}-repro.md`;
    const green = this.checkRegistry.reproCheck(repro.command, 'green');
    const stage = await this.performChecks(ctx, attempt, [green], 'shell', (failed) =>
      failed ? null : evidenceFilename,
    );
    const outputTail = stage.results[0]!.outputTail;
    if (stage.failed) {
      const message = `The reproducing test still fails after the fix: \`${repro.command}\` ${stage.describe(stage.failed)}.`;
      this.emitStageEvent(emitter, 'stage.failed', 'checks', message);
      this.gitGateway.commitFiles(
        aeosDir,
        stage.files,
        `[${ticketId}][RUN][${stage.runId}][checks][${stage.record.exit}]`,
      );
      return {
        kind: 'checks-failed',
        check: green.name,
        output: `# ${message}\n\nFix this before anything else, without editing the test. The reviewer was not asked.\n\n\`\`\`\n${outputTail}\n\`\`\`\n`,
      };
    }
    this.artifactStore.writeArtifact(
      projectPath,
      ticketId,
      evidenceFilename,
      linkToRun(renderReproEvidence(repro, { exitCode: green.exitCode, outputTail }), stage.runId),
    );
    this.emitStageEvent(emitter, 'stage.completed', 'checks', 'The test passes: bug fixed');
    return [path.join(aeosDir, 'tickets', ticketId, evidenceFilename), ...stage.files];
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
    const { results, failed, describe, runId, record, files } = await this.performChecks(
      ctx,
      attempt,
      checks,
      'shell',
      // A failed stage writes no table.
      (failed) => (failed ? null : checksFilename),
    );

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

  /**
   * The checks that run before any agent. They pass, or the run escalates: a
   * worker that has not run has nothing to fix. Either way the files a check
   * wrote are committed with the stage's run record.
   */
  private async runPreWorkerChecks(
    ctx: RunContext,
    checks: readonly Check[],
  ): Promise<Escalation | null> {
    const { emitter, ticketId } = ctx;
    const inTicketDir = (filename: string): string =>
      path.join(ctx.aeosDir, 'tickets', ticketId, filename);
    const { results, failed, describe, runId, record, files } = await this.performChecks(
      ctx,
      1,
      checks,
      'in-process',
      (_failed, last) => last.artifacts?.[0] ?? null,
    );
    this.gitGateway.commitFiles(
      ctx.aeosDir,
      [...results.flatMap((result) => result.artifacts ?? []).map(inTicketDir), ...files],
      `[${ticketId}][RUN][${runId}][checks][${record.exit}]`,
    );
    if (!failed) {
      this.emitStageEvent(emitter, 'stage.completed', 'checks', 'Checks passed');
      return null;
    }
    const report = failed.artifacts?.[0];
    const message = `Check '${failed.name}' ${describe(failed)} before any agent ran. A worker cannot fix this; it needs your decision.${report ? ` Read ${report}.` : ''}`;
    this.emitStageEvent(emitter, 'stage.failed', 'checks', message);
    return {
      reason: EscalationReason.PRE_WORKER_CHECK_FAILED,
      message,
      artifactPath: report ? inTicketDir(report) : undefined,
    };
  }

  /**
   * Runs the checks in order, stopping at the first failure, and writes the
   * stage's run record. `outputOf` names the file in the ticket directory the
   * record points at.
   */
  private async performChecks(
    ctx: RunContext,
    attempt: number,
    checks: readonly Check[],
    executor: 'shell' | 'in-process',
    outputOf: (failed: CheckResult | undefined, last: CheckResult) => string | null,
    role: 'checks' | 'generator' = 'checks',
  ): Promise<{
    results: CheckResult[];
    failed: CheckResult | undefined;
    describe: (result: CheckResult) => string;
    runId: string;
    record: RunRecord;
    files: string[];
  }> {
    const { emitter, ticketId, projectPath } = ctx;
    const isGenerator = role === 'generator';
    this.emitStageEvent(
      emitter,
      'stage.started',
      'checks',
      isGenerator ? `Running generator ${checks[0]!.name}` : `Running ${checks.length} check(s)`,
    );

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

    const outputFile = outputOf(failed, results.at(-1)!);
    const output = outputFile ? `tickets/${ticketId}/${outputFile}` : null;
    const runId = this.newRunId(startedAt);
    const record: RunRecord = {
      schema_version: 0,
      run_id: runId,
      project: ctx.projectId,
      ticket: ticketId,
      column: ctx.column,
      role,
      agent: null,
      attempt,
      executor,
      model: null,
      mode: null,
      brief: null,
      output,
      transcript: runRecordPaths(ticketId, runId).transcript,
      verdict: isGenerator ? null : failed ? 'CHECKS_FAILED' : 'CHECKS_PASSED',
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      duration_ms: endedAt.getTime() - startedAt.getTime(),
      exit: !failed ? 'ok' : failed.timedOut ? 'timeout' : 'failed',
      usage: null,
      cost_usd: 0,
      cost_basis: 'none',
      spec_pin: ctx.specPin,
      error: failed
        ? `${isGenerator ? 'Generator' : 'Check'} '${failed.name}' ${describe(failed)}`
        : null,
    };
    const files = this.runRecordStore.write(projectPath, record, {
      transcript: results
        .map(
          (result) =>
            `## ${result.name}: ${describe(result)} (${result.durationMs}ms)\n\n${result.outputTail}\n`,
        )
        .join('\n'),
    });

    return { results, failed, describe, runId, record, files };
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
      ctx.columnSpec.diffContext ?? 'none',
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

    const reviewerPrompt = this.buildPromptFn(
      this.withCriteriaClaims(ctx, enrichedContext),
      ctx.reviewerAgentSpec,
    );
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
   * Keeps a task's commits off the default branch: a child task goes onto its
   * epic's `aeos/<epicId>` branch, a standalone task onto its own, each with
   * its base tag, as the orchestrator gives an epic.
   */
  private isolateTask(projectPath: string, ticket: Ticket): void {
    if (
      ticket.kind !== TicketKind.TASK ||
      process.env.AEOS_GIT_ISOLATION === 'none' ||
      !this.gitGateway.isRepo(projectPath)
    ) {
      return;
    }
    const owner = ticket.parentId ?? ticket.id;
    this.gitGateway.ensureOnBranch(projectPath, `aeos/${owner}`);
    this.gitGateway.tagHere(projectPath, `aeos-base/${owner}`);
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

  /**
   * For the reviewer of a spec-backed epic's decomposition: which criteria no
   * task claims, so an unowned criterion is rejected here and not at integration.
   */
  private withCriteriaClaims(ctx: RunContext, context: AssembledContext): AssembledContext {
    if (ctx.columnSpec.role !== 'decomposition' || !ctx.specPin) return context;
    const trace = this.criteriaCollector.collect(
      ctx.projectPath,
      { id: ctx.ticketId, projectId: ctx.projectId },
      ctx.specPin,
    );
    const list = (items: string[]): string => (items.length > 0 ? items.join(', ') : 'none');
    return this.withExtraArtifact(
      context,
      'criteria-claims.md',
      [
        '# Criteria claims',
        '',
        'Every acceptance criterion of the spec must be claimed by a task (`aeos ticket create --implements`). Reject the breakdown while a criterion is unclaimed or a task claims an id the spec does not contain.',
        '',
        `- Unclaimed: ${list(trace.unclaimed)}`,
        `- Unknown claims: ${list(trace.unknownClaims.map((claim) => `${claim.taskId} claims ${claim.id}`))}`,
      ].join('\n'),
    );
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
   * was already uncommitted before the run goes unseen. `project init` commits
   * its scaffold, so that is an operator's own uncommitted edit; compare
   * content hashes if operators keep such files dirty.
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
