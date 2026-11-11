// CLI command — aeos ticket create

import * as fs from 'node:fs';
import type { Handlers } from '../generated/commands.gen.js';
import { done, stopped } from '../result.js';

export const ticketCreate: Handlers['ticketCreate'] = async ({ title }, options, context) => {
  const { projectPath } = context;

  if (options.body !== undefined && options.bodyFile !== undefined) {
    return stopped('usage', 'INVALID_ARGUMENT', 'pass either --body or --body-file, not both.');
  }

  let body = options.body;
  if (options.bodyFile !== undefined) {
    try {
      body = fs.readFileSync(options.bodyFile, 'utf-8');
    } catch {
      return stopped(
        'usage',
        'INVALID_ARGUMENT',
        `could not read --body-file "${options.bodyFile}".`,
      );
    }
  }

  // The decisions lint runs before a spec-backed epic is created.
  if (options.spec !== undefined) {
    const missing = context.require('python');
    if (missing) return missing;
  }

  const project = context.container.projectRepo.read(projectPath);

  const result = context.container.ticketCreate.execute({
    title,
    projectId: project.id,
    projectKey: project.key,
    projectPath,
    parentId: options.parent,
    taskKey: options.key,
    body,
    spec: options.spec,
    bug: options.bug,
    implements: options.implements,
  });

  const { ticketId, kind, parentId, alreadyExisted } = result;
  const lineage = parentId ? ` (task of ${parentId})` : '';
  const text = alreadyExisted
    ? `= ${kind} ${ticketId} already exists: "${result.title}"${lineage} — left as is`
    : `✓ Created ${kind} ${ticketId}: "${result.title}"${lineage}` +
      (result.specPin
        ? `\n  Spec: ${result.specPin.repo}@${result.specPin.commit} (${result.specPin.path})`
        : '');
  return done({ ticketId, kind, parentId, alreadyExisted }, text);
};
