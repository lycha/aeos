// Web — the SSE response helper (tech spec §3.6): replays a job's buffered
// events after `Last-Event-ID`, then streams the live feed, giving the
// browser's native `EventSource` reconnect the whole mechanism behind AC-12.

import type { IncomingMessage, ServerResponse } from 'node:http';

import { hasJob, isTerminalEvent, subscribe, type JobEvent } from './run-jobs.js';

function lastEventId(req: IncomingMessage): number {
  const header = req.headers['last-event-id'];
  const value = Array.isArray(header) ? header[0] : header;
  const parsed = value !== undefined ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Unknown `jobId` → 404. Otherwise opens the stream, replays everything
 * buffered after `Last-Event-ID`, and keeps delivering live events. A
 * reconnect that replays the terminal event ends the response right after —
 * there is nothing more that job will ever send (tech spec §7.3 edge case 1).
 *
 * shortcut: a reconnect arriving after the job's buffer has already been
 * evicted (10 minutes past the terminal event, run-jobs.ts §2.3) still finds
 * `hasJob` true and is left open with nothing to replay; upgrade by having
 * run-jobs.ts report eviction explicitly if that gap needs closing too.
 */
export function handleJobEvents(req: IncomingMessage, res: ServerResponse, jobId: string): void {
  if (!hasJob(jobId)) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: false,
        error: { code: 'JOB_NOT_FOUND', message: `Unknown job "${jobId}"` },
      }),
    );
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  // `subscribe` calls `onEvent` synchronously for the replay before this
  // assignment completes, so `unsubscribe` starts as a no-op rather than a
  // forward reference.
  let unsubscribe = (): void => {};
  const onEvent = (jobEvent: JobEvent): void => {
    if (res.writableEnded) return;
    res.write(`id: ${jobEvent.seq}\ndata: ${JSON.stringify(jobEvent.event)}\n\n`);
    if (isTerminalEvent(jobEvent.event.type)) {
      unsubscribe();
      res.end();
    }
  };

  unsubscribe = subscribe(jobId, lastEventId(req), onEvent);
  req.on('close', unsubscribe);
}
