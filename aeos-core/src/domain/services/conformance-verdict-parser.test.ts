import { describe, expect, it } from 'vitest';

import { parseConformanceVerdicts } from './conformance-verdict-parser.js';

const block = (...lines: string[]): string =>
  ['# Judgement', '', 'Prose.', '', '<!-- AEOS-CONFORMANCE', ...lines, '-->'].join('\n');

describe('parseConformanceVerdicts', () => {
  it('reads one verdict and its justification per criterion', () => {
    const parsed = parseConformanceVerdicts(
      block('AC-2: pass | The diff adds the greeting.', 'AC-12a: FAIL | No code path stores it.'),
      ['AC-2', 'AC-12a'],
    );

    expect(parsed).toEqual({
      ok: true,
      verdicts: [
        { id: 'AC-2', result: 'pass', justification: 'The diff adds the greeting.' },
        { id: 'AC-12a', result: 'fail', justification: 'No code path stores it.' },
      ],
    });
  });

  it.each([
    ['no block', '# Judgement\n\nAC-2 passes.', 'no AEOS-CONFORMANCE block'],
    ['two blocks', block('AC-2: pass | a') + '\n' + block('AC-2: fail | b'), 'multiple'],
    ['a verdict that is neither pass nor fail', block('AC-2: probably | a'), 'AC-2: probably'],
    ['no justification', block('AC-2: pass'), 'AC-2: pass'],
    ['a criterion judged twice', block('AC-2: pass | a', 'AC-2: fail | b'), 'more than once'],
    ['a criterion that was asked about and is missing', block('AC-3: pass | a'), 'AC-2'],
    ['a criterion nobody asked about', block('AC-2: pass | a', 'AC-9: pass | b'), 'AC-9'],
  ])('refuses %s', (_name, content, reason) => {
    const parsed = parseConformanceVerdicts(content, ['AC-2']);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain(reason);
  });

  it('checks the ids only when told which were asked about', () => {
    expect(parseConformanceVerdicts(block('AC-9: pass | a')).ok).toBe(true);
  });
});
