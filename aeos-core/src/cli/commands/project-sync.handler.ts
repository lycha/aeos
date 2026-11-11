// CLI command — aeos project sync

import type { Handlers } from '../generated/commands.gen.js';
import type { SyncFileOutcome } from '../../domain/ports/driving/project-sync.port.js';
import { formatLineDiff } from '../../application/services/line-diff.js';

/* eslint-disable no-console */

export const projectSync: Handlers['projectSync'] = async (_args, options, context) => {
  const { projectPath } = context;

  const apply = Boolean(options.apply);
  const force = Boolean(options.force);
  const result = context.container.projectSync.execute({ projectPath, apply, force });

  const missing = result.files.filter((f) => f.status === 'missing');
  const drifted = result.files.filter((f) => f.status === 'drifted');
  const unchanged = result.files.filter((f) => f.status === 'unchanged');
  const obsolete = result.files.filter((f) => f.status === 'obsolete');

  console.log('Comparing .aeos/ against the current templates...\n');

  for (const file of result.files) {
    if (file.status === 'unchanged') continue;
    console.log(`  ${label(file)}  ${file.relativePath}`);
    if (options.diff && file.status === 'drifted' && file.projectContent !== null) {
      const diff = formatLineDiff(file.projectContent, file.templateContent);
      console.log(indent(diff));
    }
  }

  console.log(
    `\nSummary: ${unchanged.length} up-to-date, ${drifted.length} drifted, ${missing.length} missing, ${obsolete.length} obsolete.`,
  );
  if (obsolete.length > 0) {
    console.log(
      '\nObsolete files are no longer used by AEOS. Sync leaves them in place; delete them once you have kept anything you need.',
    );
  }

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
};

function label(file: SyncFileOutcome): string {
  if (file.action === 'added') return 'added  ';
  if (file.action === 'updated') return 'updated';
  if (file.status === 'missing') return 'missing';
  if (file.status === 'obsolete') return 'obsolete';
  return 'drift  ';
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `      ${line}`)
    .join('\n');
}
