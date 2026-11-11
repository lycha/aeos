// CLI — the stable `error.code` of every error the CLI reports. A ticket run
// that escalates and an orchestrator run that halts report the engine's own
// EscalationReason and HaltReason, which are stable already.

import type { Situation } from './exit-code-mapping.js';
import type * as T from './generated/types.gen.js';

export const ErrorCode = {
  /** Anything with no code of its own. */
  COMMAND_FAILED: 'COMMAND_FAILED',
  USAGE: 'USAGE',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  RESOURCE_MISSING: 'RESOURCE_MISSING',
  CONFIRMATION_REQUIRED: 'CONFIRMATION_REQUIRED',
  TICKET_NOT_FOUND: 'TICKET_NOT_FOUND',
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  NOT_SIGNED_OFF: 'NOT_SIGNED_OFF',
  NOT_BLOCKED: 'NOT_BLOCKED',
  NOT_ESCALATED: 'NOT_ESCALATED',
  NOT_AT_FINAL_GATE: 'NOT_AT_FINAL_GATE',
  ALREADY_DONE: 'ALREADY_DONE',
  REASON_REQUIRED: 'REASON_REQUIRED',
  PIPELINE_CHANGE_IN_FLIGHT: 'PIPELINE_CHANGE_IN_FLIGHT',
  CONTRACT_APPROVAL_REQUIRED: 'CONTRACT_APPROVAL_REQUIRED',
  PULL_REQUEST_FAILED: 'PULL_REQUEST_FAILED',
  COST_UNKNOWN: 'COST_UNKNOWN',
  // Why a ticket ended FAILED (the list docs/tasks/archive/M7-005 planned).
  EXECUTOR_NOT_FOUND: 'EXECUTOR_NOT_FOUND',
  EXECUTOR_NONZERO_EXIT: 'EXECUTOR_NONZERO_EXIT',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

interface Classified {
  readonly code: ErrorCode;
  readonly situation: Situation;
  readonly resource: T.Error['resource'];
}

// shortcut: use cases report an error as a message, so its code is read from
// the wording, first match wins. Upgrade when the use cases return codes.
const BY_WORDING: readonly (readonly [RegExp, ErrorCode, Situation?, T.Error['resource']?])[] = [
  [/changed while tickets are in flight/, 'PIPELINE_CHANGE_IN_FLIGHT', 'gate-refused'],
  [/carries a contract change/, 'CONTRACT_APPROVAL_REQUIRED', 'gate-refused'],
  [/needs --reason/, 'REASON_REQUIRED', 'gate-refused'],
  [/needs a written reason/, 'REASON_REQUIRED', 'usage'],
  [/^Unknown status '/, 'INVALID_ARGUMENT', 'usage'],
  // Guards answer for `ticket create --spec` and `ticket repin`. Still read
  // here: the amendment lint of `ticket answer`, which declares no python.
  [/python3 is not on PATH|python3 modules/, 'RESOURCE_MISSING', 'missing-resource', 'python'],
  // The `gh` guard finds the command; whether it is logged in, only running it says.
  [/`gh` is not authenticated/, 'RESOURCE_MISSING', 'missing-resource', 'gh'],
  [/^Cannot open a pull request/, 'PULL_REQUEST_FAILED'],
  [/CLI not found on PATH/, 'EXECUTOR_NOT_FOUND'],
  [/exited with code/, 'EXECUTOR_NONZERO_EXIT'],
  [/^Output validation failed/, 'VALIDATION_FAILED'],
  [/^(Parent ticket|Ticket) \S+ not found/, 'TICKET_NOT_FOUND'],
  [/is not signed off/, 'NOT_SIGNED_OFF'],
  [/is not blocked/, 'NOT_BLOCKED'],
  [/is not escalated/, 'NOT_ESCALATED'],
  [/Only DOD_GATE tickets/, 'NOT_AT_FINAL_GATE'],
  [/is already DONE/, 'ALREADY_DONE'],
  [/does not report cost/, 'COST_UNKNOWN'],
];

export function classify(message: string): Classified {
  const [, code, situation, resource] = BY_WORDING.find(([wording]) => wording.test(message)) ?? [
    null,
    ErrorCode.COMMAND_FAILED,
  ];
  return { code, situation: situation ?? 'error', resource: resource ?? null };
}
