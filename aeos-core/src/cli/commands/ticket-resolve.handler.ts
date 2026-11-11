// CLI command — aeos ticket resolve

import type { Handlers } from '../generated/commands.gen.js';
import { done, failed, stopped } from '../result.js';

export const ticketResolve: Handlers['ticketResolve'] = async (
  { id: ticketId },
  options,
  context,
) => {
  const { projectPath, prompt } = context;
  const project = context.container.projectRepo.read(projectPath);
  const run = (confirmed?: boolean) =>
    context.container.ticketResolve.execute({
      projectId: project.id,
      projectPath,
      ticketId,
      confirmed,
    });

  let result = run(options.yes);

  if (!result.ok && 'needsConfirmation' in result && result.needsConfirmation) {
    if (!prompt.interactive) {
      return stopped(
        'usage',
        'CONFIRMATION_REQUIRED',
        'The escalation file does not appear to have been modified, and stdin is not a terminal to ask at. Pass --yes to continue anyway.',
      );
    }
    const answer = await prompt.ask(
      'Warning: escalation file does not appear to have been modified. Continue anyway? [y/N] ',
    );
    if (answer.toLowerCase() !== 'y') {
      // Nothing went wrong: the person said no, and nothing changed.
      return done({ ticketId, declined: true }, 'Aborted.');
    }
    result = run(true);
  }

  if (!result.ok) return failed('error' in result ? result.error : 'Unknown error');

  return done(
    { ticketId, subState: 'READY' },
    `✓ Ticket ${ticketId} resolved — sub-state set to READY; your guidance will be injected on the next run`,
  );
};
