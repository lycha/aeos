// CLI command — aeos serve (tech spec §2.1). Resolves a free loopback port,
// starts the web server, opens the browser to the one-time-token URL (AC-1,
// AC-33), then blocks until SIGINT/SIGTERM. On the signal it interrupts and
// awaits every tracked job (AC-14, via run-jobs.ts's `interruptAll`, WEB-1
// decision D-001/NEW-6) before closing the server and returning.
//
import { spawn } from 'node:child_process';
import * as net from 'node:net';

import type { Handlers } from '../generated/commands.gen.js';
import { done, type CommandResult } from '../result.js';
import { mintLaunchToken } from '../../web/auth.js';
import { interruptAll } from '../../web/run-jobs.js';
import { createServer } from '../../web/server.js';

export type ServeData = { readonly port: number; readonly url: string };

// Param types come from the generated Handler so they stay in lockstep with the
// contract; serve needs no context, so it is a two-arg function (assignable to the
// three-arg Handler slot) and stays directly callable in tests.
type ServeParams = Parameters<Handlers['serve']>;

function freeLoopbackPort(): Promise<number> {
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

/** Best-effort only: a failed open (sync throw or async 'error', e.g. the opener binary missing) still leaves the token URL in `data.url` for the operator to copy. */
function openBrowser(url: string): void {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '""', url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {
      // ignored — best-effort browser auto-open
    });
    child.unref();
  } catch {
    // ignored — best-effort browser auto-open
  }
}

export const serve = async (
  _args: ServeParams[0],
  options: ServeParams[1],
): Promise<CommandResult<ServeData>> => {
  const port = options.port ?? (await freeLoopbackPort());
  const origin = `http://127.0.0.1:${port}`;
  const httpServer = createServer({ origin });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, '127.0.0.1', () => {
      httpServer.off('error', reject);
      resolve();
    });
  });

  const token = mintLaunchToken();
  const url = `${origin}/?token=${token}`;
  if (!options.noOpen) openBrowser(url);

  await new Promise<void>((resolve) => {
    const onSignal = (): void => {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      interruptAll()
        .then(() => new Promise<void>((closed) => httpServer.close(() => closed())))
        .then(resolve);
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
  });

  return done({ port, url }, `Server stopped (was listening on ${url})`);
};
