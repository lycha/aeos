// Use case — TicketRun (orchestration: preflight → executor → validate → review → sign-off)

import * as path from 'node:path';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { Executor } from '../domain/ports/driven/executor.port.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type { ColumnSpecLoader } from '../domain/ports/driven/column-spec-loader.port.js';
import type { AgentSpecLoader } from '../domain/ports/driven/agent-spec-loader.port.js';
import type { RubricLoader } from '../domain/ports/driven/rubric-loader.port.js';
import type { StateMachineService } from '../domain/services/state-machine.js';
import type { ContextAssembler } from './services/context-assembler.js';
import type { PreflightService } from './services/preflight.js';
import type { AgentSpec } from '../domain/model/agent-spec.js';
import type { AssembledContext } from '../domain/model/assembled-context.js';
import type { TicketRunPort, TicketRunResult } from '../domain/ports/driving/ticket-run.port.js';
import { Column } from '../domain/model/column.js';
import { validateOutput } from '../domain/services/output-validation.js';
import { isValidColumn } from '../domain/model/column.js';

export class TicketRunUseCase implements TicketRunPort {
  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly stateMachine: StateMachineService,
    private readonly contextAssembler: ContextAssembler,
    private readonly buildPromptFn: (context: AssembledContext, agentSpec: AgentSpec) => string,
    private readonly executor: Executor,
    private readonly artifactStore: ArtifactStore,
    private readonly gitGateway: GitGateway,
    private readonly columnSpecLoader: ColumnSpecLoader,
    private readonly agentSpecLoader: AgentSpecLoader,
    private readonly rubricLoader: RubricLoader,
    private readonly preflight: PreflightService,
  ) {}

  async execute(
    projectId: string,
    projectPath: string,
    ticketId: string,
  ): Promise<TicketRunResult> {
    // 1. Load ticket and verify runnable state
    const ticket = this.ticketRepo.findById(projectId, ticketId);
    if (!ticket) {
      return { status: 'failed', ticketId, error: `Ticket ${ticketId} not found` };
    }

    if (ticket.column === Column.BACKLOG || ticket.column === Column.DONE) {
      return {
        status: 'failed',
        ticketId,
        error: `Cannot run ticket in ${ticket.column} — no column spec`,
      };
    }
    if (ticket.column === Column.DOD_GATE) {
      return { status: 'failed', ticketId, error: 'DoD gate is human-only' };
    }
    if (ticket.subState === 'WORKING') {
      return { status: 'failed', ticketId, error: 'Ticket is already running' };
    }
    if (ticket.subState === 'BLOCKED') {
      return {
        status: 'blocked',
        ticketId,
        blockers: ['Ticket is blocked — run `aeos ticket answer` first'],
      };
    }

    // 2. Load column spec and agent specs
    const columnSpec = this.columnSpecLoader.load(ticket.column, projectPath);
    const workerAgentSpec = this.agentSpecLoader.load(columnSpec.workerAgentFile, projectPath);
    const reviewerAgentSpec = this.agentSpecLoader.load(columnSpec.reviewerAgentFile, projectPath);

    // 2b. Resolve column early — return typed result on invalid value
    const column = this.resolveColumn(columnSpec.column);
    if (!column) {
      return {
        status: 'failed',
        ticketId,
        error: `Invalid column value: ${columnSpec.column}`,
      };
    }

    // 3. Run pre-flight
    const ticketFilename = `${ticketId}-ticket.md`;
    const ticketContent = this.artifactStore.readArtifact(projectPath, ticketId, ticketFilename);
    const preflightResult = await this.preflight.run(
      ticketId,
      projectId,
      projectPath,
      ticketContent,
      columnSpec,
    );
    if (preflightResult.blocked) {
      return {
        status: 'blocked',
        ticketId,
        blockers: [`Preflight questions written to ${preflightResult.questionsPath}`],
      };
    }

    // 4. Set sub-state to WORKING
    const workingResult = this.stateMachine.setSubState(projectId, ticketId, 'WORKING');
    if (!workingResult.ok) {
      return {
        status: 'failed',
        ticketId,
        error: `Failed to set WORKING state: ${workingResult.reason}`,
      };
    }

    // 5. Assemble context
    const assembledContext = await this.contextAssembler.assemble(ticketId, projectPath);

    // 6. Build prompt
    const prompt = this.buildPromptFn(assembledContext, workerAgentSpec);

    // Derive artifact filename
    const artifactFilename = `${ticketId}-${columnSpec.outputArtifact}`;
    const aeosDir = path.join(projectPath, '.aeos');
    const artifactAbsPath = path.join(aeosDir, 'tickets', ticketId, artifactFilename);

    // 7. Run executor
    const executorResult = await this.executor.run({
      prompt,
      outputPath: artifactAbsPath,
      ticketId,
      column,
    });

    // 8. Handle executor failure
    if (!executorResult.ok) {
      this.artifactStore.removeArtifact(projectPath, ticketId, artifactFilename);
      this.stateMachine.setSubState(projectId, ticketId, 'FAILED');
      return { status: 'failed', ticketId, error: `Executor failed: ${executorResult.reason}` };
    }

    const content = executorResult.content ?? '';

    // 9. Validate output
    const validation = validateOutput(content, columnSpec);
    if (!validation.passed) {
      this.artifactStore.removeArtifact(projectPath, ticketId, artifactFilename);
      this.stateMachine.setSubState(projectId, ticketId, 'FAILED');
      return {
        status: 'failed',
        ticketId,
        error: `Output validation failed: ${validation.violations.join('; ')}`,
      };
    }

    // 10. Persist worker artifact and commit
    this.artifactStore.writeArtifact(projectPath, ticketId, artifactFilename, content);
    this.gitGateway.commitFiles(
      aeosDir,
      [artifactAbsPath],
      `[${ticketId}][${columnSpec.outputArtifact}][v1][${workerAgentSpec.name}][create]`,
    );

    // 11. Run reviewer agent
    const reviewFilename = `${ticketId}-${columnSpec.outputArtifact.replace('.md', '-review.md')}`;
    const reviewAbsPath = path.join(aeosDir, 'tickets', ticketId, reviewFilename);

    // 11a. Load rubric files via driven port
    const rubricContents: string[] = [];
    for (const rubricPath of columnSpec.reviewerRubrics) {
      const content = await this.rubricLoader.load(rubricPath, projectPath);
      if (content !== null) {
        rubricContents.push(content);
      }
    }

    // 11b. Re-assemble context (now includes the newly written artifact)
    const reviewContext = await this.contextAssembler.assemble(ticketId, projectPath);

    // 11c. Include rubric content in prior artifacts (immutable spread — m4)
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

    // 11d. Build reviewer prompt
    const reviewerPrompt = this.buildPromptFn(enrichedContext, reviewerAgentSpec);

    // 11e. Run reviewer executor
    const reviewResult = await this.executor.run({
      prompt: reviewerPrompt,
      outputPath: reviewAbsPath,
      ticketId,
      column,
    });

    if (reviewResult.ok) {
      const reviewContent = reviewResult.content ?? '';
      // 11g. Write review artifact
      this.artifactStore.writeArtifact(projectPath, ticketId, reviewFilename, reviewContent);
      // 11h. Commit review
      this.gitGateway.commitFiles(
        aeosDir,
        [reviewAbsPath],
        `[${ticketId}][REVIEW][v1][reviewer-agent][create]`,
      );
    }

    // 12. Set sub-state to IN_REVIEW
    this.stateMachine.setSubState(projectId, ticketId, 'IN_REVIEW');

    // 13. Auto sign-off (v1)
    this.stateMachine.setSubState(projectId, ticketId, 'SIGNED_OFF');

    // 14. Return success
    return {
      status: 'success',
      ticketId,
      artifactPath: artifactAbsPath,
      reviewPath: reviewAbsPath,
    };
  }

  private resolveColumn(columnString: string): Column | null {
    if (isValidColumn(columnString)) {
      return columnString;
    }
    return null;
  }
}
