// Web — the route table (tech spec §3, all subsections): wires every route
// onto the components T-002–T-009 already built. Every route except `GET /`
// and `POST /api/auth/session` refuses a request with a mismatched Host or
// Origin, or no valid session, before any business logic runs (AC-27, AC-28,
// AC-29, AC-33; the exact per-route matrix is WEB-1 decision D-001). Starting
// the server (port, browser auto-open, SIGINT handling) is T-011's job, not
// this module's — this exports only the request handler.

import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';

import { loadContract, packageRoot } from '../cli/contract/load-contract.js';
import type { Contract } from '../cli/contract/contract-schema.js';
import { EXIT } from '../cli/generated/exit-codes.gen.js';
import { FsConfigStore } from '../infrastructure/filesystem/fs-config.adapter.js';
import {
  exchangeToken,
  requireLoopback,
  requireLoopbackAndOrigin,
  requireSession,
} from './auth.js';
import { buildArgv, proxyCommand } from './cli-proxy.js';
import { resolve as resolveArtifact } from './artifacts.js';
import { listFeatures } from './presentation-reads.js';
import { readEscalation, readQuestions, writeAnswers, writeResolution } from './qa-documents.js';
import { interrupt, startJob } from './run-jobs.js';
import { handleJobEvents } from './sse.js';
import { serveStatic } from './static.js';

const configStore = new FsConfigStore();

const ROUTES = {
  cliProxy: /^\/api\/cli\/(.+)$/,
  ticketRun: /^\/api\/projects\/([^/]+)\/tickets\/([^/]+)\/run$/,
  orchestratorRun: /^\/api\/projects\/([^/]+)\/epics\/([^/]+)\/orchestrator-run$/,
  jobEvents: /^\/api\/jobs\/([^/]+)\/events$/,
  jobInterrupt: /^\/api\/jobs\/([^/]+)\/interrupt$/,
  questions: /^\/api\/projects\/([^/]+)\/tickets\/([^/]+)\/questions$/,
  escalation: /^\/api\/projects\/([^/]+)\/tickets\/([^/]+)\/escalation$/,
  questionsAnswer: /^\/api\/projects\/([^/]+)\/tickets\/([^/]+)\/questions\/answer$/,
  escalationResolve: /^\/api\/projects\/([^/]+)\/tickets\/([^/]+)\/escalation\/resolve$/,
  artifact: /^\/api\/projects\/([^/]+)\/tickets\/([^/]+)\/artifacts\/([^/]+)$/,
  features: /^\/api\/projects\/([^/]+)\/features$/,
} as const;

export interface WebServerOptions {
  /** This server's own origin (e.g. `http://127.0.0.1:4100`), chosen by the caller once the port is known. */
  readonly origin: string;
  /** Directory the bundled SPA was built into. Defaults to `dist/web/client` beside the installed package. */
  readonly clientDir?: string;
}

function resolveProjectPath(projectKey: string): string | null {
  const entry = configStore.readRegistry().find((project) => project.key === projectKey);
  return entry ? entry.path : null;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function transportRefusal(res: ServerResponse, status: 401 | 403, message: string): void {
  sendJson(res, status, { ok: false, transportError: true, message });
}

function notFound(res: ServerResponse, code: string, message: string): void {
  sendJson(res, 404, { ok: false, error: { code, message, resource: null } });
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf-8');
  if (raw.length === 0) return {};
  const parsed = JSON.parse(raw) as unknown;
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
}

/** Resolves `projectKey` or sends the `PROJECT_NOT_FOUND` 404 itself. */
function withProject(
  res: ServerResponse,
  projectKey: string,
  handle: (projectPath: string) => void | Promise<void>,
): void | Promise<void> {
  const projectPath = resolveProjectPath(projectKey);
  if (!projectPath) {
    notFound(res, 'PROJECT_NOT_FOUND', `Unknown project "${projectKey}"`);
    return;
  }
  return handle(projectPath);
}

async function handleAuthSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req);
  const token = typeof body.token === 'string' ? body.token : '';
  const result = exchangeToken(token);
  if (!result.ok) {
    transportRefusal(res, 401, 'TOKEN_INVALID');
    return;
  }
  res.writeHead(204, { 'Set-Cookie': result.sessionCookie });
  res.end();
}

