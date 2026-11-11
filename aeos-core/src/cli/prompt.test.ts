import { describe, expect, it, vi } from 'vitest';

const created: { output: unknown }[] = [];
vi.mock('node:readline', () => ({
  createInterface: (options: { output: unknown }) => {
    created.push(options);
    return {
      question: (_q: string, answer: (line: string) => void) => answer(' y \n'),
      close() {},
    };
  },
}));

import { terminalPrompt } from './prompt.js';

describe('terminalPrompt', () => {
  it('asks on stderr, never stdout, and returns the trimmed answer', async () => {
    await expect(terminalPrompt.ask('Continue? [y/N] ')).resolves.toBe('y');

    expect(created).toEqual([expect.objectContaining({ output: process.stderr })]);
  });

  it('is interactive exactly when stdin is a terminal', () => {
    const saved = process.stdin.isTTY;
    process.stdin.isTTY = true;
    expect(terminalPrompt.interactive).toBe(true);
    process.stdin.isTTY = false;
    expect(terminalPrompt.interactive).toBe(false);
    process.stdin.isTTY = saved;
  });
});
