// CLI command — aeos install

import * as fs from 'node:fs';
import type { Handlers } from '../generated/commands.gen.js';
import { done } from '../result.js';
import { aeosHome } from '../../shared/config.js';

export const install: Handlers['install'] = async (_args, _options, context) => {
  const home = aeosHome();
  const created = !fs.existsSync(home);
  context.container.install.execute();
  return done(
    { aeosHome: home, created },
    "✓ AEOS installed. Run 'aeos project init' in your project.",
  );
};
