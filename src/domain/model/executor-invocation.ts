// Value Object — ExecutorInvocation (assembled payload sent to an executor)

import type { Column } from './column.js';

export interface ExecutorInvocation {
  /** Fully assembled prompt string to send to the model */
  readonly prompt: string;
  /** Absolute path where the output artifact should be written */
  readonly outputPath: string;
  /** Ticket ID for logging/cost attribution */
  readonly ticketId: string;
  /** Column this invocation belongs to */
  readonly column: Column;
}