async function handleCliProxy(
  req: IncomingMessage,
  res: ServerResponse,
  contract: Contract,
  commandPath: string,
): Promise<void> {
  const body = await readJsonBody(req);
  const projectKey = typeof body.projectKey === 'string' ? body.projectKey : '';
  if (!projectKey) {
    sendJson(res, 400, {
      ok: false,
      error: { code: 'PROJECT_KEY_REQUIRED', message: 'projectKey is required', resource: null },
    });
    return;
  }
  if (!contract.commands[commandPath]) {
    notFound(res, 'COMMAND_NOT_FOUND', `Unknown command "${commandPath}"`);
    return;
  }
  await withProject(res, projectKey, async (projectPath) => {
    const parameters =
      typeof body.parameters === 'object' && body.parameters !== null
        ? (body.parameters as Record<string, unknown>)
        : {};
    const envelope = await proxyCommand(contract, commandPath, projectPath, parameters);
    sendJson(res, 200, envelope);
  });
}

function runInProgress(res: ServerResponse, projectKey: string): void {
  sendJson(res, 200, {
    ok: false,
    exit: EXIT.needs_human,
    error: {
      code: 'RUN_IN_PROGRESS',
      message: `A run is already in progress for project "${projectKey}"`,
      resource: null,
    },
  });
}

async function handleTicketRun(
  req: IncomingMessage,
  res: ServerResponse,
  contract: Contract,
  projectKey: string,
  ticketId: string,
): Promise<void> {
  await withProject(res, projectKey, async (projectPath) => {
    const body = await readJsonBody(req);
    const parameters: Record<string, unknown> = { id: ticketId };
    if (typeof body.executor === 'string') parameters.executor = body.executor;
    if (typeof body.model === 'string') parameters.model = body.model;
    const argv = buildArgv(contract.commands['ticket run'], 'ticket run', parameters);
    const started = startJob(projectKey, projectPath, argv);
    if (!started.ok) return runInProgress(res, projectKey);
    sendJson(res, 200, { ok: true, jobId: started.jobId });
  });
}

async function handleOrchestratorRun(
  req: IncomingMessage,
  res: ServerResponse,
  contract: Contract,
  projectKey: string,
  epicId: string,
): Promise<void> {
  await withProject(res, projectKey, async (projectPath) => {
    const body = await readJsonBody(req);
    const parameters: Record<string, unknown> = { epicId };
    if (typeof body.budget === 'number') parameters.budget = body.budget;
    if (typeof body.maxSteps === 'number') parameters['max-steps'] = body.maxSteps;
    const argv = buildArgv(contract.commands['orchestrator run'], 'orchestrator run', parameters);
    const started = startJob(projectKey, projectPath, argv);
    if (!started.ok) return runInProgress(res, projectKey);
    sendJson(res, 200, { ok: true, jobId: started.jobId });
  });
}

function handleInterrupt(res: ServerResponse, jobId: string): void {
  if (!interrupt(jobId)) {
    sendJson(res, 200, {
      ok: false,
      error: { code: 'JOB_NOT_FOUND', message: `Unknown job "${jobId}"`, resource: null },
    });
    return;
  }
  sendJson(res, 200, { ok: true });
}

function handleReadQuestions(res: ServerResponse, projectPath: string, ticketId: string): void {
  const document = readQuestions(projectPath, ticketId);
  if (!document) {
    notFound(res, 'NOT_FOUND', `No questions file for "${ticketId}"`);
    return;
  }
  sendJson(res, 200, { ok: true, ...document });
}

