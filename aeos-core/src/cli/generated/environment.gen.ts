// GENERATED from cli-contract.yaml — do not edit

/** Every variable the CLI reads. A variable not listed here is not an input. */
export const ENVIRONMENT = {
  AEOS_HOME: { description: 'Directory holding state.db and global configuration.', default: '~/.aeos' },
  AEOS_EXECUTOR: { description: 'Set to `stub` to run every agent with the offline stub executor. No model is called and nothing is spent.', default: null },
  AEOS_GIT_ISOLATION: { description: 'Set to `none` to stop the orchestrator isolating an epic\'s work on its own branch.', default: null },
} as const;
