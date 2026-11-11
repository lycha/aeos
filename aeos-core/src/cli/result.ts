// CLI — what a handler returns. It never prints: the generated registration
// renders the result as text or as the contract's JSON envelope.

import { classify } from './error-codes.js';
import { exitCodeFor, type Situation } from './exit-code-mapping.js';
import type { ExitCode } from './generated/exit-codes.gen.js';
import { RESOURCES, type ResourceName } from './generated/resources.gen.js';
import type * as T from './generated/types.gen.js';

export type Warning = T.Warning;

export interface CommandResult<Data> {
  readonly exit: ExitCode;
  readonly data: Data | null;
  readonly error: T.Error | null;
  /** What did not stop the command. A handler never prints one itself. */
  readonly warnings: Warning[];
  /** What a person reads. Empty when there is nothing to add. */
  readonly text: () => string;
  /**
   * Where the text goes. An exit code cannot say: an escalated ticket run has
   * always reported on stderr, and an orchestrator halt on stdout.
   */
  readonly stream: 'stdout' | 'stderr';
}

/** The command did what was asked. */
export function done<Data>(
  data: Data,
  text: string,
  warnings: Warning[] = [],
): CommandResult<Data> {
  return { exit: 0, data, error: null, warnings, text: () => text, stream: 'stdout' };
}

/** The command stopped short. By default it says `Error: <message>` on stderr. */
export function stopped<Data = never>(
  situation: Exclude<Situation, 'done'>,
  code: string,
  message: string,
  more: {
    readonly data?: Data;
    readonly text?: string;
    readonly stream?: 'stdout' | 'stderr';
    readonly resource?: T.Error['resource'];
    readonly warnings?: Warning[];
  } = {},
): CommandResult<Data> {
  return {
    exit: exitCodeFor(situation),
    data: more.data ?? null,
    error: { code, message, resource: more.resource ?? null },
    warnings: more.warnings ?? [],
    text: () => more.text ?? `Error: ${message}`,
    stream: more.stream ?? 'stderr',
  };
}

/**
 * An error a use case returned or threw. `shown` puts column labels into the
 * text a person reads; the message in the envelope keeps the identifiers.
 */
export function failed(
  error: unknown,
  shown: (text: string) => string = (text) => text,
): CommandResult<never> {
  const message = error instanceof Error ? error.message : String(error);
  const { code, situation, resource } = classify(message);
  return stopped(situation === 'done' ? 'error' : situation, code, message, {
    resource,
    text: `Error: ${shown(message)}`,
  });
}

export function missingResource(resource: ResourceName): CommandResult<never> {
  const { description, fix } = RESOURCES[resource];
  return stopped('missing-resource', 'RESOURCE_MISSING', `${description} ${fix}`, {
    resource,
    text: `Error: a required resource is not in place: ${resource}.\n  ${description}\n  ${fix}`,
  });
}
