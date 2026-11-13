import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import * as net from 'node:net';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

import { spawn } from 'node:child_process';
import { exchangeToken } from '../../web/auth.js';
import { startJob } from '../../web/run-jobs.js';
import { serve, type ServeData } from './serve.handler.js';

const mockSpawn = vi.mocked(spawn);

type MockChild = ChildProcess & { stderr: PassThrough; kill: ReturnType<typeof vi.fn> };

function createMockChild(): MockChild {
  const child = new EventEmitter() as MockChild;
  child.stderr = new PassThrough();
  child.kill = vi.fn(() => true);
  return child;
}

function flush(times = 3): Promise<void> {
  return times <= 0
    ? Promise.resolve()
    : new Promise((resolve) => setImmediate(resolve)).then(() => flush(times - 1));
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });
}

/** Fires SIGINT and awaits `serve()`'s resolution — every test's required cleanup, since the handler only stops listening once the signal settles every tracked job. */
async function stop(result: Promise<{ data: ServeData | null }>): Promise<ServeData> {
  process.emit('SIGINT');
  const { data } = await result;
  if (!data) throw new Error('expected serve() to resolve with data');
  return data;
}

describe('serve', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
  });

  it('listens on the requested port and stops cleanly on SIGINT with no jobs running', async () => {
    const port = await freePort();
    const result = serve({}, { port, noOpen: true });
    await flush();

    const data = await stop(result);
    expect(data).toEqual({ port, url: expect.stringContaining(`127.0.0.1:${port}`) });
  });

  it('resolves its own free loopback port when none is requested', async () => {
    const result = serve({}, { noOpen: true });
    await flush();

    const data = await stop(result);
    expect(data.port).toBeGreaterThan(0);
  });

  it('mints a one-time token exchangeable exactly once, carried in the returned url', async () => {
    const result = serve({}, { noOpen: true });
    await flush();

    const data = await stop(result);
    const token = new URL(data.url).searchParams.get('token');
    if (!token) throw new Error('expected a token in the returned url');

    expect(exchangeToken(token).ok).toBe(true);
    expect(exchangeToken(token).ok).toBe(false); // AC-33 — a replay is refused
  });

  it('opens the browser to the token url unless --no-open is set', async () => {
    const result = serve({}, {});
    await flush();
    const data = await stop(result);

    expect(mockSpawn).toHaveBeenCalledOnce();
    expect(mockSpawn.mock.calls[0]?.[1]).toContain(data.url);
  });

  it('does not open the browser when --no-open is set', async () => {
    const result = serve({}, { noOpen: true });
    await flush();
    await stop(result);

    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('rejects when the requested port is already bound, instead of crashing the process', async () => {
    const busyPort = await freePort();
    const holder = net.createServer();
    await new Promise<void>((resolve) => holder.listen(busyPort, '127.0.0.1', resolve));

    await expect(serve({}, { port: busyPort, noOpen: true })).rejects.toThrow();

    await new Promise<void>((resolve) => holder.close(() => resolve()));
  });

  it('swallows an async browser-spawn error (e.g. opener binary missing) without crashing', async () => {
    const browserChild = createMockChild();
    mockSpawn.mockReturnValueOnce(browserChild);

    const result = serve({}, {});
    await flush();
    browserChild.emit('error', new Error('ENOENT'));

    const data = await stop(result);
    expect(data.url).toContain('127.0.0.1');
  });

  it('on SIGINT, interrupts every tracked job and resolves only once it has settled (AC-14)', async () => {
    const jobChild = createMockChild();
    mockSpawn.mockReturnValueOnce(jobChild);
    const started = startJob(`proj-${randomUUID()}`, '/project', [
      'ticket',
      'run',
      'T-1',
      '--json',
    ]);
    if (!started.ok) throw new Error('expected startJob to succeed');

    const result = serve({}, { noOpen: true });
    await flush();

    let settled = false;
    const done = result.then(() => {
      settled = true;
    });

    process.emit('SIGINT');
    await flush();
    expect(jobChild.kill).toHaveBeenCalledWith('SIGINT');
    expect(settled).toBe(false);

    jobChild.emit('close', null);
    await done;
    expect(settled).toBe(true);
  });
});
