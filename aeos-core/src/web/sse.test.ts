import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

import { spawn } from 'node:child_process';
import { startJob } from './run-jobs.js';
import { handleJobEvents } from './sse.js';

const mockSpawn = vi.mocked(spawn);

type MockChild = ChildProcess & { stderr: PassThrough };

function createMockChild(): MockChild {
  const child = new EventEmitter() as MockChild;
  child.stderr = new PassThrough();
  return child;
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

function flush(times = 3): Promise<void> {
  return times <= 0
    ? Promise.resolve()
    : new Promise((resolve) => setImmediate(resolve)).then(() => flush(times - 1));
}

function fakeReqRes(lastEventId?: string): {
  req: IncomingMessage;
  res: ServerResponse;
  writes: string[];
  closeHandlers: (() => void)[];
  ended: boolean;
  status?: number;
} {
  const writes: string[] = [];
  const closeHandlers: (() => void)[] = [];
  const state = { ended: false, status: undefined as number | undefined };
  const res = {
    writableEnded: false,
    writeHead(status: number) {
      state.status = status;
      return this;
    },
    write(chunk: string) {
      writes.push(chunk);
      return true;
    },
    end(chunk?: unknown) {
      if (chunk) writes.push(String(chunk));
      state.ended = true;
      (res as unknown as { writableEnded: boolean }).writableEnded = true;
    },
  } as unknown as ServerResponse;
  const req = {
    headers: lastEventId !== undefined ? { 'last-event-id': lastEventId } : {},
    on(event: string, handler: () => void) {
      if (event === 'close') closeHandlers.push(handler);
      return this;
    },
  } as unknown as IncomingMessage;
  return {
    req,
    res,
    writes,
    closeHandlers,
    get ended() {
      return state.ended;
    },
    get status() {
      return state.status;
    },
  };
}

beforeEach(() => {
  mockSpawn.mockReset();
});

describe('handleJobEvents', () => {
  it('returns 404 for an unknown jobId', () => {
    const fake = fakeReqRes();
    handleJobEvents(fake.req, fake.res, 'not-a-real-job');

    expect(fake.status).toBe(404);
  });

  it('replays events after Last-Event-ID, then streams live events', async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValueOnce(child);
    const started = startJob(`proj-${randomUUID()}`, '/project', ['ticket', 'run', 'T-1']);
    if (!started.ok) throw new Error('expected startJob to succeed');

    writeEvent(child);
    writeEvent(child);
    await flush();

    const { req, res, writes } = fakeReqRes('1');
    handleJobEvents(req, res, started.jobId);

    expect(writes.join('')).toContain('id: 2\n');
    expect(writes.join('')).not.toContain('id: 1\n');

    writeEvent(child);
    await flush();

    expect(writes.join('')).toContain('id: 3\n');
  });

  it('ends the response right after replaying a terminal event', async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValueOnce(child);
    const started = startJob(`proj-${randomUUID()}`, '/project', ['ticket', 'run', 'T-1']);
    if (!started.ok) throw new Error('expected startJob to succeed');

    writeEvent(child, { type: 'ticket-run.completed' });
    await flush();

    const fake = fakeReqRes('0');
    handleJobEvents(fake.req, fake.res, started.jobId);

    expect(fake.ended).toBe(true);
  });

  it('unsubscribes when the client disconnects', async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValueOnce(child);
    const started = startJob(`proj-${randomUUID()}`, '/project', ['ticket', 'run', 'T-1']);
    if (!started.ok) throw new Error('expected startJob to succeed');

    const { req, res, writes, closeHandlers } = fakeReqRes('0');
    handleJobEvents(req, res, started.jobId);

    for (const handler of closeHandlers) handler();

    writeEvent(child);
    await flush();

    expect(writes).toHaveLength(0);
  });
});
