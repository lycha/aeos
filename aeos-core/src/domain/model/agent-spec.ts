// Value Object — AgentSpec (loaded from YAML: system prompt, task instruction, output format, executor config)

export interface AgentSpec {
  readonly name: string;
  readonly role?: 'worker' | 'reviewer';
  readonly systemPrompt: string;
  readonly taskInstruction: string;
  readonly outputFormat: string;
  readonly selfVerificationChecklist: string[];
  /**
   * The task instructions of the bug track's two phases. The engine uses one
   * in place of `taskInstruction` when the ticket is a bug.
   */
  readonly bugTrack?: { readonly reproduce: string; readonly fix: string };
  readonly executor: {
    readonly type: 'claude-cli' | 'auggie-cli' | 'opencode-cli' | 'ollama-cli' | 'stub';
    readonly model?: string;
    readonly timeoutSeconds: number;
  };
}
