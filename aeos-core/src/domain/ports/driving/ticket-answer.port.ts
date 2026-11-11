// Driving port — TicketAnswer use case interface (unblock after preflight questions)

import type { SpecPin } from '../../model/spec-pin.js';

export interface TicketAnswerInput {
  projectId: string;
  projectPath: string;
  ticketId: string;
  confirmed?: boolean;
}

export type TicketAnswerResult =
  | {
      ok: true;
      ticketId: string;
      warnings?: string[];
      /** The decisions files the answers were promoted into, relative to the ticket directory. */
      promoted: string[];
      /** The ticket's spec pin: its own, or its parent epic's. */
      specPin: SpecPin | null;
      /**
       * Ids of the decisions the answers added to the spec's decision log.
       * When present the ticket is still BLOCKED, until `ticket repin`.
       */
      amendedDecisions?: string[];
    }
  | { ok: false; needsConfirmation: true; reason: string }
  | { ok: false; needsConfirmation?: false; error: string };

export interface TicketAnswerPort {
  execute(input: TicketAnswerInput): TicketAnswerResult;
}
