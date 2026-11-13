// Criteria traced here: @AC-13 (second-run refusal at the route) @AC-27 (cross-origin refused) @AC-28 (non-loopback Host refused) @AC-29 (no-session refused) @AC-38 (auth-endpoint check matrix).
// Integration tests for the route table (tech spec §3): real HTTP requests
// against a real `http.Server`, spawning the real built `dist/cli/index.js`
// binary (via cli-proxy.ts/run-jobs.ts) under `AEOS_EXECUTOR=stub` — not the
// in-process `runCli` the rest of the e2e harness uses for setup.

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { request as httpRequest } from 'node:http';
import type { IncomingHttpHeaders, Server } from 'node:http';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FsConfigStore } from '../infrastructure/filesystem/fs-config.adapter.js';
import { createTempProject, runCli, type TempProject } from '../e2e/harness.js';
import { mintLaunchToken } from './auth.js';
import { createServer } from './server.js';

interface RawResponse {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

function send(
  port: number,
  method: string,
  requestPath: string,
  options: { headers?: Record<string, string>; body?: string } = {},
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path: requestPath,
        method,
        headers: options.body
          ? { 'Content-Type': 'application/json', ...options.headers }
          : options.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf-8'),
          }),
        );
      },
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
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

/** Registers a project under `key` and gives its nested `.aeos` repo a git identity,
 * which the subprocess needs (it runs with none of the harness's GIT_CONFIG_GLOBAL env). */
async function registerProject(key: string): Promise<void> {
  expect((await runCli('install')).exitCode).toBe(0);
  expect((await runCli('project', 'init', '--name', key, '--key', key)).exitCode).toBe(0);
  const aeosDir = path.join(process.cwd(), '.aeos');
  execFileSync('git', ['config', 'user.name', 'AEOS E2E'], { cwd: aeosDir });
  execFileSync('git', ['config', 'user.email', 'e2e@aeos.invalid'], { cwd: aeosDir });
}

