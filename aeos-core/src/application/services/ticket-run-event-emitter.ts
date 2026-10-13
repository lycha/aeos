// Application service — run-scoped event emitter / sequencer for `aeos ticket run`

import { randomUUID } from 'node:crypto';

import type {
  TicketRunEvent,
  TicketRunEventBase,
  TicketRunEventInput,
  TicketRunObserver,
} from '../../domain/model/ticket-run-event.js';

export class TicketRunEventEmitter {
  private readonly runId = randomUUID();
  private sequence = 0;

  constructor(
    private readonly projectId: string,
    private readonly ticketId: string,
    private readonly column: string,
    private readonly observer?: TicketRunObserver,
  ) {}

  emit(event: TicketRunEventInput): TicketRunEvent {
    const stamped = {
      ...event,
      runId: this.runId,
      projectId: this.projectId,
      ticketId: this.ticketId,
      column: this.column,
      at: new Date().toISOString(),
      sequence: ++this.sequence,
    } as TicketRunEvent;

    try {
      this.observer?.onEvent?.(stamped);
    } catch {
      // Observers are best-effort and must not affect orchestration outcome.
    }

    return stamped;
  }

  buildBase(phase: TicketRunEventBase['phase']): Omit<TicketRunEventBase, 'type'> {
    return {
      runId: this.runId,
      projectId: this.projectId,
      ticketId: this.ticketId,
      column: this.column,
      phase,
      at: new Date().toISOString(),
      sequence: this.sequence,
    };
  }
}