function handleReadEscalation(res: ServerResponse, projectPath: string, ticketId: string): void {
  const document = readEscalation(projectPath, ticketId);
  if (!document) {
    notFound(res, 'NOT_FOUND', `No escalation file for "${ticketId}"`);
    return;
  }
  sendJson(res, 200, { ok: true, ...document });
}

function staleRefusal(res: ServerResponse): void {
  sendJson(res, 200, {
    ok: false,
    exit: EXIT.needs_human,
    error: {
      code: 'STALE_CONTENT',
      message: 'The file changed on disk since it was read.',
      resource: null,
    },
  });
}

async function handleAnswerQuestions(
  req: IncomingMessage,
  res: ServerResponse,
  contract: Contract,
  projectPath: string,
  ticketId: string,
): Promise<void> {
  const body = await readJsonBody(req);
  const staleness = typeof body.staleness === 'string' ? body.staleness : '';
  const answers =
    typeof body.answers === 'object' && body.answers !== null
      ? (body.answers as Record<string, string>)
      : {};
  const result = writeAnswers(projectPath, ticketId, staleness, answers);
  if (!result.ok) return staleRefusal(res);
  const envelope = await proxyCommand(contract, 'ticket answer', projectPath, {
    id: ticketId,
    yes: true,
  });
  sendJson(res, 200, envelope);
}

async function handleResolveEscalation(
  req: IncomingMessage,
  res: ServerResponse,
  contract: Contract,
  projectPath: string,
  ticketId: string,
): Promise<void> {
  const body = await readJsonBody(req);
  const staleness = typeof body.staleness === 'string' ? body.staleness : '';
  const response = typeof body.response === 'string' ? body.response : '';
  const result = writeResolution(projectPath, ticketId, staleness, response);
  if (!result.ok) return staleRefusal(res);
  const envelope = await proxyCommand(contract, 'ticket resolve', projectPath, {
    id: ticketId,
    yes: true,
  });
  sendJson(res, 200, envelope);
}

function handleArtifact(
  res: ServerResponse,
  projectPath: string,
  ticketId: string,
  artifactName: string,
): void {
  const result = resolveArtifact(projectPath, ticketId, artifactName);
  if (!result.ok) {
    notFound(res, 'ARTIFACT_NOT_FOUND', `No artifact "${artifactName}" on "${ticketId}"`);
    return;
  }
  // Never text/html (AC-31): a model-written artifact is rendered inertly.
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(result.content);
}

function handleFeatures(res: ServerResponse, projectPath: string): void {
  sendJson(res, 200, { ok: true, features: listFeatures(projectPath) });
}

type RouteKind = 'public' | 'auth-bootstrap' | 'protected';

/** The per-route auth matrix of WEB-1 decision D-001/NEW-5. */
function authorize(
  req: IncomingMessage,
  res: ServerResponse,
  origin: string,
  kind: RouteKind,
): boolean {
  if (kind === 'public') {
    if (!requireLoopback(req)) {
      transportRefusal(res, 403, 'Forbidden');
      return false;
    }
    return true;
  }
  if (!requireLoopbackAndOrigin(req, origin)) {
    transportRefusal(res, 403, 'Forbidden');
    return false;
  }
  if (kind === 'protected' && !requireSession(req)) {
    transportRefusal(res, 401, 'Unauthorized');
    return false;
  }
  return true;
}

