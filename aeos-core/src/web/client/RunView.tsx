// Web client — the live run view (AC-10, AC-11, AC-12). Shows a started
// run's progress — stage, agent, executor, model, mode, attempts,
// rejections, cost and executor output — the same facts the terminal run
// pane shows, by feeding a native `EventSource` against
// `GET /api/jobs/:jobId/events` into the pure reducer in `run-view-data.ts`.
// `EventSource`'s built-in `Last-Event-ID` reconnect (tech spec §3.6) is what
// delivers events missed while disconnected before the stream resumes live —
// no client-side catch-up logic is needed. Unmounting only closes the
// `EventSource`; it never calls interrupt, so closing the tab does not stop
// the run (AC-11).

import { useEffect, useState } from 'react';

import type { TicketRunEvent } from '../../domain/model/ticket-run-event.js';
import {
  applyJobEvent,
  createInitialRunViewState,
  formatRunCost,
  interruptJob,
  type RunViewState,
} from './run-view-data.js';

export interface RunViewProps {
  readonly jobId: string;
}

export function RunView({ jobId }: RunViewProps) {
  const [state, setState] = useState<RunViewState>(createInitialRunViewState());
  const [interrupting, setInterrupting] = useState(false);

  useEffect(() => {
    setState(createInitialRunViewState());
    setInterrupting(false);

    const source = new EventSource(`/api/jobs/${encodeURIComponent(jobId)}/events`);
    source.onmessage = (messageEvent) => {
      const event = JSON.parse(messageEvent.data) as TicketRunEvent;
      setState((prev) => applyJobEvent(prev, event));
    };

    return () => source.close();
  }, [jobId]);

  const running = state.finalStatus === 'running';

  const interrupt = async (): Promise<void> => {
    setInterrupting(true);
    await interruptJob(jobId);
  };

  return (
    <section aria-label="Run">
      <p>
        {state.ticketId} · {state.column} · stage: {state.stage ?? '—'}
        {state.agent ? ` · agent: ${state.agent}` : ''} · executor: {state.executor} · model:{' '}
        {state.model} · mode: {state.mode}
      </p>
      <p>
        Attempt {state.attempt} of {state.maxAttempts} · Rejections: {state.rejections} · Cost:{' '}
        {formatRunCost(state)}
      </p>
      <p>
        Status: {state.finalStatus}
        {state.statusMessage ? ` — ${state.statusMessage}` : ''}
      </p>
      <button type="button" onClick={() => void interrupt()} disabled={!running || interrupting}>
        Interrupt
      </button>
      <pre>{state.output.join('\n')}</pre>
    </section>
  );
}
