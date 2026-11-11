// Test fixture — the generated command tree with the real handlers, over a
// container of the test's own.

import { Command } from 'commander';

import type { Container } from '../container.js';
import { registerGenerated } from '../generated/commands.gen.js';
import { createResources } from '../resources.js';
import { handlers } from './index.js';

/**
 * Only the `project` guard is real, and it asks the container's project
 * repository. The others would look at this machine: its database, its PATH.
 */
export function programWith(container: Partial<Container>, program = new Command()): Command {
  program.exitOverride();
  const real = createResources(container as Container);
  registerGenerated(program, handlers, {
    context: real.context,
    inPlace: (resource, options) => resource !== 'project' || real.inPlace(resource, options),
  });
  return program;
}
