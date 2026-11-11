import { describe, it, expect } from 'vitest';

import { reportsCost } from './executor-capabilities.js';

describe('reportsCost', () => {
  it.each(['claude-cli', 'stub'] as const)('%s reports cost', (type) => {
    expect(reportsCost(type)).toBe(true);
  });

  it.each(['auggie-cli', 'opencode-cli', 'ollama-cli'] as const)(
    '%s does not report cost',
    (type) => {
      expect(reportsCost(type)).toBe(false);
    },
  );
});
