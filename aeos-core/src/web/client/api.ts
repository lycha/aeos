// Web client — the fetch primitives the views build on: the one-time token
// exchange (AC-33), the generic command proxy (tech spec §3.2/§3.3), and the
// handful of dedicated routes (§3.4–§3.9, §3.13) a ticket/epic page needs
// that the generic proxy does not cover (job start, the contract, and the
// staleness-guarded answer/resolve document forms, T-013). All are
// same-origin requests, so the browser attaches the session cookie on its
// own; nothing here reads or stores a credential.

import type { Contract } from '../../cli/contract/contract-schema.js';
import type { QuestionField } from '../../application/services/decision-promotion.service.js';
import type { Envelope } from '../../cli/generated/types.gen.js';

export async function exchangeSession(token: string): Promise<boolean> {
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return res.ok;
}

/**
 * `projectKey` is typed optional per tech spec §3.3 ("{ projectKey?: string;
 * parameters }"), but the server's generic proxy route refuses any call that
 * omits it with `PROJECT_KEY_REQUIRED`, regardless of whether the target
 * command itself needs a project — so callers must always supply one today.
 */
export async function postCli(
  commandPath: string,
  parameters: Record<string, unknown> = {},
  projectKey?: string,
): Promise<Envelope> {
  const res = await fetch(`/api/cli/${commandPath.split(' ').join('/')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(projectKey === undefined ? { parameters } : { projectKey, parameters }),
  });
  return (await res.json()) as Envelope;
}

/** `GET /api/contract` (§3.13): the catalogue a generic decision form is built from. */
export async function getContract(): Promise<Contract> {
  const res = await fetch('/api/contract');
  return (await res.json()) as Contract;
}

/** `GET /api/projects/:projectKey/features` (§3.12): the create-ticket form's spec choices (AC-24). */
export async function getFeatures(projectKey: string): Promise<string[]> {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectKey)}/features`);
  const body = (await res.json()) as { readonly features: string[] };
  return body.features;
}

export interface QuestionsData {
  readonly questions: QuestionField[];
  readonly staleness: string;
}

/** `GET …/questions` (§3.8). `null` when the ticket has no questions file. */
export async function getQuestions(
  projectKey: string,
  ticketId: string,
): Promise<QuestionsData | null> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectKey)}/tickets/${encodeURIComponent(ticketId)}/questions`,
  );
  if (!res.ok) return null;
  return (await res.json()) as QuestionsData;
}

export interface EscalationData {
  readonly reason: string;
  readonly why: string;
  readonly staleness: string;
}

/** `GET …/escalation` (§3.8). `null` when the ticket has no escalation file. */
export async function getEscalation(
  projectKey: string,
  ticketId: string,
): Promise<EscalationData | null> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectKey)}/tickets/${encodeURIComponent(ticketId)}/escalation`,
  );
  if (!res.ok) return null;
  return (await res.json()) as EscalationData;
}

/** The shape of both a passed-through CLI envelope and the `STALE_CONTENT` refusal (AC-19). */
export interface WriteOutcome {
  readonly ok: boolean;
  readonly error?: { readonly code: string; readonly message: string } | null;
}

/** `POST …/questions/answer` (§3.9). */
export async function answerQuestions(
  projectKey: string,
  ticketId: string,
  staleness: string,
  answers: Record<string, string>,
): Promise<WriteOutcome> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectKey)}/tickets/${encodeURIComponent(ticketId)}/questions/answer`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staleness, answers }),
    },
  );
  return (await res.json()) as WriteOutcome;
}

/** `POST …/escalation/resolve` (§3.10). */
export async function resolveEscalation(
  projectKey: string,
  ticketId: string,
  staleness: string,
  response: string,
): Promise<WriteOutcome> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectKey)}/tickets/${encodeURIComponent(ticketId)}/escalation/resolve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staleness, response }),
    },
  );
  return (await res.json()) as WriteOutcome;
}

export type RunStarted =
  | { readonly ok: true; readonly jobId: string }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };

/** `POST …/epics/:epicId/orchestrator-run` (§3.5): starts a tracked job, AC-25's "run". */
export async function startOrchestratorRun(
  projectKey: string,
  epicId: string,
  options: { readonly budget?: number; readonly maxSteps?: number } = {},
): Promise<RunStarted> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectKey)}/epics/${encodeURIComponent(epicId)}/orchestrator-run`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    },
  );
  return (await res.json()) as RunStarted;
}
