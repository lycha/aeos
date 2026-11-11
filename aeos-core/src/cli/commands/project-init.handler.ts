// CLI command — aeos project init

import * as path from 'node:path';
import type { Handlers } from '../generated/commands.gen.js';

const KEY_REGEX = /^[A-Z]{2,4}$/;

export const projectInit: Handlers['projectInit'] = async (_args, options, context) => {
  try {
    const cwd = process.cwd();
    const dirName = path.basename(cwd);

    const name = options.name ?? dirName;
    const key =
      options.key ??
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

    const result = context.container.projectInit.execute({ name, key, cwd });

    const scaffoldNote =
      result.scaffolded.length > 0
        ? `\n  Scaffolded ${result.scaffolded.length} file(s) into .aeos/ — column specs, agents, rubrics, and the aeos skill.`
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
};
