// Value Object — AgentSpec (loaded from YAML: system prompt, task instruction, output format, executor config)

/** Agent specification loaded from YAML configuration files. */
export interface AgentSpec {
  /** The system prompt defining the agent's role and persona. */
  readonly systemPrompt: string;

  /** The task instruction describing what the agent should do. */
  readonly taskInstruction: string;

  /** The expected output format specification. */
  readonly outputFormat: string;

  /** Pre-defined checklist items for self-verification. Empty array means no self-verification section. */
  readonly selfVerificationChecklist: readonly string[];
}
