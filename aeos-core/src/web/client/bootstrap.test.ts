import { describe, expect, it } from 'vitest';

import { readLaunchToken } from './bootstrap.js';

describe('readLaunchToken', () => {
  it('extracts the token and strips it from the URL (AC-33)', () => {
    const result = readLaunchToken('http://127.0.0.1:4100/?token=abc123');

    expect(result.token).toBe('abc123');
    expect(result.strippedUrl).toBe('http://127.0.0.1:4100/');
  });

  it('returns a null token and the URL unchanged when there is none', () => {
    const result = readLaunchToken('http://127.0.0.1:4100/');

    expect(result.token).toBeNull();
    expect(result.strippedUrl).toBe('http://127.0.0.1:4100/');
  });

  it('preserves other query parameters while removing only the token', () => {
    const result = readLaunchToken('http://127.0.0.1:4100/?token=abc123&foo=bar');

    expect(result.token).toBe('abc123');
    expect(result.strippedUrl).toBe('http://127.0.0.1:4100/?foo=bar');
  });
});
