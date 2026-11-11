// CLI command — aeos install

import type { Handlers } from '../generated/commands.gen.js';

export const install: Handlers['install'] = async (_args, options, context) => {
  try {
    context.container.install.execute();
    // eslint-disable-next-line no-console
    console.log("✓ AEOS installed. Run 'aeos project init' in your project.");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  }
};
