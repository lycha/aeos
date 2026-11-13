// Web — the one hashing primitive every staleness check in the epic reuses
// (AC-19, AC-21): a token a caller can present later and have compared
// against a fresh hash of the same content, to detect a concurrent edit.

import { createHash } from 'node:crypto';

export function sha256Hex(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
