// Driving port — TicketRun use case interface (orchestration: preflight → executor → validate → review → sign-off)

export interface ExecutorOverrides {
  executorType?: 'claude-cli' | 'auggie-cli' | 'opencode-cli' | 'ollama-cli';
  model?: string;
}

export type TicketRunResult =
  | { status: 'success'; ticketId: string; artifactPath: string; reviewPath: string }
  | { status: 'failed'; ticketId: string; error: string; reviewPath?: string }
  | { status: 'blocked'; ticketId: string; blockers: string[] };

export interface TicketRunPort {
  execute(
    projectId: string,
    projectPath: string,
    ticketId: string,
    executorOverrides?: ExecutorOverrides,
  ): Promise<TicketRunResult>;
}
