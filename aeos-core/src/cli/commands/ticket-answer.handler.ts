// CLI command — aeos ticket answer

import type { Handlers } from '../generated/commands.gen.js';
import { done, failed, stopped } from '../result.js';

export const ticketAnswer: Handlers['ticketAnswer'] = async (
  { id: ticketId },
  options,
  context,
) => {
  const { projectPath, prompt } = context;
  const project = context.container.projectRepo.read(projectPath);
  const run = (confirmed?: boolean) =>
    context.container.ticketAnswer.execute({
      projectId: project.id,
      projectPath,
      ticketId,
      ...(confirmed ? { confirmed } : {}),
    });

  let result = run(options.yes);

  if (!result.ok && result.needsConfirmation) {
    if (!prompt.interactive) {
      return stopped(
        'usage',
        'CONFIRMATION_REQUIRED',
        'The questions file does not appear to have been modified, and stdin is not a terminal to ask at. Pass --yes to continue anyway.',
      );
    }
    const answer = await prompt.ask(
      'Warning: questions file does not appear to have been modified. Continue anyway? [y/N] ',
    );
    if (answer.toLowerCase() !== 'y') {
      return stopped('error', 'CONFIRMATION_DECLINED', 'Aborted.', { text: 'Aborted.' });
    }
    result = run(true);
  }

  if (!result.ok) return failed('error' in result ? result.error : 'Unknown error');

  const amended = result.amendedDecisions;
  return done(
    {
      ticketId,
      promoted: result.promoted,
      amendedDecisions: amended ?? [],
      specPin: result.specPin,
    },
    amended
      ? `Decision recorded as ${amended.join(', ')}. Update spec.md (spec-writer), commit, then run \`aeos ticket repin ${ticketId}\`.`
      : `✓ Ticket ${ticketId} unblocked — sub-state set to READY`,
    (result.warnings ?? []).map((message) => ({ code: 'LEGACY_QUESTIONS_FILE', message })),
  );
};
