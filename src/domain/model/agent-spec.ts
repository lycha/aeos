// Value Object — AgentSpec (loaded from YAML: system prompt, task instruction, output format, executor config)

export interface AgentSpec {
  readonly name: string;
  readonly role?: 'worker' | 'reviewer';
  readonly systemPrompt: string;
  readonly taskInstruction: string;
  readonly outputFormat: string;
  readonly selfVerificationChecklist: string[];
  readonly executor: {
    readonly type: 'claude-cli' | 'auggie-cli' | 'ollama-cli' | 'stub';
    readonly model?: string;
    readonly timeoutSeconds: number;
  };
}
