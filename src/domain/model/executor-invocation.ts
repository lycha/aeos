// Value Object — ExecutorInvocation (assembled payload sent to an executor)

import type { Column } from './column.js';

export type ExecutorStream = 'stdout' | 'stderr';
export type ExecutorChunkObserver = (stream: ExecutorStream, chunk: string) => void;

export interface ExecutorInvocation {
  /** Fully assembled prompt string to send to the model */
  readonly prompt: string;
  /** Absolute path where the output artifact should be written */
  readonly outputPath: string;
  /** Ticket ID for logging/cost attribution */
  readonly ticketId: string;
  /** Column this invocation belongs to */
  readonly column: Column;
  /** artifact = stdout artifact only; agentic = may edit repo and emit summary */
  readonly mode?: 'artifact' | 'agentic';
  /** Working directory for the executor process, used by agentic runs. */
  readonly workingDirectory?: string;
  /** Optional callback for live stdout/stderr chunks. */
  readonly onChunk?: ExecutorChunkObserver;
}
