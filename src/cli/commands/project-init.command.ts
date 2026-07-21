// CLI command — aeos project init

import * as path from 'node:path';
import type { Command } from 'commander';
import type { ProjectInitPort } from '../../domain/ports/driving/project-init.port.js';

const KEY_REGEX = /^[A-Z]{2,4}$/;

export function registerProjectInitCommand(
  program: Command,
  projectInitUseCase: ProjectInitPort,
): void {
  const projectCmd =
    program.commands.find((c) => c.name() === 'project') ??
    program.command('project').description('Project management commands');

  projectCmd
    .command('init')
    .description('Initialise a project in the current directory')
    .option('--name <name>', 'Project name (defaults to directory name)')
    .option('--key <key>', 'Ticket prefix key (2–4 uppercase letters)')
    .action((opts: { name?: string; key?: string }) => {
      try {
        const cwd = process.cwd();
        const dirName = path.basename(cwd);

        const name = opts.name ?? dirName;
        const key =
          opts.key ??
          dirName
            .toUpperCase()
            .replace(/[^A-Z]/g, '')
            .slice(0, 4);

        if (!KEY_REGEX.test(key)) {
          // eslint-disable-next-line no-console
          console.error(`Error: --key must be 2–4 uppercase letters (A-Z). Received: "${key}"`);
          process.exitCode = 1;
          return;
        }

        const result = projectInitUseCase.execute({ name, key, cwd });

        const scaffoldNote =
          result.scaffolded.length > 0
            ? `\n  Scaffolded ${result.scaffolded.length} file(s) into .aeos/ — column specs, agents, and rubrics.`
            : '\n  Everything was already in place; nothing scaffolded.';

        // eslint-disable-next-line no-console
        console.log(
          `✓ Project '${result.name}' initialised. Key: ${result.key}.${scaffoldNote}\n  Run 'aeos ticket create <title>' to add your first ticket.`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.error(`Error: ${message}`);
        process.exitCode = 1;
      }
    });
}
