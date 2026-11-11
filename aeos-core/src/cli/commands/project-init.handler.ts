// CLI command — aeos project init

import * as path from 'node:path';
import type { Handlers } from '../generated/commands.gen.js';
import { done, stopped } from '../result.js';

export const projectInit: Handlers['projectInit'] = async (_args, options, context) => {
  const cwd = process.cwd();
  const dirName = path.basename(cwd);

  const name = options.name ?? dirName;
  const key =
    options.key ??
    dirName
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 4);

  // --key is checked before the handler; a key taken from the directory name is not.
  if (key.length < 2) {
    return stopped(
      'usage',
      'INVALID_ARGUMENT',
      `--key must be 2–4 uppercase letters (A-Z). Received: "${key}"`,
    );
  }

  const result = context.container.projectInit.execute({ name, key, cwd });

  const scaffoldNote =
    result.scaffolded.length > 0
      ? `\n  Scaffolded ${result.scaffolded.length} file(s) into .aeos/ — column specs, agents, rubrics, and the aeos skill.`
      : '\n  Everything was already in place; nothing scaffolded.';

  return done(
    result,
    `✓ Project '${result.name}' initialised. Key: ${result.key}.${scaffoldNote}\n  Run 'aeos ticket create <title>' to add your first ticket.`,
  );
};
