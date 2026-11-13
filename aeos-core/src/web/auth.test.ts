// Criteria traced here: @AC-27 (Origin) @AC-28 (loopback Host) @AC-29 (session) @AC-38 (per-endpoint check matrix).
import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import {
  exchangeToken,
  mintLaunchToken,
  requireLoopback,
  requireLoopbackAndOrigin,
  requireSession,
} from './auth.js';

function requestWith(headers: Record<string, string | undefined>): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

describe('exchangeToken', () => {
  it('succeeds once for a freshly minted token, failing a replay of the same value', () => {
    const token = mintLaunchToken();

    const first = exchangeToken(token);
    expect(first.ok).toBe(true);

    const second = exchangeToken(token);
    expect(second).toEqual({ ok: false });
  });

  it('fails a token that was never minted', () => {
    expect(exchangeToken('not-a-real-token')).toEqual({ ok: false });
  });

  it('invalidates a previously minted, unexchanged token when a new one is minted', () => {
    const stale = mintLaunchToken();
    mintLaunchToken();

    expect(exchangeToken(stale)).toEqual({ ok: false });
  });
});

describe('requireSession', () => {
  it('accepts a request carrying the cookie exchangeToken issued', () => {
    const token = mintLaunchToken();
    const exchanged = exchangeToken(token);
    if (!exchanged.ok) throw new Error('expected exchange to succeed');
    const sessionId = /aeos_session=([^;]+)/.exec(exchanged.sessionCookie)?.[1];

    const req = requestWith({ cookie: `aeos_session=${sessionId}` });
    expect(requireSession(req)).toBe(true);
  });

  it('rejects a request with no cookie', () => {
    expect(requireSession(requestWith({}))).toBe(false);
  });

  it('rejects a request with an unknown session id', () => {
    expect(requireSession(requestWith({ cookie: 'aeos_session=bogus' }))).toBe(false);
  });
});

describe('requireLoopback', () => {
  it('accepts a loopback Host, regardless of Origin (GET / carries none)', () => {
    expect(
      requireLoopback({ headers: { host: '127.0.0.1:4100' } } as unknown as IncomingMessage),
    ).toBe(true);
    expect(
      requireLoopback({ headers: { host: 'localhost:4100' } } as unknown as IncomingMessage),
    ).toBe(true);
  });

  it('rejects a non-loopback Host', () => {
    expect(
      requireLoopback({ headers: { host: 'evil.example:4100' } } as unknown as IncomingMessage),
    ).toBe(false);
  });

  it('rejects a request with no Host header', () => {
    expect(requireLoopback({ headers: {} } as unknown as IncomingMessage)).toBe(false);
  });
});

describe('requireLoopbackAndOrigin', () => {
  const origin = 'http://127.0.0.1:4100';

  it('accepts a loopback Host with the matching Origin', () => {
    const req = requestWith({ host: '127.0.0.1:4100', origin });
    expect(requireLoopbackAndOrigin(req, origin)).toBe(true);
  });

  it('accepts localhost as the loopback Host', () => {
    const req = requestWith({ host: 'localhost:4100', origin });
    expect(requireLoopbackAndOrigin(req, origin)).toBe(true);
  });

  it('rejects a non-loopback Host even when Origin matches (independent of the Origin check)', () => {
    const req = requestWith({ host: 'evil.example:4100', origin });
    expect(requireLoopbackAndOrigin(req, origin)).toBe(false);
  });

  it('rejects a mismatched Origin even when Host is loopback (independent of the Host check)', () => {
    const req = requestWith({ host: '127.0.0.1:4100', origin: 'http://evil.example' });
    expect(requireLoopbackAndOrigin(req, origin)).toBe(false);
  });

  it('rejects a request with no Origin header', () => {
    const req = requestWith({ host: '127.0.0.1:4100' });
    expect(requireLoopbackAndOrigin(req, origin)).toBe(false);
  });
});
