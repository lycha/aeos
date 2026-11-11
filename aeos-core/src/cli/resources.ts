// CLI — resource guards: one check per resource the contract names. The
// generated registration runs a command's guards before its handler.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { getDb } from '../infrastructure/persistence/database.js';
import { PythonDecisionsLint } from '../infrastructure/spec/decisions-lint.adapter.js';
import { aeosHome } from '../shared/config.js';
import type { Container } from './container.js';
import type { ResourceName } from './generated/resources.gen.js';
import { terminalPrompt, type Prompt } from './prompt.js';
import type { CommandResult } from './result.js';

/** What a handler is given besides its arguments and options. */
export interface CommandContext<R extends ResourceName = never> {
  readonly container: Container;
  /** The project root. For a command that requires `project`; it throws for any other. */
  readonly projectPath: string;
  /** How the command asks a person a question, when it declares a prompt. */
  readonly prompt: Prompt;
  /**
   * Asks for a resource the command needs only in a stated case. Null when it
   * is in place; otherwise the result the handler returns.
   */
  require(resource: R): CommandResult<never> | null;
}

export interface Resources {
  /** Whether the resource is in place, for a command run with these options. */
  inPlace(resource: ResourceName, options: object): boolean;
  context<R extends ResourceName>(
    require: (resource: R) => CommandResult<never> | null,
  ): CommandContext<R>;
}

const EXECUTOR_BINARIES: Record<string, string> = {
  'claude-cli': 'claude',
  'auggie-cli': 'auggie',
  'opencode-cli': 'opencode',
  'ollama-cli': 'ollama',
};

const onPath = (binary: string): boolean =>
  (process.env.PATH ?? '')
    .split(path.delimiter)
    .some((dir) => dir !== '' && fs.existsSync(path.join(dir, binary)));

function insideGitWorkTree(dir: string): boolean {
  if (fs.existsSync(path.join(dir, '.git'))) return true;
  const parent = path.dirname(dir);
  return parent !== dir && insideGitWorkTree(parent);
}

export function createResources(container: Container, prompt: Prompt = terminalPrompt): Resources {
  const projectRoot = (): string | null => container.projectRepo.findRoot(process.cwd());
  const checks: Record<ResourceName, (options: { executor?: string }) => boolean> = {
    aeos_home: () => fs.existsSync(aeosHome()),
    project: () => projectRoot() !== null,
    state_db: () => {
      try {
        getDb();
        return true;
      } catch {
        return false;
      }
    },
    git_repo: () => insideGitWorkTree(projectRoot() ?? process.cwd()),
    // shortcut: only a `--executor` override is checked. Which executor each
    // agent of the run resolves to depends on the ticket's column and its agent
    // specs, which the run itself reads; a missing one fails there, as before.
    // Upgrade when that resolution can be asked for without running.
    executor: (options) => {
      if (process.env.AEOS_EXECUTOR === 'stub') return true;
      const binary = options.executor && EXECUTOR_BINARIES[options.executor];
      return !binary || onPath(binary);
    },
    python: () => new PythonDecisionsLint().ready(),
    // Found is all that is asked: `gh` is never run here. The stub's pull
    // request gateway needs none.
    gh: () => process.env.AEOS_EXECUTOR === 'stub' || onPath('gh'),
  };

  return {
    inPlace: (resource, options) => checks[resource](options),
    context: (require) => ({
      container,
      get projectPath(): string {
        const root = projectRoot();
        if (!root) throw new Error('No AEOS project found: this command does not require one.');
        return root;
      },
      prompt,
      require,
    }),
  };
}
