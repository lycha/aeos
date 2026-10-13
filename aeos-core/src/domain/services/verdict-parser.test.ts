import { describe, it, expect } from 'vitest';

import { parseVerdict } from './verdict-parser.js';
import { Verdict } from '../model/review-verdict.js';

function trailer(fields: string): string {
  return `<!-- AEOS-VERDICT\n${fields}\n-->`;
}

describe('parseVerdict', () => {
  it('parses an approved verdict', () => {
    const result = parseVerdict(`## Review\n\nAll good.\n\n${trailer('verdict: APPROVED')}`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict.verdict).toBe(Verdict.APPROVED);
    expect(result.verdict.blockers).toBe(0);
  });

  it('parses counts and blocker topics', () => {
    const result = parseVerdict(
      trailer(
        [
          'verdict: REJECTED',
          'blockers: 2',
          'warnings: 3',
          'info: 1',
          'blocker-topics: missing-error-handling, undefined-rollback-path',
        ].join('\n'),
      ),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict).toEqual({
      verdict: Verdict.REJECTED,
      blockers: 2,
      warnings: 3,
      info: 1,
      blockerTopics: ['missing-error-handling', 'undefined-rollback-path'],
    });
  });

  it('treats APPROVED_WITH_WARNINGS as its own verdict, not a plain approval', () => {
    const result = parseVerdict(
      trailer(['verdict: APPROVED_WITH_WARNINGS', 'warnings: 2'].join('\n')),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict.verdict).toBe(Verdict.APPROVED_WITH_WARNINGS);
    expect(result.verdict.warnings).toBe(2);
  });

  // Regression: the previous implementation uppercased the whole document and
  // substring-matched 'REJECTED'. The reviewer's own output-format template
  // contains that literal, so any model echoing its scaffold produced a false
  // rejection on every run.
  it('is not fooled by the word REJECTED appearing in prose', () => {
    const review = [
      '## Review',
      '',
      'The conclusion below is one of [APPROVED / APPROVED_WITH_WARNINGS / REJECTED].',
      'Nothing here would be REJECTED by the linter, and no tests FAIL.',
      '',
      trailer('verdict: APPROVED'),
    ].join('\n');

    const result = parseVerdict(review);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict.verdict).toBe(Verdict.APPROVED);
  });

  it('is not fooled by the word FAIL appearing in findings', () => {
    const review = [
      '#### INFO',
      '- [INFO] The retry path fails silently when the socket closes.',
      '',
      trailer('verdict: APPROVED'),
    ].join('\n');

    const result = parseVerdict(review);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict.verdict).toBe(Verdict.APPROVED);
  });

  it('fails loudly when the trailer is absent', () => {
    const result = parseVerdict('## Review\n\n**APPROVED**\n');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('no AEOS-VERDICT trailer');
  });

  it('fails when two trailers are present', () => {
    const result = parseVerdict(
      `${trailer('verdict: APPROVED')}\n\nscaffold:\n\n${trailer('verdict: REJECTED\nblockers: 1')}`,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('multiple AEOS-VERDICT trailers');
  });

  it('fails on an unrecognised verdict value', () => {
    const result = parseVerdict(trailer('verdict: LOOKS_FINE_TO_ME'));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('unrecognised verdict');
  });

  it('fails when the verdict field is missing', () => {
    const result = parseVerdict(trailer('blockers: 2'));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('missing the `verdict` field');
  });

  it('rejects a REJECTED verdict that cites no blockers', () => {
    const result = parseVerdict(trailer('verdict: REJECTED\nblockers: 0'));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('zero blockers');
  });

  it('derives the blocker count from topics when the declared count is lower', () => {
    const result = parseVerdict(
      trailer(
        ['verdict: REJECTED', 'blockers: 1', 'blocker-topics: alpha, beta, gamma'].join('\n'),
      ),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict.blockers).toBe(3);
  });

  it('tolerates lowercase verdicts and surrounding whitespace', () => {
    const result = parseVerdict('<!--   AEOS-VERDICT\n  verdict:   approved  \n  -->');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict.verdict).toBe(Verdict.APPROVED);
  });
});
