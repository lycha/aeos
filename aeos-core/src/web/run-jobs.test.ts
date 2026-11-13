// Criteria traced here: @AC-11 (interrupt) @AC-13 (refuse a second run per project) @AC-30 (token kept out of the executor env) @AC-39 (interruptAll settles every job).
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

import { spawn } from 'node:child_process';
import {
  hasJob,
  interrupt,
  interruptAll,
  isTerminalEvent,
  RingBuffer,
  startJob,
  subscribe,
  type JobEvent,
} from './run-jobs.js';

const mockSpawn = vi.mocked(spawn);

type MockChild = ChildProcess & { stderr: PassThrough; kill: ReturnType<typeof vi.fn> };

function createMockChild(): MockChild {
  const child = new EventEmitter() as MockChild;
  child.stderr = new PassThrough();
  child.kill = vi.fn(() => true);
  // Mirrors real ChildProcess: exitCode flips from null once 'close' fires,
  // which is how interruptAll() tells an already-settled job from a live one.
  child.on('close', () => {
    (child as unknown as { exitCode: number | null }).exitCode = 0;
  });
  return child;
}

function flush(times = 3): Promise<void> {
  return times <= 0
    ? Promise.resolve()
    : new Promise((resolve) => setImmediate(resolve)).then(() => flush(times - 1));
}

function writeEvent(child: MockChild, overrides: Record<string, unknown> = {}): void {
  child.stderr.write(
    `${JSON.stringify({
      type: 'stage.started',
      runId: 'run-1',
      projectId: 'proj',
      ticketId: 'T-1',
      column: 'IMPLEMENTATION',
      phase: 'worker',
      at: new Date().toISOString(),
      sequence: 0,
      payload: {},
      ...overrides,
    })}\n`,
  );
}

beforeEach(() => {
  mockSpawn.mockReset();
});

