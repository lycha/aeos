import { describe, it, expect } from 'vitest';

import { lineDiff, formatLineDiff } from './line-diff.js';

describe('lineDiff', () => {
  it('marks unchanged lines with a space', () => {
    const diff = lineDiff('a\nb\nc', 'a\nb\nc');
    expect(diff.every((d) => d.tag === ' ')).toBe(true);
    expect(diff.map((d) => d.text)).toEqual(['a', 'b', 'c']);
  });

  it('marks a changed line as a removal followed by an addition', () => {
    const diff = lineDiff('a\nb\nc', 'a\nB\nc');
    expect(diff).toEqual([
      { tag: ' ', text: 'a' },
      { tag: '-', text: 'b' },
      { tag: '+', text: 'B' },
      { tag: ' ', text: 'c' },
    ]);
  });

  it('handles pure insertions', () => {
    const diff = lineDiff('a\nc', 'a\nb\nc');
    expect(diff).toEqual([
      { tag: ' ', text: 'a' },
      { tag: '+', text: 'b' },
      { tag: ' ', text: 'c' },
    ]);
  });
});

describe('formatLineDiff', () => {
  it('elides long unchanged runs but keeps context around changes', () => {
    const before = ['1', '2', '3', '4', '5', '6', '7', '8', 'old', '10'].join('\n');
    const after = ['1', '2', '3', '4', '5', '6', '7', '8', 'new', '10'].join('\n');

    const out = formatLineDiff(before, after, 1);

    expect(out).toContain('- old');
    expect(out).toContain('+ new');
    expect(out).toContain('⋯'); // early unchanged lines collapsed
    expect(out).toContain('  8'); // one line of context retained
    expect(out).not.toContain('  2'); // far-away unchanged line dropped
  });
});
