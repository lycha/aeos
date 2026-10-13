// Driving port — TicketRun use case interface (orchestration: preflight → executor → validate → review → sign-off)

import type { TicketRunObserver } from '../../model/ticket-run-event.js';
import type { EscalationReason } from '../../model/escalation.js';

export interface ExecutorOverrides {
  executorType?: 'claude-cli' | 'auggie-cli' | 'opencode-cli' | 'ollama-cli';
  model?: string;
}

export type TicketRunResult =
  | {
      status: 'success';
      ticketId: string;
      artifactPath: string;
      reviewPath: string;
      /** Attempts consumed, including the first. 1 when the review passed outright. */
      attempts: number;
    }
  | { status: 'failed'; ticketId: string; error: string; reviewPath?: string }
  | { status: 'blocked'; ticketId: string; blockers: string[] }
  // Distinct from 'failed': the pipeline worked and reached a point where only
  // a human can decide. The orchestrator pauses on this rather than retrying.
  | {
      status: 'escalated';
      ticketId: string;
      reason: EscalationReason;
      message: string;
      attempts: number;
      artifactPath?: string;
    };

export interface TicketRunPort {
  execute(
    projectId: string,
    projectPath: string,
    ticketId: string,
    executorOverrides?: ExecutorOverrides,
    observer?: TicketRunObserver,
  ): Promise<TicketRunResult>;

  interrupt(): Promise<void>;
}
