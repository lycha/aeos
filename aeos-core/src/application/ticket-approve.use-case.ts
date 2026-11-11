// Use case — TicketApprove (advance column)

import { Column, columnOrderFor, nextColumnFor } from '../domain/model/column.js';
import { SubState } from '../domain/model/sub-state.js';
import { TicketKind } from '../domain/model/ticket-kind.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { PullRequestGateway } from '../domain/ports/driven/pull-request-gateway.port.js';
import type { CostRepository } from '../domain/ports/driven/cost-repository.port.js';
import type { ColumnSpecLoader } from '../domain/ports/driven/column-spec-loader.port.js';
import type { PipelineLoader } from '../domain/ports/driven/pipeline-loader.port.js';
import type { ProjectRepository } from '../domain/ports/driven/project-repository.port.js';
import type { Ticket } from '../domain/model/ticket.js';
import type { ColumnSpec } from '../domain/model/column-spec.js';
import { columnSpecOf, findColumnSpec } from './services/column-roles.js';
import { parseVerdict } from '../domain/services/verdict-parser.js';
import type { StateMachineService } from '../domain/services/state-machine.js';
import type {
  TicketApprovePort,
  TicketApproveResult,
} from '../domain/ports/driving/ticket-approve.port.js';
import type { GateRecorder } from './services/gate-recorder.js';
import { syncTicketDocument } from './services/ticket-document.js';
import { buildPullRequestBody, buildTaskCommitMessage } from './services/pull-request-text.js';
import { formatSpecPin, resolveSpecPin } from './services/spec-pin.js';

