// Web — the per-launch credential lifecycle and the loopback/Origin/session
// guards every route but the two auth endpoints must pass (AC-27–30, AC-33).
//
// All state is in-memory, scoped to the `aeos serve` process: a token minted
// by one run is meaningless to another, and nothing here is ever written to
// disk, logged, or added to a spawned executor's environment (AC-30 — that
// guarantee holds structurally, because `cli-proxy.ts`'s env allowlist never
// reads this module).

import { randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

const SESSION_COOKIE_NAME = 'aeos_session';
const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost):\d+$/;

/** The one outstanding one-time token, or null once exchanged (or before the first mint). */
let pendingLaunchToken: string | null = null;
const sessions = new Set<string>();

/** Mints a fresh one-time token, replacing any still-unexchanged one. */
export function mintLaunchToken(): string {
  pendingLaunchToken = randomBytes(32).toString('hex');
  return pendingLaunchToken;
}

/**
 * Trades a one-time token for a session cookie. Succeeds at most once per
 * minted token (AC-33): the token is cleared immediately so a later caller,
 * replaying the same value, is refused.
 */
export function exchangeToken(token: string): { ok: true; sessionCookie: string } | { ok: false } {
  if (pendingLaunchToken === null || token !== pendingLaunchToken) return { ok: false };
  pendingLaunchToken = null;
  const sessionId = randomBytes(32).toString('hex');
  sessions.add(sessionId);
  return {
    ok: true,
    sessionCookie: `${SESSION_COOKIE_NAME}=${sessionId}; HttpOnly; SameSite=Strict; Path=/`,
  };
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map((part) => {
        const idx = part.indexOf('=');
        return idx === -1 ? [part, ''] : [part.slice(0, idx), part.slice(idx + 1)];
      }),
  );
}

/** Whether the request carries a cookie naming a session this process minted (AC-29). */
export function requireSession(req: IncomingMessage): boolean {
  const sessionId = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME];
  return sessionId !== undefined && sessions.has(sessionId);
}

/**
 * Whether the request is addressed to this machine's own loopback address
 * (AC-28). The DNS-rebinding defense, and the one check that applies to
 * every request without exception (WEB-1 decision D-001/NEW-5) — including
 * `GET /`, whose top-level browser navigation carries no Origin header.
 */
export function requireLoopback(req: IncomingMessage): boolean {
  const host = req.headers.host;
  return typeof host === 'string' && LOOPBACK_HOST.test(host);
}

/**
 * Whether the request is addressed to this machine's own loopback address
 * (AC-28) AND did not come from another origin (AC-27). A cross-origin request
 * always carries an `Origin`, so a present `Origin` must match; an absent one
 * means a same-origin GET/HEAD (browsers omit `Origin` on those, and a page
 * cannot forge it — `Origin` is a forbidden header), which is allowed. Each
 * half is checked on its own value, so a pass in one never substitutes for the
 * other.
 */
export function requireLoopbackAndOrigin(req: IncomingMessage, expectedOrigin: string): boolean {
  const { origin } = req.headers;
  const originOk = origin === undefined || origin === expectedOrigin;
  return requireLoopback(req) && originOk;
}
