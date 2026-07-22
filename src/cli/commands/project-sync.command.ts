// CLI command — aeos project sync

import type { Command } from 'commander';
import type { ProjectSyncPort } from '../../domain/ports/driving/project-sync.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';
import type { SyncFileOutcome } from '../../domain/ports/driving/project-sync.port.js';
import { formatLineDiff } from '../../application/services/line-diff.js';

/* eslint-disable no-console */

export function registerProjectSyncCommand(
  program: Command,
  getProjectSync: () => ProjectSyncPort,
  projectRepo: ProjectRepository,
): void {
  const projectCmd =
    program.commands.find((c) => c.name() === 'project') ??
    program.command('project').description('Project management commands');

  projectCmd
    .command('sync')
    .description(
      "Reconcile this project's column specs, agents, and rubrics with the current templates",
    )
    .option('--apply', 'Write files that are missing from the project')
    .option(
      '--force',
      'Also overwrite drifted files (each backed up to <file>.bak). Implies --apply',
    )
    .option('--diff', 'Show a line diff for each drifted file')
    .action((opts: { apply?: boolean; force?: boolean; diff?: boolean }) => {
      const projectPath = projectRepo.findRoot(process.cwd());
      if (!projectPath) {
        console.error('Error: No AEOS project found. Run "aeos project init" first.');
        process.exitCode = 1;
        return;
      }

      const apply = Boolean(opts.apply);
      const force = Boolean(opts.force);
      const result = getProjectSync().execute({ projectPath, apply, force });

      const missing = result.files.filter((f) => f.status === 'missing');
      const drifted = result.files.filter((f) => f.status === 'drifted');
      const unchanged = result.files.filter((f) => f.status === 'unchanged');

      console.log('Comparing .aeos/ against the current templates...\n');

      for (const file of result.files) {
        if (file.status === 'unchanged') continue;
        console.log(`  ${label(file)}  ${file.relativePath}`);
        if (opts.diff && file.status === 'drifted' && file.projectContent !== null) {
          const diff = formatLineDiff(file.projectContent, file.templateContent);
          console.log(indent(diff));
        }
      }

      console.log(
        `\nSummary: ${unchanged.length} up-to-date, ${drifted.length} drifted, ${missing.length} missing.`,
      );

      // Guidance depends on what was left unaddressed.
      const addedNow = result.files.some((f) => f.action !== 'none');
      if (!apply && !force && (missing.length > 0 || drifted.length > 0)) {
        const hints: string[] = [];
        if (missing.length > 0) hints.push('`aeos project sync --apply` to add missing files');
        if (drifted.length > 0)
          hints.push('`aeos project sync --force` to overwrite drifted files (backed up first)');
        console.log(`\nDry run — nothing changed. Run ${hints.join(', or ')}.`);
        console.log('Use --diff to inspect drift before overwriting.');
      } else if (addedNow) {
        console.log('');
        for (const f of result.files) {
          if (f.action === 'added') console.log(`  + added   ${f.relativePath}`);
          if (f.action === 'updated')
            console.log(`  ~ updated ${f.relativePath}  (backup: ${f.backupPath})`);
        }
        if (drifted.length > 0 && !force) {
          console.log(
            `\n${drifted.length} drifted file(s) left untouched — run with --force to overwrite them.`,
          );
        }
      }
    });
}

function label(file: SyncFileOutcome): string {
  if (file.action === 'added') return 'added  ';
  if (file.action === 'updated') return 'updated';
  if (file.status === 'missing') return 'missing';
  return 'drift  ';
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `      ${line}`)
    .join('\n');
}
