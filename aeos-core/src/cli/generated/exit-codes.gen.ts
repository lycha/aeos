// GENERATED from cli-contract.yaml — do not edit

export const CONTRACT_VERSION = 1;

/** The whole exit-code vocabulary, by name. */
export const EXIT = {
  success: 0,
  failure: 1,
  usage: 2,
  needs_human: 3,
  missing_resource: 4,
  interrupted: 130,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];
