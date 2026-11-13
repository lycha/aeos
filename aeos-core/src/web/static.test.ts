import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { serveStatic } from './static.js';

function fakeResponse(): ServerResponse & {
  status?: number;
  headers?: Record<string, string>;
  body: Buffer[];
} {
  const body: Buffer[] = [];
  const res = {
    body,
    status: undefined as number | undefined,
    headers: undefined as Record<string, string> | undefined,
    writeHead(status: number, headers: Record<string, string>) {
      res.status = status;
      res.headers = headers;
      return res;
    },
    end(chunk?: unknown) {
      if (chunk) body.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    },
  };
  return res as unknown as ServerResponse & {
    status?: number;
    headers?: Record<string, string>;
    body: Buffer[];
  };
}

function requestFor(url: string): IncomingMessage {
  return { url } as unknown as IncomingMessage;
}

describe('serveStatic', () => {
  let clientDir: string;

  beforeEach(() => {
    clientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-static-'));
  });

  afterEach(() => {
    fs.rmSync(clientDir, { recursive: true, force: true });
  });

  it('serves index.html for the root path', () => {
    fs.writeFileSync(path.join(clientDir, 'index.html'), '<html>shell</html>', 'utf-8');

    const res = fakeResponse();
    serveStatic(clientDir, requestFor('/'), res);

    expect(res.status).toBe(200);
    expect(res.headers?.['Content-Type']).toContain('text/html');
    expect(Buffer.concat(res.body).toString('utf-8')).toBe('<html>shell</html>');
  });

  it('serves an existing bundled file with its own content type', () => {
    fs.writeFileSync(path.join(clientDir, 'index.html'), '<html></html>', 'utf-8');
    fs.writeFileSync(path.join(clientDir, 'app.js'), 'console.log(1)', 'utf-8');

    const res = fakeResponse();
    serveStatic(clientDir, requestFor('/app.js'), res);

    expect(res.status).toBe(200);
    expect(res.headers?.['Content-Type']).toContain('text/javascript');
    expect(Buffer.concat(res.body).toString('utf-8')).toBe('console.log(1)');
  });

  it('falls back to index.html for an unknown path (SPA client-side routing)', () => {
    fs.writeFileSync(path.join(clientDir, 'index.html'), '<html>shell</html>', 'utf-8');

    const res = fakeResponse();
    serveStatic(clientDir, requestFor('/tickets/T-1'), res);

    expect(res.status).toBe(200);
    expect(Buffer.concat(res.body).toString('utf-8')).toBe('<html>shell</html>');
  });

  it('never reads outside clientDir, even for a traversal attempt', () => {
    fs.writeFileSync(path.join(clientDir, 'index.html'), '<html>shell</html>', 'utf-8');
    const secret = path.join(path.dirname(clientDir), 'secret.txt');
    fs.writeFileSync(secret, 'top secret', 'utf-8');

    const res = fakeResponse();
    serveStatic(clientDir, requestFor('/../secret.txt'), res);

    expect(Buffer.concat(res.body).toString('utf-8')).not.toContain('top secret');
    fs.rmSync(secret, { force: true });
  });

  it('returns 404 when there is no index.html to fall back to', () => {
    const res = fakeResponse();
    serveStatic(clientDir, requestFor('/'), res);

    expect(res.status).toBe(404);
  });
});
