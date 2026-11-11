// CLI command — aeos ticket run

import type { Handlers } from '../generated/commands.gen.js';
import type { ExecutorOverrides } from '../../domain/ports/driving/ticket-run.port.js';
import { withColumnLabels } from '../../domain/services/column-labels.js';
import { createTicketRunDisplay } from '../ui/ticket-run-display.js';

export const ticketRun: Handlers['ticketRun'] = async ({ id: ticketId }, options, context) => {
  try {
    // Validate executor option
    if (
      options.executor &&
      !['claude-cli', 'auggie-cli', 'opencode-cli', 'ollama-cli'].includes(options.executor)
    ) {
      // eslint-disable-next-line no-console
      console.error(
        `Error: Invalid executor '${options.executor}'. Supported executors: claude-cli, auggie-cli, opencode-cli, ollama-cli`,
      );
      process.exitCode = 1;
      return;
    }

    const { projectPath } = context;

    const project = context.container.projectRepo.read(projectPath);
    const ticketRunUseCase = context.container.ticketRun;
    const labels = context.container.columnLabels(projectPath);
    const display = createTicketRunDisplay(process.stdout, (column) =>
      withColumnLabels(column, labels),
    );

    const executorOverrides: ExecutorOverrides | undefined =
      options.executor || options.model
        ? {
            executorType: options.executor as
              | 'claude-cli'
              | 'auggie-cli'
              | 'opencode-cli'
              | 'ollama-cli'
              | undefined,
            model: options.model,
          }
        : undefined;

    if (!display.live) {
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
        executorOverrides,
        display.observer,
      );
    } finally {
      process.removeListener('SIGINT', interruptHandler);
      display.stop();
    }

    switch (result.status) {
      case 'success':
        // eslint-disable-next-line no-console
        console.log(`✓ Ticket ${result.ticketId} reached SIGNED_OFF`);
        // eslint-disable-next-line no-console
        console.log(`  Artifact: ${result.artifactPath}`);
        // eslint-disable-next-line no-console
        console.log(`  Review:   ${result.reviewPath}`);
        break;
      case 'blocked':
        // eslint-disable-next-line no-console
        console.log(`⚠ Ticket ${result.ticketId} is blocked:`);
        for (const blocker of result.blockers) {
          // eslint-disable-next-line no-console
          console.log(`  - ${blocker}`);
        }
        break;
      case 'failed':
        // eslint-disable-next-line no-console
        console.error(`✗ Ticket ${result.ticketId} failed: ${result.error}`);
        process.exitCode = 1;
        break;
      case 'escalated':
        // eslint-disable-next-line no-console
        console.error(
          [
            `⏸ Ticket ${result.ticketId} escalated after ${result.attempts} attempt(s)`,
            `  Reason: ${result.reason}`,
            `  ${result.message}`,
            ...(result.artifactPath ? [`  See: ${result.artifactPath}`] : []),
          ].join('\n'),
        );
        process.exitCode = 1;
        break;
      default: {
        // Exhaustiveness guard: adding a TicketRunResult status without
        // handling it here previously produced a silent no-output exit 0.
        const unreachable: never = result;
        throw new Error(`Unhandled ticket run status: ${JSON.stringify(unreachable)}`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  }
};