describe('server routes', () => {
  let project: TempProject;
  let server: Server;
  let port: number;
  let origin: string;
  let clientDir: string;

  beforeEach(async () => {
    project = createTempProject();
    await registerProject('EE');

    clientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-web-client-'));
    fs.writeFileSync(path.join(clientDir, 'index.html'), '<html>shell</html>', 'utf-8');

    port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    server = createServer({ origin, clientDir });
    await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', () => resolve()));
  }, 20_000);

  afterEach(() => {
    return new Promise<void>((resolve) => {
      server.close(() => {
        fs.rmSync(clientDir, { recursive: true, force: true });
        project.cleanup();
        resolve();
      });
    });
  });

  async function exchangeSession(): Promise<string> {
    const token = mintLaunchToken();
    const res = await send(port, 'POST', '/api/auth/session', {
      headers: { Origin: origin },
      body: JSON.stringify({ token }),
    });
    expect(res.status).toBe(204);
    const cookie = res.headers['set-cookie']?.[0];
    if (!cookie) throw new Error('expected a session cookie');
    return cookie.split(';')[0] ?? '';
  }

  // ── AC-27/AC-28/AC-29/AC-33 — the per-route auth matrix (WEB-1 decision D-001) ──

  it('serves GET / with a loopback Host alone — no Origin, no session', async () => {
    const res = await send(port, 'GET', '/');
    expect(res.status).toBe(200);
    expect(res.body).toContain('shell');
  });

  it('refuses GET / addressed to a non-loopback Host', async () => {
    const res = await send(port, 'GET', '/', { headers: { Host: 'evil.example' } });
    expect(res.status).toBe(403);
    expect(JSON.parse(res.body)).toMatchObject({ ok: false, transportError: true });
  });

  it('exchanges a one-time token for a session cookie, and refuses a replay', async () => {
    const token = mintLaunchToken();
    const first = await send(port, 'POST', '/api/auth/session', {
      headers: { Origin: origin },
      body: JSON.stringify({ token }),
    });
    expect(first.status).toBe(204);

    const second = await send(port, 'POST', '/api/auth/session', {
      headers: { Origin: origin },
      body: JSON.stringify({ token }),
    });
    expect(second.status).toBe(401);
  });

  it('refuses the session exchange with a mismatched Origin, even on a loopback Host', async () => {
    const token = mintLaunchToken();
    const res = await send(port, 'POST', '/api/auth/session', {
      headers: { Origin: 'http://evil.example' },
      body: JSON.stringify({ token }),
    });
    expect(res.status).toBe(403);
  });

  it('refuses every other route with no session, even with Host and Origin correct', async () => {
    const res = await send(port, 'GET', '/api/contract', { headers: { Origin: origin } });
    expect(res.status).toBe(401);
  });

  it('refuses every other route with a session but a mismatched Origin', async () => {
    const cookie = await exchangeSession();
    const res = await send(port, 'GET', '/api/contract', {
      headers: { Cookie: cookie, Origin: 'http://evil.example' },
    });
    expect(res.status).toBe(403);
  });

  it('serves GET /api/contract with Host, Origin and session all present', async () => {
    const cookie = await exchangeSession();
    const res = await send(port, 'GET', '/api/contract', {
      headers: { Cookie: cookie, Origin: origin },
    });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toHaveProperty('commands');
  });

  // ── AC-2/AC-3 — the generic command proxy round-trips the real CLI ──────

  it('round-trips a real command through the generic proxy, identically to the CLI itself', async () => {
    const cookie = await exchangeSession();
    const res = await send(port, 'POST', '/api/cli/ticket/list', {
      headers: { Cookie: cookie, Origin: origin },
      body: JSON.stringify({ projectKey: 'EE', parameters: {} }),
    });

    expect(res.status).toBe(200);
    const envelope = JSON.parse(res.body) as {
      ok: boolean;
      exit: number;
      command: string;
      data: { tickets: unknown[] };
    };
    expect(envelope.ok).toBe(true);
    expect(envelope.exit).toBe(0);
    expect(envelope.command).toBe('ticket list');
    expect(envelope.data.tickets).toEqual([]);
  }, 20_000);

  it('refuses an unknown command path as COMMAND_NOT_FOUND', async () => {
    const cookie = await exchangeSession();
    const res = await send(port, 'POST', '/api/cli/ticket/nope', {
      headers: { Cookie: cookie, Origin: origin },
      body: JSON.stringify({ projectKey: 'EE', parameters: {} }),
    });

    expect(res.status).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('COMMAND_NOT_FOUND');
  });

  it('refuses a proxy call with no projectKey as PROJECT_KEY_REQUIRED', async () => {
    const cookie = await exchangeSession();
    const res = await send(port, 'POST', '/api/cli/ticket/list', {
      headers: { Cookie: cookie, Origin: origin },
      body: JSON.stringify({ parameters: {} }),
    });

    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('PROJECT_KEY_REQUIRED');
  });

  // ── AC-13 — one run at a time per project, other projects proceed ──────

  it('refuses a second run for a project already in progress, while another project proceeds', async () => {
    const cookie = await exchangeSession();

    // Exclusivity is keyed by the URL's projectKey alone (tech spec §2.3), so a
    // second registry entry for the same directory is enough to prove a
    // different key proceeds independently — no second temp environment needed.
    const configStore = new FsConfigStore();
    const registry = configStore.readRegistry();
    const existing = registry.find((entry) => entry.key === 'EE');
    if (!existing) throw new Error('expected EE to be registered');
    configStore.writeRegistry([...registry, { ...existing, key: 'OE' }]);

    {
      const first = await send(port, 'POST', '/api/projects/EE/tickets/BOGUS-1/run', {
        headers: { Cookie: cookie, Origin: origin },
        body: JSON.stringify({}),
      });
      expect(first.status).toBe(200);
      expect(JSON.parse(first.body)).toMatchObject({ ok: true, jobId: expect.any(String) });

      const second = await send(port, 'POST', '/api/projects/EE/tickets/BOGUS-2/run', {
        headers: { Cookie: cookie, Origin: origin },
        body: JSON.stringify({}),
      });
      expect(second.status).toBe(200);
      expect(JSON.parse(second.body)).toMatchObject({
        ok: false,
        error: { code: 'RUN_IN_PROGRESS' },
      });

      const otherProject = await send(port, 'POST', '/api/projects/OE/tickets/BOGUS-1/run', {
        headers: { Cookie: cookie, Origin: origin },
        body: JSON.stringify({}),
      });
      expect(otherProject.status).toBe(200);
      expect(JSON.parse(otherProject.body)).toMatchObject({ ok: true, jobId: expect.any(String) });
    }
  }, 20_000);

  it('refuses a run for an unregistered project as PROJECT_NOT_FOUND', async () => {
    const cookie = await exchangeSession();
    const res = await send(port, 'POST', '/api/projects/NOPE/tickets/T-1/run', {
      headers: { Cookie: cookie, Origin: origin },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('PROJECT_NOT_FOUND');
  });

  // ── Reachability of the remaining routes (AC-12, AC-24, AC-32) ──────────

  it('returns 404 for an unknown SSE job and for interrupting an unknown job', async () => {
    const cookie = await exchangeSession();

    const events = await send(port, 'GET', '/api/jobs/not-a-real-job/events', {
      headers: { Cookie: cookie, Origin: origin },
    });
    expect(events.status).toBe(404);

    const interrupted = await send(port, 'POST', '/api/jobs/not-a-real-job/interrupt', {
      headers: { Cookie: cookie, Origin: origin },
      body: JSON.stringify({}),
    });
    expect(interrupted.status).toBe(200);
    expect(JSON.parse(interrupted.body)).toMatchObject({
      ok: false,
      error: { code: 'JOB_NOT_FOUND' },
    });
  });

  it("lists a project's features, empty for a fresh project", async () => {
    const cookie = await exchangeSession();
    const res = await send(port, 'GET', '/api/projects/EE/features', {
      headers: { Cookie: cookie, Origin: origin },
    });

    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, features: [] });
  });

  it('returns 404 for an artifact that does not exist on the ticket', async () => {
    const cookie = await exchangeSession();
    const res = await send(port, 'GET', '/api/projects/EE/tickets/EE-1/artifacts/nope.md', {
      headers: { Cookie: cookie, Origin: origin },
    });

    expect(res.status).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('ARTIFACT_NOT_FOUND');
  });

  it('returns 404 for a project that does not exist', async () => {
    const cookie = await exchangeSession();
    const res = await send(port, 'GET', '/api/projects/NOPE/features', {
      headers: { Cookie: cookie, Origin: origin },
    });

    expect(res.status).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('PROJECT_NOT_FOUND');
  });
});
