// CLI command — aeos ticket dod-approve

import type { Handlers } from '../generated/commands.gen.js';
import { done, failed, stopped } from '../result.js';
import { formatCostUsd } from '../../domain/model/cost-record.js';
import { renderConformanceTable } from '../../domain/services/conformance-builder.js';

export const ticketDodApprove: Handlers['ticketDodApprove'] = async (
  { id: ticketId },
  options,
  context,
) => {
  const { projectPath, prompt } = context;

  // The release decision is a person's. With no terminal there is nobody to
  // ask, and there is no --yes: nothing is reviewed and nothing is recorded.
  if (!prompt.interactive) {
    return stopped(
      'gate-refused',
      'CONFIRMATION_REQUIRED',
      `Approving ${ticketId} as done is a person's decision, and stdin is not a terminal. Run \`aeos ticket dod-approve ${ticketId}\` at one.`,
    );
  }

  const project = context.container.projectRepo.read(projectPath);
  const useCase = context.container.ticketDodApprove;

  // 1. What is being decided: a verdict per criterion, then the pull request.
  const verified = options.verified ?? [];
  const shown = await useCase.review(project.id, projectPath, ticketId, verified);
  if (!shown.ok) return failed(shown.error);
  const { report, prUrl } = shown.review;
  const review = [
    ...(report
      ? [`\n── Conformance ────────────────────────────────\n`, renderConformanceTable(report), '']
      : []),
    `Pull request: ${prUrl ?? 'none'}\n`,
  ];

  // 2. Ask for the decision, under what it is about
  const answer = await prompt.ask(
    `${review.join('\n')}\nApprove ticket ${ticketId} as DONE? [y/N] `,
  );
  const approved = answer.toLowerCase() === 'y';
  // A no is recorded as a gate decision, and a rejection needs its reason.
  const reason =
    approved || options.reason
      ? options.reason
      : await prompt.ask('Why not? (recorded with the decision, at least ten characters) ');

  // 3. Execute use case
  const result = useCase.execute(project.id, projectPath, ticketId, approved, reason, shown.review);
  if (result.status === 'error') return failed(result.error);

  const { pass = 0, fail = 0, unverified = 0, total = 0 } = report?.summary ?? {};
  // Every decision made here is recorded before it is returned.
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
};
