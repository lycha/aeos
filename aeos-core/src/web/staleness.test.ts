import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from './staleness.js';

describe('sha256Hex', () => {
  it('matches a direct sha256 digest of the same content', () => {
    expect(sha256Hex('hello')).toBe(createHash('sha256').update('hello').digest('hex'));
  });

  it('differs for different content', () => {
    expect(sha256Hex('a')).not.toBe(sha256Hex('b'));
  });

  it('is stable across calls on the same content', () => {
    expect(sha256Hex('same')).toBe(sha256Hex('same'));
  });
});
