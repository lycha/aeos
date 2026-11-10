import { describe, expect, it } from 'vitest';

import { parseRepro } from './repro-parser.js';

const COMMAND = 'npx vitest run src/foo.test.ts -t "returns 404 for a missing ticket"';
const block = (command = COMMAND): string => `<!-- AEOS-REPRO\ncommand: ${command}\n-->`;

describe('parseRepro', () => {
  it('reads the command that runs the reproducing test, colons and quotes included', () => {
    expect(parseRepro(`# Notes\n\nAdded a failing test.\n\n${block()}\n`)).toEqual({
      ok: true,
      command: COMMAND,
    });
  });

  it.each([
    ['no block', '# Notes\n\nRun npx vitest.', 'no AEOS-REPRO block'],
    ['two blocks', `${block()}\n${block('npm test')}`, 'multiple'],
    ['a block with no command', '<!-- AEOS-REPRO\n-->', '`command`'],
    ['an empty command', block(''), '`command`'],
  ])('refuses %s', (_name, content, reason) => {
    const parsed = parseRepro(content);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain(reason);
  });
});