export class TicketApproveUseCase implements TicketApprovePort {
  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly artifactStore: ArtifactStore,
    private readonly stateMachine: StateMachineService,
    private readonly gitGateway: GitGateway,
    private readonly pullRequestGateway: PullRequestGateway,
    private readonly costRepo: CostRepository,
    private readonly columnSpecLoader: ColumnSpecLoader,
    private readonly projectRepo: ProjectRepository,
    private readonly gateRecorder: GateRecorder,
    private readonly pipelineLoader: PipelineLoader,
  ) {}

  execute(
    projectId: string,
    projectPath: string,
    ticketId: string,
    options: { byEngine?: boolean; contract?: boolean } = {},
  ): TicketApproveResult {
    const ticket = this.ticketRepo.findById(projectId, ticketId);
    if (!ticket) {
      return { status: 'error', ticketId, error: `Ticket ${ticketId} not found` };
    }

    // Asked first: a finished ticket has no sub-state, so it is never "not signed off".
    if (ticket.column === Column.DONE) {
      return { status: 'already_done', ticketId };
    }

    // BACKLOG tickets can advance without sign-off (no agent pipeline in BACKLOG).
    // All other columns require SIGNED_OFF from the agent pipeline.
    const isBacklog = ticket.column === Column.BACKLOG;
    if (!isBacklog && ticket.subState !== SubState.SIGNED_OFF) {
      const stateDescription =
        ticket.subState === null ? `${ticket.column} (no sub-state)` : ticket.subState;
      return {
        status: 'error',
        ticketId,
        error: `Ticket ${ticketId} is not signed off (current state: ${stateDescription}). Run 'aeos ticket run ${ticketId}' or 'aeos ticket sign-off ${ticketId}' first.`,
      };
    }

    const currentColumn = ticket.column;

    // An epic is reviewed against its pinned spec. One created before pins has
    // none, and would reach the spec-review column with nothing to review.
    if (isBacklog && ticket.kind === TicketKind.EPIC && !ticket.specPin) {
      return {
        status: 'error',
        ticketId,
        error: `Epic ${ticketId} has no spec. An epic is now built from a spec a person wrote: write one with the spec skills (prototype-harvest, gap-interrogation-solo or gap-interrogation-capture, spec-writer), create a new epic with "aeos ticket create <title> --spec <feature>", and close this one with "aeos ticket move".`,
      };
    }

    // What this column is for decides what leaving it means: never its name.
    const columnSpec = columnSpecOf(this.columnSpecLoader, projectPath, currentColumn);
    const role = columnSpec?.role ?? 'standard';

    // The epic join: an epic leaving its decomposition column is claiming its
    // children are finished. Verify that rather than trusting it.
    if (ticket.kind === TicketKind.EPIC && role === 'decomposition') {
      const children = this.ticketRepo.findChildren(projectId, ticketId);
      const unfinished = children.filter((child) => child.column !== Column.DONE);
      if (unfinished.length > 0) {
        const summary = unfinished
          .map((child) => `${child.id} (${child.column})`)
          .slice(0, 5)
          .join(', ');
        const overflow = unfinished.length > 5 ? `, and ${unfinished.length - 5} more` : '';
        return {
          status: 'error',
          ticketId,
          error: `Epic ${ticketId} has ${unfinished.length} unfinished task(s): ${summary}${overflow}. Finish them before advancing the epic.`,
        };
      }
    }

    const nextColumn = nextColumnFor(
      this.pipelineLoader.load(projectPath),
      ticket.kind,
      currentColumn,
    );
    if (!nextColumn) {
      return {
        status: 'error',
        ticketId,
        error: `Ticket ${ticketId} is a ${ticket.kind} in ${currentColumn}, which has no next column in that pipeline.`,
      };
    }

    const byPerson = !options.byEngine;

    // The contract gate always has a person: the engine is refused whatever it
    // passes, and a person is shown what they would be approving.
    const contractChange = ticket.contractChange?.approvedBy ? null : ticket.contractChange;
    if (contractChange && !(byPerson && options.contract)) {
      const paths = contractChange.paths.join(', ');
      // shortcut: the diff against HEAD, which is the whole change until the
      // task is committed at DONE; a path committed earlier shows as empty.
      const diff = byPerson ? this.gitGateway.diff(projectPath, contractChange.paths).trim() : '';
      return {
        status: 'error',
        ticketId,
        error: `Ticket ${ticketId} carries a contract change: ${paths}. A contract is changed only with a person's approval: review it, then run \`aeos ticket approve ${ticketId} --contract\`.${diff ? `\n\n${diff}` : ''}`,
      };
    }

    // A person's approval is a gate decision. Who they are is asked now, before
    // anything is committed or pushed; the record itself is written last, so a
    // pull request that cannot be opened leaves no approval on record.
    if (byPerson) this.gateRecorder.decidedBy(projectPath);

    // A finished task's work becomes one commit in the source repo. This is the
    // only point it is safe to commit: CODE_REVIEW reads `git diff HEAD`, so
    // committing any earlier would leave the reviewer with nothing to review.
    // One commit per task also keeps the next task's diff free of this one's
    // changes. Epics are skipped — they produce artifacts, not code.
    const taskFinished = nextColumn === Column.DONE && ticket.kind === TicketKind.TASK;
    if (taskFinished) {
      const specPin = resolveSpecPin(this.ticketRepo, ticket);
      this.gitGateway.commitAll(
        projectPath,
        buildTaskCommitMessage(ticket, [
          ...(specPin ? ([['Spec', formatSpecPin(specPin)]] as const) : []),
          ...(ticket.implements?.length
            ? ([['Implements', ticket.implements.join(', ')]] as const)
            : []),
        ]),
      );
    }

    // Before the transition, so a pull request that cannot be opened leaves the
    // ticket SIGNED_OFF and re-running approve retries it.
    const opensPullRequest =
      (ticket.kind === TicketKind.EPIC && role === 'integration') ||
      (taskFinished && ticket.parentId === null);
    if (
      opensPullRequest &&
      this.projectRepo.readExecutorConfig(projectPath)?.pullRequests?.enabled !== false
    ) {
      const error = this.openPullRequest(projectId, projectPath, ticket, columnSpec);
      if (error) return { status: 'error', ticketId, error };
    }

    if (contractChange) {
      const { id } = this.gateRecorder.record(projectPath, ticket, {
        gate: 'contract',
        verdict: 'approved',
        reason: `Contract change: ${contractChange.paths.join(', ')}`,
      });
      this.ticketRepo.setContractChange(projectId, ticketId, { ...contractChange, approvedBy: id });
    }

    let gateRecordId: string | undefined;
    if (byPerson) {
      gateRecordId = this.gateRecorder.record(projectPath, ticket, {
        gate: role === 'spec-review' ? 'spec' : 'column-approval',
        verdict: 'approved',
        fromColumn: currentColumn,
        toColumn: nextColumn,
      }).id;
    }

    const transitionResult = this.stateMachine.transition(projectId, ticketId, nextColumn);
    if (!transitionResult.ok) {
      return { status: 'error', ticketId, error: transitionResult.reason };
    }

    // A new column awaits its first `ticket run`; DONE has no sub-state, and
    // the transition has already cleared it.
    const nextSubState = nextColumn === Column.DONE ? null : SubState.READY;
    if (nextSubState) {
      const subStateResult = this.stateMachine.setSubState(projectId, ticketId, nextSubState);
      if (!subStateResult.ok) {
        return {
          status: 'error',
          ticketId,
          error: `Failed to set READY state: ${subStateResult.reason}`,
        };
      }
    }

    // Mirrored to disk; SQLite is authoritative for column and sub-state, so
    // the advance is not committed to git.
    syncTicketDocument(this.artifactStore, projectPath, {
      ...ticket,
      column: nextColumn,
      subState: nextSubState,
    });

    return {
      status: 'advanced',
      ticketId,
      fromColumn: currentColumn,
      toColumn: nextColumn,
      pullRequestUrl: this.ticketRepo.findById(projectId, ticketId)?.prUrl ?? null,
      ...(gateRecordId ? { gateRecordId } : {}),
    };
  }

  /**
   * Pushes the ticket's `aeos/<id>` branch and opens its pull request against
   * the default branch. Returns the needs-human message when it cannot.
   */
  private openPullRequest(
    projectId: string,
    projectPath: string,
    ticket: Ticket,
    columnSpec: ColumnSpec | null,
  ): string | null {
    const needsHuman = (cause: string): string =>
      `Cannot open a pull request for ${ticket.id}: ${cause} The ticket stays SIGNED_OFF; once that is fixed, re-run \`aeos ticket approve ${ticket.id}\`. For a project without pull requests, set "pullRequests": { "enabled": false } in .aeos/project.json.`;

    const availability = this.pullRequestGateway.isAvailable(projectPath);
    if (!availability.ok) return needsHuman(availability.reason ?? 'no reason given.');

    const head = `aeos/${ticket.id}`;
    try {
      if (this.pullRequestGateway.needsPush && this.gitGateway.hasRemote(projectPath)) {
        this.gitGateway.push(projectPath, head);
      }
      const { url } = this.pullRequestGateway.create({
        cwd: projectPath,
        base: this.gitGateway.defaultBranch(projectPath),
        head,
        title: `[${ticket.id}] ${ticket.title}`,
        body: this.pullRequestBody(projectId, projectPath, ticket, columnSpec),
      });
      this.ticketRepo.setPrUrl(projectId, ticket.id, url);
      return null;
    } catch (err) {
      return needsHuman(`${err instanceof Error ? err.message : String(err)}.`);
    }
  }

  private pullRequestBody(
    projectId: string,
    projectPath: string,
    ticket: Ticket,
    /** The spec of the column being left. */
    columnSpec: ColumnSpec | null,
  ): string {
    const isEpic = ticket.kind === TicketKind.EPIC;
    const read = (filename: string): string | null =>
      this.artifactStore.artifactExists(projectPath, ticket.id, filename)
        ? this.artifactStore.readArtifact(projectPath, ticket.id, filename)
        : null;

    // An epic cites the review of the integration column it is leaving; a task,
    // the review of the column that was given its diff.
    const reviewSpec = isEpic
      ? columnSpec
      : findColumnSpec(
          this.columnSpecLoader,
          projectPath,
          columnOrderFor(this.pipelineLoader.load(projectPath), ticket.kind),
          (spec) => spec.diffContext === 'task',
        );
    const reviewArtifact = reviewSpec ? `${ticket.id}-${reviewSpec.outputArtifact}` : null;
    const reviewersVerdict = parseVerdict(
      (reviewArtifact && read(reviewArtifact.replace('.md', '-review.md'))) ?? '',
    );
    const checksTable = (read(`${ticket.id}-checks.md`) ?? '')
      .split('\n')
      .filter((line) => line.startsWith('|'))
      .join('\n');

    const tickets = [ticket, ...this.ticketRepo.findChildren(projectId, ticket.id)];
    const ticketIds = tickets.map((each) => each.id);
    return buildPullRequestBody({
      ticketId: ticket.id,
      title: ticket.title,
      reviewLabel: isEpic ? 'Integration review' : 'Code review',
      reviewPath:
        reviewArtifact && read(reviewArtifact) !== null
          ? `.aeos/tickets/${ticket.id}/${reviewArtifact}`
          : null,
      reviewSummary: reviewersVerdict.ok
        ? `${reviewersVerdict.verdict.verdict}, ${reviewersVerdict.verdict.blockers} blockers, ${reviewersVerdict.verdict.warnings} warnings`
        : null,
      checksTable: checksTable || null,
      costs: ticketIds.flatMap((id) =>
        this.costRepo.findByTicket(projectId, id).map((record) => record.costUsd),
      ),
      specPin: resolveSpecPin(this.ticketRepo, ticket),
      repro: read(`${ticket.id}-repro.md`),
      contractChanges: tickets.flatMap((each) =>
        (each.contractChange?.paths ?? []).map((changed) => ({
          path: changed,
          ticketId: each.id,
          // Null only for the ticket being approved now, with `--contract`.
          approvedBy: each.contractChange?.approvedBy ?? null,
        })),
      ),
    });
  }
}
