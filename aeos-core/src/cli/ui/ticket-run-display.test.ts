import { describe, it, expect } from 'vitest';

import { createTicketRunDisplay } from './ticket-run-display.js';
import type { TicketRunEvent } from '../../domain/model/ticket-run-event.js';

/** A non-TTY sink so createTicketRunDisplay picks the plain (log-streaming) mode. */
function fakeStdout(): { stream: NodeJS.WriteStream; output: () => string } {
  let buffer = '';
  const stream = {
    isTTY: false,
    write: (chunk: string) => {
      buffer += chunk;
      return true;
    },
  } as unknown as NodeJS.WriteStream;
  return { stream, output: () => buffer };
}

function event(
  partial: Partial<TicketRunEvent> & Pick<TicketRunEvent, 'type' | 'payload'>,
): TicketRunEvent {
  return {
    runId: 'r1',
    projectId: 'p',
    ticketId: 'STAN-1',
    column: 'TECH_SPEC',
    phase: 'worker',
    at: new Date().toISOString(),
    sequence: 1,
    ...partial,
  } as TicketRunEvent;
}

describe('ticket-run-display — agent visibility', () => {
  it('names the working agent in the stage log line', () => {
    const { stream, output } = fakeStdout();
    const display = createTicketRunDisplay(stream);
    display.start();

    display.observer.onEvent?.(
      event({
        type: 'stage.started',
        phase: 'worker',
        payload: {
          stage: 'worker',
          message: 'Running worker executor',
          role: 'worker',
          agent: 'architect-agent',
          executor: 'claude-cli',
          model: 'claude-opus-4-8',
          mode: 'artifact',
        },
      }),
    );

    // The operator can tell *which* agent is working, not just "worker".
    expect(output()).toContain('agent=architect-agent');
  });
});
