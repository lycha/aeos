// CLI — the one mapping from what happened to an exit code of the contract.

import type { SubStateOrNull } from '../domain/model/sub-state.js';
import type { HaltReason } from '../domain/services/orchestrator-policy.js';
import { EXIT, type ExitCode } from './generated/exit-codes.gen.js';

export type Situation =
  | 'done'
  | 'error'
  | 'usage'
  | 'gate-refused'
  | 'missing-resource'
  | 'interrupted'
  /** Where a ticket run left the ticket. */
  | { readonly subState: SubStateOrNull }
  /** Why an orchestrator run stopped. */
  | { readonly haltReason: HaltReason };

const NAMED: Record<Extract<Situation, string>, ExitCode> = {
  done: EXIT.success,
  error: EXIT.failure,
  usage: EXIT.usage,
  'gate-refused': EXIT.needs_human,
  'missing-resource': EXIT.missing_resource,
  interrupted: EXIT.interrupted,
};

export function exitCodeFor(situation: Situation): ExitCode {
  if (typeof situation === 'string') return NAMED[situation];
  // Escalation is not failure: the pipeline worked and a person is needed.
  if ('subState' in situation) {
    if (situation.subState === 'FAILED') return EXIT.failure;
    if (situation.subState === 'INTERRUPTED') return EXIT.interrupted;
    return situation.subState === 'ESCALATED' || situation.subState === 'BLOCKED'
      ? EXIT.needs_human
      : EXIT.success;
  }
  if (situation.haltReason === 'COMPLETE') return EXIT.success;
  if (situation.haltReason === 'FAILED') return EXIT.failure;
  return situation.haltReason === 'INTERRUPTED' ? EXIT.interrupted : EXIT.needs_human;
}