async function route(
  req: IncomingMessage,
  res: ServerResponse,
  contract: Contract,
  options: WebServerOptions,
): Promise<void> {
  const method = req.method ?? 'GET';
  const pathname = new URL(req.url ?? '/', 'http://placeholder').pathname;
  const clientDir = options.clientDir ?? `${packageRoot()}/dist/web/client`;

  if (method === 'GET' && pathname === '/') {
    if (!authorize(req, res, options.origin, 'public')) return;
    serveStatic(clientDir, req, res);
    return;
  }

  if (method === 'POST' && pathname === '/api/auth/session') {
    if (!authorize(req, res, options.origin, 'auth-bootstrap')) return;
    await handleAuthSession(req, res);
    return;
  }

  if (!authorize(req, res, options.origin, 'protected')) return;

  if (method === 'GET' && pathname === '/api/contract') {
    sendJson(res, 200, contract);
    return;
  }

  let match: RegExpMatchArray | null;

  if (method === 'POST' && (match = pathname.match(ROUTES.cliProxy))) {
    await handleCliProxy(req, res, contract, decodeURIComponent(match[1]).split('/').join(' '));
    return;
  }
  if (method === 'GET' && (match = pathname.match(ROUTES.jobEvents))) {
    handleJobEvents(req, res, decodeURIComponent(match[1]));
    return;
  }
  if (method === 'POST' && (match = pathname.match(ROUTES.jobInterrupt))) {
    handleInterrupt(res, decodeURIComponent(match[1]));
    return;
  }
  if (method === 'POST' && (match = pathname.match(ROUTES.ticketRun))) {
    await handleTicketRun(
      req,
      res,
      contract,
      decodeURIComponent(match[1]),
      decodeURIComponent(match[2]),
    );
    return;
  }
  if (method === 'POST' && (match = pathname.match(ROUTES.orchestratorRun))) {
    await handleOrchestratorRun(
      req,
      res,
      contract,
      decodeURIComponent(match[1]),
      decodeURIComponent(match[2]),
    );
    return;
  }
  if (method === 'GET' && (match = pathname.match(ROUTES.questions))) {
    await withProject(res, decodeURIComponent(match[1]), (projectPath) =>
      handleReadQuestions(res, projectPath, decodeURIComponent(match![2])),
    );
    return;
  }
  if (method === 'GET' && (match = pathname.match(ROUTES.escalation))) {
    await withProject(res, decodeURIComponent(match[1]), (projectPath) =>
      handleReadEscalation(res, projectPath, decodeURIComponent(match![2])),
    );
    return;
  }
  if (method === 'POST' && (match = pathname.match(ROUTES.questionsAnswer))) {
    await withProject(res, decodeURIComponent(match[1]), (projectPath) =>
      handleAnswerQuestions(req, res, contract, projectPath, decodeURIComponent(match![2])),
    );
    return;
  }
  if (method === 'POST' && (match = pathname.match(ROUTES.escalationResolve))) {
    await withProject(res, decodeURIComponent(match[1]), (projectPath) =>
      handleResolveEscalation(req, res, contract, projectPath, decodeURIComponent(match![2])),
    );
    return;
  }
  if (method === 'GET' && (match = pathname.match(ROUTES.artifact))) {
    await withProject(res, decodeURIComponent(match[1]), (projectPath) =>
      handleArtifact(
        res,
        projectPath,
        decodeURIComponent(match![2]),
        decodeURIComponent(match![3]),
      ),
    );
    return;
  }
  if (method === 'GET' && (match = pathname.match(ROUTES.features))) {
    await withProject(res, decodeURIComponent(match[1]), (projectPath) =>
      handleFeatures(res, projectPath),
    );
    return;
  }

  notFound(res, 'NOT_FOUND', `No route for ${method} ${pathname}`);
}

/**
 * Builds the request listener for `aeos serve` (tech spec §3). Starting the
 * server (binding the port, opening the browser, SIGINT/SIGTERM handling —
 * AC-1, AC-14) is `serve.handler.ts`'s job (T-011), not this function's.
 */
export function createServer(options: WebServerOptions): Server {
  const contract = loadContract();
  return createHttpServer((req, res) => {
    route(req, res, contract, options).catch((error: unknown) => {
      if (res.writableEnded) return;
      sendJson(res, 500, {
        ok: false,
        transportError: true,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  });
}
