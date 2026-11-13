import { afterEach, describe, expect, it, vi } from 'vitest';

import { exchangeSession, postCli } from './api.js';

function fakeResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('exchangeSession', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts the token to the session endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({}, true));
    vi.stubGlobal('fetch', fetchMock);

    const ok = await exchangeSession('my-token');

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'my-token' }),
    });
  });

  it('reports failure when the exchange is refused', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse({}, false)));

    expect(await exchangeSession('stale')).toBe(false);
  });
});

describe('postCli', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('builds the command path from the command name and omits projectKey when absent', async () => {
    const envelope = {
      ok: true,
      command: 'project board',
      exit: 0,
      contractVersion: 1,
      data: null,
      error: null,
      warnings: [],
    };
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(envelope));
    vi.stubGlobal('fetch', fetchMock);

    const result = await postCli('project board');

    expect(fetchMock).toHaveBeenCalledWith('/api/cli/project/board', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parameters: {} }),
    });
    expect(result).toEqual(envelope);
  });

  it('includes projectKey and parameters when given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await postCli('ticket list', { status: 'READY' }, 'EE');

    expect(fetchMock).toHaveBeenCalledWith('/api/cli/ticket/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectKey: 'EE', parameters: { status: 'READY' } }),
    });
  });
});
