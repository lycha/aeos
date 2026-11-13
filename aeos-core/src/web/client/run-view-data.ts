// Web client — pure run-progress reducer (AC-10), kept out of RunView.tsx so
// it is testable with no DOM: folds the same `TicketRunEvent` stream the
// terminal run pane renders (`cli/ui/ticket-run-shell-state.ts`) into the
// stage/agent/executor/model/mode/attempts/rejections/cost/output fields the
// view shows, one `applyJobEvent` call per SSE message — regardless of
// whether that message arrived live or as a reconnect's missed-event replay
// (tech spec §3.6/AC-12), since both arrive through the same `onmessage`.

import type { TicketRunEvent, TicketRunPhase } from '../../domain/model/ticket-run-event.js';

// shortcut: unbounded growth over a very long run is capped by dropping the
// oldest lines, same bound the Ink TUI uses; upgrade to virtualized
// rendering if a run's output routinely exceeds this.
const MAX_OUTPUT_LINES = 500;

export type RunFinalStatus =
  | 'running'
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'interrupted'
  | 'escalated';

export interface RunViewState {
  readonly ticketId: string;
  readonly column: string;
  readonly stage: TicketRunPhase | null;
  readonly stageStatus: 'active' | 'completed' | 'failed' | null;
  readonly statusMessage: string | null;
  readonly agent: string | null;
  readonly executor: string;
  readonly model: string;
  readonly mode: string;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly rejections: number;
  readonly costRecorded: boolean;
  readonly knownCostUsd: number;
  readonly hasUnknownCost: boolean;
  readonly output: readonly string[];
  readonly finalStatus: RunFinalStatus;
}

export function createInitialRunViewState(): RunViewState {
  return {
    ticketId: '—',
    column: '—',
    stage: null,
    stageStatus: null,
    statusMessage: null,
    agent: null,
    executor: '—',
    model: '—',
    mode: '—',
    attempt: 1,
    maxAttempts: 1,
    rejections: 0,
    costRecorded: false,
    knownCostUsd: 0,
    hasUnknownCost: false,
    output: [],
    finalStatus: 'running',
  };
}

function appendOutput(state: RunViewState, line: string): RunViewState {
  const output = [...state.output, line];
  return {
    ...state,
    output:
      output.length > MAX_OUTPUT_LINES ? output.slice(output.length - MAX_OUTPUT_LINES) : output,
  };
}

export function applyJobEvent(state: RunViewState, event: TicketRunEvent): RunViewState {
  let next: RunViewState = { ...state, ticketId: event.ticketId, column: event.column };

  switch (event.type) {
    case 'ticket-run.started':
      next = {
        ...next,
        executor: event.payload.executor,
        model: event.payload.model ?? next.model,
      };
      next = appendOutput(next, `[run] started | executor=${event.payload.executor}`);
      break;
    case 'stage.started':
      next = {
        ...next,
        stage: event.payload.stage,
        stageStatus: 'active',
        statusMessage: event.payload.message,
        agent: event.payload.agent ?? next.agent,
        executor: event.payload.executor ?? next.executor,
        model: event.payload.model ?? next.model,
        mode: event.payload.mode ?? next.mode,
      };
      next = appendOutput(
        next,
        `[stage:${event.payload.stage}] started | ${event.payload.message}`,
      );
      break;
    case 'stage.completed':
      next = {
        ...next,
        stage: event.payload.stage,
        stageStatus: 'completed',
        statusMessage: event.payload.message,
      };
      next = appendOutput(
        next,
        `[stage:${event.payload.stage}] completed | ${event.payload.message}`,
      );
      break;
    case 'stage.failed':
      next = {
        ...next,
        stage: event.payload.stage,
        stageStatus: 'failed',
        statusMessage: event.payload.message,
      };
      next = appendOutput(next, `[stage:${event.payload.stage}] failed | ${event.payload.message}`);
      break;
    case 'sub-state.changed':
      next = appendOutput(
        next,
        `[state] ${event.payload.from ?? '—'} -> ${event.payload.to ?? '—'}`,
      );
      break;
    case 'artifact.written':
      next = appendOutput(next, `[artifact] ${event.payload.role} wrote ${event.payload.path}`);
      break;
    case 'artifact.committed':
      next = appendOutput(next, `[git] ${event.payload.role} committed ${event.payload.path}`);
      break;
    case 'review.rejected':
      next = { ...next, rejections: next.rejections + 1 };
      next = appendOutput(next, `[review] rejected | ${event.payload.reason}`);
      break;
    case 'cost.recorded':
      next =
        event.payload.costUsd === null
          ? { ...next, costRecorded: true, hasUnknownCost: true }
          : {
              ...next,
              costRecorded: true,
              knownCostUsd: next.knownCostUsd + event.payload.costUsd,
            };
      next = appendOutput(
        next,
        `[cost] ${event.payload.role} | ${formatUsd(event.payload.costUsd)}`,
      );
      break;
    case 'executor.stdout.chunk':
    case 'executor.stderr.chunk': {
      const stream = event.type === 'executor.stdout.chunk' ? 'stdout' : 'stderr';
      const prefix = `[${event.payload.source}/${stream}]`;
      for (const line of event.payload.chunk.split(/\r?\n/)) {
        if (line.length > 0) next = appendOutput(next, `${prefix} ${line}`);
      }
      break;
    }
    case 'run.attempt.started':
      next = { ...next, attempt: event.payload.attempt, maxAttempts: event.payload.maxAttempts };
      if (event.payload.attempt > 1) {
        next = appendOutput(
          next,
          `[run] revision attempt ${event.payload.attempt} of ${event.payload.maxAttempts}`,
        );
      }
      break;
    case 'ticket-run.completed':
      next = { ...next, finalStatus: 'completed' };
      next = appendOutput(next, '[run] completed');
      break;
    case 'ticket-run.blocked':
      next = { ...next, finalStatus: 'blocked' };
      next = appendOutput(next, `[run] blocked | ${event.payload.blockers.join('; ')}`);
      break;
    case 'ticket-run.failed':
      next = { ...next, finalStatus: 'failed' };
      next = appendOutput(next, `[run] failed | ${event.payload.message}`);
      break;
    case 'ticket-run.interrupted':
      next = { ...next, finalStatus: 'interrupted' };
      next = appendOutput(next, `[run] interrupted | ${event.payload.message}`);
      break;
    case 'ticket-run.escalated':
      next = { ...next, finalStatus: 'escalated' };
      next = appendOutput(
        next,
        `[run] escalated | ${event.payload.reason} | ${event.payload.message}`,
      );
      break;
  }

  return next;
}

export function formatUsd(costUsd: number | null): string {
  return costUsd === null ? 'unknown' : `$${costUsd.toFixed(4)}`;
}

/** Cumulative cost across every `cost.recorded` event so far (AC-26's "unknown is never folded into a total", applied to one run's running total). */
export function formatRunCost(state: RunViewState): string {
  if (!state.costRecorded) return '—';
  const known = `$${state.knownCostUsd.toFixed(4)}`;
  return state.hasUnknownCost ? `${known} (+ unknown)` : known;
}

/** `POST /api/jobs/:jobId/interrupt` (§3.7) — the same signal a terminal Ctrl-C sends (AC-11). */
export async function interruptJob(jobId: string): Promise<boolean> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/interrupt`, { method: 'POST' });
  if (!res.ok) return false;
  const body = (await res.json()) as { readonly ok: boolean };
  return body.ok;
}
