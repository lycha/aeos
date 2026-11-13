// Web — serves the bundled SPA from `clientDir` (tech spec §3.1). Any
// request path falls back to `index.html` (client-side routing is the SPA's
// own concern, not this server's); a name is taken only as a basename, so a
// request path is never used to read outside `clientDir`.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export function serveStatic(clientDir: string, req: IncomingMessage, res: ServerResponse): void {
  const requestedPath = (req.url ?? '/').split('?')[0] ?? '/';
  const requestedName = requestedPath === '/' ? 'index.html' : path.basename(requestedPath);
  const candidate = path.join(clientDir, requestedName);
  const servedPath =
    fs.existsSync(candidate) && fs.statSync(candidate).isFile()
      ? candidate
      : path.join(clientDir, 'index.html');

  if (!fs.existsSync(servedPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const contentType = CONTENT_TYPES[path.extname(servedPath)] ?? 'application/octet-stream';
  // The single-document bundle is rebuilt in place; never let the browser serve
  // a stale copy after a rebuild. No separate assets are cached either.
  res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
  res.end(fs.readFileSync(servedPath));
}