// Runs first in this file, while `jobsById` is still empty — `interruptAll`
// has no way to forget a job once started (WEB-1 decision D-001/NEW-6), so a
// job any later test leaves open would otherwise make these tests hang.
describe('interruptAll', () => {
  it('sends SIGINT to every tracked job and resolves only once each has closed', async () => {
    const first = createMockChild();
    const second = createMockChild();
    mockSpawn.mockReturnValueOnce(first).mockReturnValueOnce(second);
    startJob(`proj-${randomUUID()}`, '/project', ['ticket', 'run', 'T-1', '--json']);
    startJob(`proj-${randomUUID()}`, '/project', ['ticket', 'run', 'T-2', '--json']);

    let settled = false;
    const done = interruptAll().then(() => {
      settled = true;
    });

    await flush();
    expect(first.kill).toHaveBeenCalledWith('SIGINT');
    expect(second.kill).toHaveBeenCalledWith('SIGINT');
    expect(settled).toBe(false);

    first.emit('close', null);
    await flush();
    expect(settled).toBe(false);

    second.emit('close', null);
    await done;
    expect(settled).toBe(true);
  });

  it('resolves immediately for a child that has already exited', async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValueOnce(child);
    startJob(`proj-${randomUUID()}`, '/project', ['ticket', 'run', 'T-1', '--json']);
    child.emit('close', null);

    await interruptAll();
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('resolves immediately once every tracked job has already settled', async () => {
    await expect(interruptAll()).resolves.toBeUndefined();
  });
});

describe('startJob', () => {
  it('spawns in the given project path and assigns a fresh jobId', () => {
    const projectKey = `proj-${randomUUID()}`;
    const child = createMockChild();
    mockSpawn.mockReturnValueOnce(child);

    const result = startJob(projectKey, '/project', ['ticket', 'run', 'T-1', '--json']);

    expect(result.ok).toBe(true);
    expect(mockSpawn.mock.calls[0]?.[2]).toMatchObject({ cwd: '/project' });
  });

  it('refuses a second run for a project already in progress, while a different project proceeds', () => {
    const projectKey = `proj-${randomUUID()}`;
    const otherProjectKey = `proj-${randomUUID()}`;
    mockSpawn.mockReturnValueOnce(createMockChild());
    mockSpawn.mockReturnValueOnce(createMockChild());

    const first = startJob(projectKey, '/project', ['ticket', 'run', 'T-1', '--json']);
    expect(first).toEqual({ ok: true, jobId: expect.any(String) });

    const second = startJob(projectKey, '/project', ['ticket', 'run', 'T-1', '--json']);
    expect(second).toEqual({ ok: false, reason: 'RUN_IN_PROGRESS' });

    const third = startJob(otherProjectKey, '/other', ['ticket', 'run', 'T-2', '--json']);
    expect(third.ok).toBe(true);
  });

  it('allows a new run for a project once its previous job has closed', () => {
    const projectKey = `proj-${randomUUID()}`;
    const firstChild = createMockChild();
    mockSpawn.mockReturnValueOnce(firstChild);
    startJob(projectKey, '/project', ['ticket', 'run', 'T-1', '--json']);

    firstChild.emit('close', 0);

    mockSpawn.mockReturnValueOnce(createMockChild());
    const second = startJob(projectKey, '/project', ['ticket', 'run', 'T-1', '--json']);
    expect(second.ok).toBe(true);
  });

  it('spawns with an env limited to an exact allowlisted key set, excluding any secret', () => {
    vi.stubEnv('PATH', '/usr/bin');
    vi.stubEnv('HOME', '/home/op');
    vi.stubEnv('AEOS_HOME', '/custom/.aeos');
    vi.stubEnv('AEOS_EXECUTOR', 'stub');
    vi.stubEnv('AEOS_SESSION_SECRET', 'super-secret');
    vi.stubEnv('AEOS_LAUNCH_TOKEN', 'one-time-secret');

    mockSpawn.mockReturnValueOnce(createMockChild());
    startJob(`proj-${randomUUID()}`, '/project', ['ticket', 'run', 'T-1', '--json']);

    const env = (mockSpawn.mock.calls[0]?.[2] as { env: Record<string, string> }).env;
    expect(env).not.toHaveProperty('AEOS_SESSION_SECRET');
    expect(env).not.toHaveProperty('AEOS_LAUNCH_TOKEN');
    expect(env).toMatchObject({ PATH: '/usr/bin', HOME: '/home/op', AEOS_HOME: '/custom/.aeos' });
  });
});

describe('hasJob', () => {
  it('is true for a started job and false for an unknown one', () => {
    mockSpawn.mockReturnValueOnce(createMockChild());
    const started = startJob(`proj-${randomUUID()}`, '/project', [
      'ticket',
      'run',
      'T-1',
      '--json',
    ]);
    if (!started.ok) throw new Error('expected startJob to succeed');

    expect(hasJob(started.jobId)).toBe(true);
    expect(hasJob('not-a-real-job')).toBe(false);
  });
});

describe('isTerminalEvent', () => {
  it('recognizes every terminal event type and rejects a non-terminal one', () => {
    expect(isTerminalEvent('ticket-run.completed')).toBe(true);
    expect(isTerminalEvent('ticket-run.interrupted')).toBe(true);
    expect(isTerminalEvent('stage.started')).toBe(false);
  });
});

describe('interrupt', () => {
  it('sends SIGINT to the tracked child and returns true', () => {
    const child = createMockChild();
    mockSpawn.mockReturnValueOnce(child);
    const started = startJob(`proj-${randomUUID()}`, '/project', [
      'ticket',
      'run',
      'T-1',
      '--json',
    ]);
    if (!started.ok) throw new Error('expected startJob to succeed');

    expect(interrupt(started.jobId)).toBe(true);
    expect(child.kill).toHaveBeenCalledWith('SIGINT');
  });

  it('returns false for an unknown jobId', () => {
    expect(interrupt('not-a-real-job')).toBe(false);
  });
});

describe('subscribe', () => {
  it('replays only events after afterSeq, then continues delivering live events', async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValueOnce(child);
    const started = startJob(`proj-${randomUUID()}`, '/project', [
      'ticket',
      'run',
      'T-1',
      '--json',
    ]);
    if (!started.ok) throw new Error('expected startJob to succeed');

    writeEvent(child);
    writeEvent(child);
    await flush();

    const received: JobEvent[] = [];
    const unsubscribe = subscribe(started.jobId, 1, (event) => received.push(event));
    expect(received.map((event) => event.seq)).toEqual([2]);

    writeEvent(child);
    await flush();
    expect(received.map((event) => event.seq)).toEqual([2, 3]);

    unsubscribe();
    writeEvent(child);
    await flush();
    expect(received.map((event) => event.seq)).toEqual([2, 3]);
  });

  it('replays nothing and subscribes to nothing for an unknown jobId', () => {
    const received: JobEvent[] = [];
    const unsubscribe = subscribe('not-a-real-job', 0, (event) => received.push(event));

    expect(received).toEqual([]);
    expect(() => unsubscribe()).not.toThrow();
  });
});

describe('RingBuffer', () => {
  it('caps retention at 2000 events, evicting the oldest first', () => {
    const buffer = new RingBuffer<{ seq: number }>();
    for (let seq = 1; seq <= 2001; seq += 1) buffer.push({ seq }, false);

    const items = buffer.list(0);
    expect(items).toHaveLength(2000);
    expect(items[0]).toEqual({ seq: 2 });
    expect(items[items.length - 1]).toEqual({ seq: 2001 });
  });

  it('evicts every event once 10 minutes have passed since the terminal event', () => {
    let currentTime = 0;
    const buffer = new RingBuffer<{ seq: number }>(() => currentTime);

    buffer.push({ seq: 1 }, false);
    buffer.push({ seq: 2 }, true);
    expect(buffer.list(0)).toHaveLength(2);

    currentTime = 10 * 60 * 1000 - 1;
    expect(buffer.list(0)).toHaveLength(2);

    currentTime = 10 * 60 * 1000;
    expect(buffer.list(0)).toHaveLength(0);
  });
});
