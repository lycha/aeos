// CLI command — aeos ticket run

import type { Handlers } from '../generated/commands.gen.js';
import { classify } from '../error-codes.js';
import { done, stopped, type Warning } from '../result.js';
import { escalationOf } from '../ticket-data.js';
import { withColumnLabels } from '../../domain/services/column-labels.js';
import { createJsonLinesDisplay, createTicketRunDisplay } from '../ui/ticket-run-display.js';

export const ticketRun: Handlers['ticketRun'] = async ({ id: ticketId }, options, context) => {
  const { projectPath, container } = context;

  const project = container.projectRepo.read(projectPath);
  const ticketRunUseCase = container.ticketRun;
  const labels = container.columnLabels(projectPath);
  const display = options.json
    ? createJsonLinesDisplay()
    : createTicketRunDisplay(process.stdout, (column) => withColumnLabels(column, labels));

  // What the ticket has before the run, so the result can say what this run added.
  const show = () => container.ticketShow.execute({ projectId: project.id, ticketId, projectPath });
  const before = show();

  if (!options.json && !display.live) {
    // eslint-disable-next-line no-console
    console.log(`Running ticket ${ticketId}…`);
  }

  const interruptHandler = () => {
    display.requestInterrupt();
    void ticketRunUseCase.interrupt().catch(() => undefined);
  };

  display.start();
  process.once('SIGINT', interruptHandler);

  let result;
  try {
    result = await ticketRunUseCase.execute(
      project.id,
      projectPath,
      ticketId,
      options.executor || options.model
        ? { executorType: options.executor, model: options.model }
        : undefined,
      display.observer,
    );
  } finally {
    process.removeListener('SIGINT', interruptHandler);
    display.stop();
  }

  const after = show();
  if (!after.ok || !before.ok) {
    // No ticket, so nothing ran.
    const message = result.status === 'failed' ? result.error : `Ticket ${ticketId} not found`;
    return stopped('error', classify(message).code, message, {
      text: `✗ Ticket ${result.ticketId} failed: ${message}`,
    });
  }

  const costs = after.executions.slice(before.executions.length).map((run) => run.costUsd);
  const costUsd = costs.includes(null) ? null : costs.reduce<number>((sum, cost) => sum + cost!, 0);
  const warnings: Warning[] =
    costUsd === null
      ? [
          {
            code: 'COST_UNKNOWN',
            message: `The cost of this run of ${ticketId} could not be read; it is recorded as unknown.`,
          },
        ]
      : [];
  const data = {
    ticketId: after.ticket.id,
    column: after.ticket.column,
    subState: after.ticket.subState,
    attempts: 'attempts' in result ? result.attempts : 0,
    artifactPath: ('artifactPath' in result ? result.artifactPath : null) ?? null,
    reviewPath: ('reviewPath' in result ? result.reviewPath : null) ?? null,
    runIds: after.runs.filter((runId) => !before.runs.includes(runId)),
    costUsd,
    escalation: null,
  };

  switch (result.status) {
    case 'success':
      return done(
        data,
        [
          `✓ Ticket ${result.ticketId} reached SIGNED_OFF`,
          `  Artifact: ${result.artifactPath}`,
          `  Review:   ${result.reviewPath}`,
        ].join('\n'),
        warnings,
      );
    case 'blocked': {
      const escalation = escalationOf(after.ticket.escalation) ?? {
        reason: 'PREFLIGHT_BLOCKERS',
        message: result.blockers.join('; '),
      };
      return stopped({ subState: 'BLOCKED' }, escalation.reason, escalation.message, {
        data: { ...data, escalation },
        text: [
          `⚠ Ticket ${result.ticketId} is blocked:`,
          ...result.blockers.map((blocker) => `  - ${blocker}`),
        ].join('\n'),
        stream: 'stdout',
        warnings,
      });
    }
    case 'failed': {
      const interrupted = after.ticket.subState === 'INTERRUPTED';
      return stopped(
        { subState: interrupted ? 'INTERRUPTED' : 'FAILED' },
        interrupted ? 'INTERRUPTED' : classify(result.error).code,
        result.error,
        { data, text: `✗ Ticket ${result.ticketId} failed: ${result.error}`, warnings },
      );
    }
    case 'escalated': {
      const { reason, message, attempts, artifactPath } = result;
      return stopped({ subState: 'ESCALATED' }, reason, message, {
        data: {
          ...data,
          escalation: {
            reason,
            message,
            ...(attempts > 0 ? { attempt: attempts } : {}),
            ...(artifactPath ? { artifactPath } : {}),
          },
        },
        text: [
          `⏸ Ticket ${result.ticketId} escalated after ${attempts} attempt(s)`,
          `  Reason: ${reason}`,
          `  ${message}`,
          ...(artifactPath ? [`  See: ${artifactPath}`] : []),
        ].join('\n'),
        warnings,
      });
    }
  }
};
