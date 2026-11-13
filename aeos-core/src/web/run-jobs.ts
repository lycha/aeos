// Web — per-project run exclusivity and live-run tracking (tech spec §2.3).
// Starts `ticket run`/`orchestrator run` as a tracked subprocess, keyed by
// `projectKey` alone so an orchestrator run and a ticket run for the same
// project can never touch one working tree concurrently (AC-13), reads its
// `--json` stderr (one TicketRunEvent per line, from `createJsonLinesDisplay`)
// into a per-job ring buffer for reconnect catch-up (AC-12), and forwards
// SIGINT for interrupt (AC-11).

import { type ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import * as readline from 'node:readline';

import { loadContract, packageRoot } from '../cli/contract/load-contract.js';
import type { TicketRunEvent } from '../domain/model/ticket-run-event.js';

const MAX_BUFFERED_EVENTS = 2000;
const RETENTION_MS_AFTER_TERMINAL = 10 * 60 * 1000;

/** Environment keys passed through to the spawned engine process, besides the
 * contract's own — mirrors cli-proxy.ts's allowlist so the per-launch
 * credential is never in a run's environment either (AC-30). */
const BASE_ALLOWED_ENV_KEYS = ['PATH', 'HOME'] as const;

const TERMINAL_EVENT_TYPES = new Set<string>([
  'ticket-run.completed',
  'ticket-run.failed',
  'ticket-run.blocked',
  'ticket-run.interrupted',
  'ticket-run.escalated',
]);

/** Whether an event type ends a run — the SSE route (§3.6) closes the stream after replaying one. */
export function isTerminalEvent(type: string): boolean {
  return TERMINAL_EVENT_TYPES.has(type);
}

function allowedEnv(): Record<string, string> {
  const allowedKeys: readonly string[] = [
    ...BASE_ALLOWED_ENV_KEYS,
    ...Object.keys(loadContract().environment),
  ];
  const env: Record<string, string> = {};
  for (const key of allowedKeys) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

export interface JobEvent {
  readonly seq: number;
  readonly event: TicketRunEvent;
}

/** A bounded, append-only buffer: capped at `MAX_BUFFERED_EVENTS`, and
 * dropped entirely once `RETENTION_MS_AFTER_TERMINAL` has passed since the
 * job's terminal event — whichever bound is hit first (tech spec §2.3). */
export class RingBuffer<T extends { seq: number }> {
  private items: T[] = [];
  private evictAt: number | null = null;

  constructor(private readonly now: () => number = Date.now) {}

  push(item: T, terminal: boolean): void {
    this.evictIfExpired();
    this.items.push(item);
    if (this.items.length > MAX_BUFFERED_EVENTS) this.items.shift();
    if (terminal) this.evictAt = this.now() + RETENTION_MS_AFTER_TERMINAL;
  }

  list(afterSeq: number): T[] {
    this.evictIfExpired();
    return this.items.filter((item) => item.seq > afterSeq);
  }

  private evictIfExpired(): void {
    if (this.evictAt !== null && this.now() >= this.evictAt) {
      this.items = [];
      this.evictAt = null;
    }
  }
}

export interface Job {
  readonly jobId: string;
  readonly projectKey: string;
  readonly child: ChildProcess;
  readonly buffer: RingBuffer<JobEvent>;
}

interface InternalJob extends Job {
  readonly emitter: EventEmitter;
  seq: number;
}

const jobsById = new Map<string, InternalJob>();
const runningProjectKeys = new Map<string, string>();

/**
 * Starts `argv` (already built for the engine binary, e.g.
 * `['ticket', 'run', id, '--json']`) as a tracked subprocess, refusing a
 * second run for a `projectKey` already in progress (AC-13).
 */
export function startJob(
  projectKey: string,
  projectPath: string,
  argv: string[],
): { ok: true; jobId: string } | { ok: false; reason: 'RUN_IN_PROGRESS' } {
  if (runningProjectKeys.has(projectKey)) {
    return { ok: false, reason: 'RUN_IN_PROGRESS' };
  }

  const jobId = randomUUID();
  const binPath = path.join(packageRoot(), 'dist', 'cli', 'index.js');
  const child = spawn(process.execPath, [binPath, ...argv], {
    cwd: projectPath,
    env: allowedEnv(),
  });

  const job: InternalJob = {
    jobId,
    projectKey,
    child,
    buffer: new RingBuffer<JobEvent>(),
    emitter: new EventEmitter(),
    seq: 0,
  };
  jobsById.set(jobId, job);
  runningProjectKeys.set(projectKey, jobId);

  readline.createInterface({ input: child.stderr }).on('line', (line) => {
    let event: TicketRunEvent;
    try {
      event = JSON.parse(line) as TicketRunEvent;
    } catch {
      return;
    }
    job.seq += 1;
    const jobEvent: JobEvent = { seq: job.seq, event };
    job.buffer.push(jobEvent, isTerminalEvent(event.type));
    job.emitter.emit('event', jobEvent);
  });

  child.once('close', () => {
    if (runningProjectKeys.get(projectKey) === jobId) runningProjectKeys.delete(projectKey);
  });

  return { ok: true, jobId };
}

/** Whether `jobId` was ever started — the SSE route's 404 for an unknown job (§3.6). */
export function hasJob(jobId: string): boolean {
  return jobsById.has(jobId);
}

/** Sends SIGINT — the signal a terminal Ctrl-C sends — to the tracked child. */
export function interrupt(jobId: string): boolean {
  const job = jobsById.get(jobId);
  if (!job) return false;
  job.child.kill('SIGINT');
  return true;
}

/**
 * Sends SIGINT to every currently-tracked job and resolves only once each
 * one's child process has emitted `close` — i.e. every job is both signalled
 * and settled (AC-14). `serve.handler.ts`'s SIGINT/SIGTERM handler awaits
 * this before the process exits, so no running job is abandoned on shutdown
 * (WEB-1 decision D-001/NEW-6).
 */
export function interruptAll(): Promise<void> {
  const settled = Array.from(jobsById.values(), (job) =>
    (job.child.exitCode ?? null) !== null || (job.child.signalCode ?? null) !== null
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          job.child.once('close', () => resolve());
          job.child.kill('SIGINT');
        }),
  );
  return Promise.all(settled).then(() => undefined);
}

/**
 * Replays buffered events with `seq > afterSeq`, then calls `onEvent` for
 * every event the job emits from here on. Returns an unsubscribe function.
 * An unknown `jobId` replays nothing and subscribes to nothing.
 */
export function subscribe(
  jobId: string,
  afterSeq: number,
  onEvent: (event: JobEvent) => void,
): () => void {
  const job = jobsById.get(jobId);
  if (!job) return () => {};

  for (const buffered of job.buffer.list(afterSeq)) onEvent(buffered);

  job.emitter.on('event', onEvent);
  return () => job.emitter.off('event', onEvent);
}
