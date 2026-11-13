// CLI command — aeos ticket dod-approve

import type { Handlers } from '../generated/commands.gen.js';
import { done, failed, stopped } from '../result.js';
import { formatCostUsd } from '../../domain/model/cost-record.js';
import { renderConformanceTable } from '../../domain/services/conformance-builder.js';
import type { ConformanceReport } from '../../domain/model/conformance-report.js';
import type {
  DodReview,
  TicketDodApproveResult,
} from '../../domain/ports/driving/ticket-dod-approve.port.js';
import type { CommandResult } from '../result.js';
import type { TicketDodApproveData } from '../generated/types.gen.js';

/** What is being decided: the conformance table, then the pull request. */
function reviewLines({ report, prUrl }: DodReview): string[] {
  return [
    ...(report
      ? [`\n── Conformance ────────────────────────────────\n`, renderConformanceTable(report), '']
      : []),
    `Pull request: ${prUrl ?? 'none'}\n`,
  ];
}

/** The decision envelope, once `execute` has recorded (or refused) a decision. */
function finish(
  result: TicketDodApproveResult,
  report: ConformanceReport | null,
): CommandResult<TicketDodApproveData> {
  if (result.status === 'error') return failed(result.error);
  const { pass = 0, fail = 0, unverified = 0, total = 0 } = report?.summary ?? {};
  const data = {
    ticketId: result.ticketId,
    approved: result.status === 'approved',
    conformance: { pass, fail, unverified, total },
    gateRecordId: result.gateRecordId,
  };
  if (result.status === 'cancelled') {
    return done(data, 'DoD approval declined; the decision is recorded.');
  }
  return done(
    data,
    `✓ Ticket ${result.ticketId} approved: DOD_GATE → DONE (total cost: ${formatCostUsd(result.totalCostUsd)})`,
    result.warning ? [{ code: 'PULL_REQUEST_NOT_UPDATED', message: result.warning }] : [],
  );
}

export const ticketDodApprove: Handlers['ticketDodApprove'] = async (
  { id: ticketId },
  options,
  context,
) => {
  const { projectPath, prompt } = context;

  const project = context.container.projectRepo.read(projectPath);
  const useCase = context.container.ticketDodApprove;

  // The real reason first: a ticket that cannot be decided here is not waiting
  // for a terminal.
  const refusal = useCase.refusal(project.id, projectPath, ticketId);
  if (refusal) return failed(refusal);

  const verified = options.verified ?? [];

  // --dry-run previews the report, the pull request and the review hash,
  // reachable from a caller with no terminal (web, scripts), and records
  // nothing.
  if (options.dryRun) {
    const shown = await useCase.review(project.id, projectPath, ticketId, verified);
    if (!shown.ok) return failed(shown.error);
    // The generated JSON type mirrors the same shape with mutable arrays.
    return done(shown.review as TicketDodApproveData, reviewLines(shown.review).join('\n'));
  }

  // --decision is the non-interactive path: the caller already saw the
  // report through --dry-run and proves it still holds with --review-hash.
  if (options.decision) {
    const shown = await useCase.review(project.id, projectPath, ticketId, verified);
    if (!shown.ok) return failed(shown.error);
    if (shown.review.report && shown.review.reviewHash !== options.reviewHash) {
      return stopped(
        'gate-refused',
        'CONFORMANCE_CHANGED',
        `The conformance report for ${ticketId} changed since it was reviewed. Run --dry-run again before deciding.`,
      );
    }
    const result = useCase.execute(
      project.id,
      projectPath,
      ticketId,
      options.decision === 'approve',
      options.reason,
      shown.review,
    );
    return finish(result, shown.review.report);
  }

  // The release decision is a person's. With no terminal there is nobody to
  // ask, and there is no --yes: nothing is reviewed and nothing is recorded.
  if (!prompt.interactive) {
    return stopped(
      'gate-refused',
      'CONFIRMATION_REQUIRED',
      `Approving ${ticketId} as done is a person's decision, and stdin is not a terminal. Run \`aeos ticket dod-approve ${ticketId}\` at one.`,
    );
  }

  // 1. What is being decided: a verdict per criterion, then the pull request.
  const shown = await useCase.review(project.id, projectPath, ticketId, verified);
  if (!shown.ok) return failed(shown.error);

  // 2. Ask for the decision, under what it is about
  const answer = await prompt.ask(
    `${reviewLines(shown.review).join('\n')}\nApprove ticket ${ticketId} as DONE? [y/N] `,
  );
  const approved = answer.toLowerCase() === 'y';
  // A no is recorded as a gate decision, and a rejection needs its reason.
  const reason =
    approved || options.reason
      ? options.reason
      : await prompt.ask('Why not? (recorded with the decision, at least ten characters) ');

  // 3. Execute use case
  const result = useCase.execute(project.id, projectPath, ticketId, approved, reason, shown.review);
  return finish(result, shown.review.report);
};
