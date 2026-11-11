// CLI command — aeos ticket create

import * as fs from 'node:fs';
import type { Handlers } from '../generated/commands.gen.js';

export const ticketCreate: Handlers['ticketCreate'] = async ({ title }, options, context) => {
  try {
    const { projectPath } = context;

    if (options.body !== undefined && options.bodyFile !== undefined) {
      // eslint-disable-next-line no-console
      console.error('Error: pass either --body or --body-file, not both.');
      process.exitCode = 1;
      return;
    }

    let body = options.body;
    if (options.bodyFile !== undefined) {
      try {
        body = fs.readFileSync(options.bodyFile, 'utf-8');
      } catch {
        // eslint-disable-next-line no-console
        console.error(`Error: could not read --body-file "${options.bodyFile}".`);
        process.exitCode = 1;
        return;
      }
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

    const lineage = result.parentId ? ` (task of ${result.parentId})` : '';
    if (result.alreadyExisted) {
      // eslint-disable-next-line no-console
      console.log(
        `= ${result.kind} ${result.ticketId} already exists: "${result.title}"${lineage} — left as is`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(`✓ Created ${result.kind} ${result.ticketId}: "${result.title}"${lineage}`);
      if (result.specPin) {
        // eslint-disable-next-line no-console
        console.log(
          `  Spec: ${result.specPin.repo}@${result.specPin.commit} (${result.specPin.path})`,
        );
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  }
};
