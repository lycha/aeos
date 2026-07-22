// CLI command — aeos ticket show

import type { Command } from 'commander';
import type { TicketShowPort } from '../../domain/ports/driving/ticket-show.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';

export function registerTicketShowCommand(
  program: Command,
  getTicketShowUseCase: () => TicketShowPort,
  projectRepo: ProjectRepository,
): void {
  const ticketCmd =
    program.commands.find((c) => c.name() === 'ticket') ??
    program.command('ticket').description('Ticket management commands');

  ticketCmd
    .command('show')
    .description('Show details of a single ticket')
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .action((id: string) => {
      // Validate ticket ID format at CLI boundary
      if (!/^[A-Za-z]+-[0-9]+$/.test(id)) {
        // eslint-disable-next-line no-console
        console.error(
          `Error: Invalid ticket ID '${id}'. Expected format: PREFIX-123 (e.g. AEOS-1).`,
        );
        process.exitCode = 1;
        return;
      }

      // 1. Resolve project root
      const cwd = process.cwd();
      const projectPath = projectRepo.findRoot(cwd);

      if (!projectPath) {
        // eslint-disable-next-line no-console
        console.error("Error: Not inside an AEOS project. Run 'aeos project init' first.");
        process.exitCode = 1;
        return;
      }

      const project = projectRepo.read(projectPath);

      // 2. Call use case (case-insensitive via ticketId uppercasing handled in repo)
      const result = getTicketShowUseCase().execute({
        projectId: project.id,
        ticketId: id,
        projectPath,
      });

      // 3. Handle not-found
      if (!result.ok) {
        // eslint-disable-next-line no-console
        console.error(
          `Error: Ticket '${id}' not found. Run 'aeos ticket list' to see available tickets.`,
        );
        process.exitCode = 1;
        return;
      }

      // 4. Format and print structured output
      const subState = result.ticket.subState ?? '—';

      // eslint-disable-next-line no-console
      console.log(`Ticket: ${result.ticket.id}`);
      // eslint-disable-next-line no-console
      console.log(`Title:  ${result.ticket.title}`);
      // eslint-disable-next-line no-console
      console.log(`Kind:   ${result.ticket.kind}`);
      if (result.parent) {
        // eslint-disable-next-line no-console
        console.log(`Parent: ${result.parent.id} — ${result.parent.title}`);
      }
      // eslint-disable-next-line no-console
      console.log(`Column: ${result.ticket.column}`);
      // eslint-disable-next-line no-console
      console.log(`State:  ${subState}`);

      // The whole point of ESCALATED/BLOCKED is "a human must look" — so tell the
      // human why, right here, instead of making them open the review artifact.
      const escalation = result.ticket.escalation;
      if (escalation) {
        // eslint-disable-next-line no-console
        console.log(`Reason: ${escalation.reason} — ${escalation.message}`);
        if (escalation.artifactPath) {
          // eslint-disable-next-line no-console
          console.log(`        See: ${escalation.artifactPath}`);
        }
      }

      if (result.children.length > 0) {
        const done = result.children.filter((child) => child.column === 'DONE').length;
        // eslint-disable-next-line no-console
        console.log('');
        // eslint-disable-next-line no-console
        console.log(`Tasks (${done}/${result.children.length} done):`);
        for (const child of result.children) {
          const mark = child.column === 'DONE' ? '✓' : ' ';
          // eslint-disable-next-line no-console
          console.log(
            `  ${mark} ${child.id.padEnd(10)} ${child.column.padEnd(16)} ${child.subState ?? '—'}  ${child.title}`,
          );
        }
      }

      if (result.artifacts.length > 0) {
        // eslint-disable-next-line no-console
        console.log('');
        // eslint-disable-next-line no-console
        console.log('Artifacts:');
        for (const artifact of result.artifacts) {
          // eslint-disable-next-line no-console
          console.log(`  • ${artifact}`);
        }
      }

      if (result.executions.length > 0) {
        // eslint-disable-next-line no-console
        console.log('');
        // eslint-disable-next-line no-console
        console.log('Executions:');
        for (const execution of result.executions) {
          const modelInfo = execution.model === 'unknown' ? '(unknown)' : execution.model;
          // eslint-disable-next-line no-console
          console.log(
            `  • ${execution.column} (${execution.agent}): ${execution.executor} / ${modelInfo}`,
          );
        }
      }
    });
}
