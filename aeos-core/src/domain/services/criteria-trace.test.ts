import { describe, expect, it } from 'vitest';

import {
  parseCriteria,
  parseFeature,
  renderCriteriaTrace,
  scenariosFor,
  testTags,
  traceCriteria,
  tracePassed,
} from './criteria-trace.js';

const SPEC = `
## Acceptance criteria

- **AC-1** — When a visitor has no saved name, the system shall greet them as "there".
- **AC-12a** (from ABS-4) — While an entry is under 7 days old, show a relative time. See AC-1.
- **AC-12b** (from ABS-4) — When an entry reaches 7 days old, show an absolute time.

## Non-goals

- **NON-GOAL-1** — Remembering the visitor's name.
- **NON-GOAL-2** — Time zones.
`;

const FEATURE = `Feature: Sample greeting

  Background:
    Given the site is up

  @AC-1
  Scenario: A visitor with no saved name
    Given a visitor with no saved name
    Then it reads "Hello, there"

  @AC-12a @AC-12b @ASM-3
  Scenario Outline: Entry age
    Given an entry <age> days old

  Scenario: Untagged
    Given nothing
`;

describe('parseCriteria', () => {
  it('reads each defined criterion once, in order; a suffix makes a separate criterion', () => {
    expect(parseCriteria(SPEC).criteria).toEqual(['AC-1', 'AC-12a', 'AC-12b']);
  });

  it('lists numbered non-goals apart from the criteria', () => {
    expect(parseCriteria(SPEC).nonGoals).toEqual(['NON-GOAL-1', 'NON-GOAL-2']);
  });
});

describe('parseFeature', () => {
  it('returns each scenario with its criterion tags and its name', () => {
    expect(parseFeature(FEATURE).scenarios.map(({ tags, name }) => ({ tags, name }))).toEqual([
      { tags: ['AC-1'], name: 'A visitor with no saved name' },
      { tags: ['AC-12a', 'AC-12b'], name: 'Entry age' },
      { tags: [], name: 'Untagged' },
    ]);
  });
});

describe('scenariosFor', () => {
  it('keeps the feature header and only the scenarios tagged with a claimed criterion', () => {
    const filtered = scenariosFor(FEATURE, ['AC-1'])!;

    expect(filtered).toContain('Feature: Sample greeting');
    expect(filtered).toContain('Given the site is up');
    expect(filtered).toContain('Scenario: A visitor with no saved name');
    expect(filtered).not.toContain('Entry age');
    expect(filtered).not.toContain('Untagged');
    expect(filtered).not.toContain('@AC-12a');
  });

  it('is null when no scenario is tagged with a claimed criterion', () => {
    expect(scenariosFor(FEATURE, ['AC-7'])).toBeNull();
  });
});

describe('testTags', () => {
  it('finds criterion ids in test titles and in @AC comment tags, and nowhere else', () => {
    const source = [
      "describe('greeting (AC-1)', () => {",
      "  it('AC-12a shows a relative time', () => {",
      "    expect(label('AC-9')).toBe('x');",
      '  });',
      '  it.skipIf(!ready)(',
      "    'falls back, AC-12b',",
      '    () => {},',
      '  );',
      '  // @AC-3 covered by the table below',
      '  const id = "AC-4";',
      '});',
    ].join('\n');

    expect(testTags(source)).toEqual([
      { id: 'AC-1', title: 'greeting (AC-1)' },
      { id: 'AC-12a', title: 'AC-12a shows a relative time' },
      { id: 'AC-12b', title: 'falls back, AC-12b' },
      { id: 'AC-3', title: null },
    ]);
  });
});

describe('traceCriteria', () => {
  const input = {
    criteria: ['AC-1', 'AC-2', 'AC-3', 'AC-4'],
    nonGoals: ['NON-GOAL-1'],
    claims: new Map([
      ['EE-2', ['AC-1', 'AC-2']],
      ['EE-3', ['AC-2', 'AC-3', 'AC-9']],
      ['EE-4', []],
    ]),
    instruments: new Map([
      ['AC-1', ['features/greeting.feature: A visitor']],
      ['AC-2', ['src/a.test.ts: AC-2 works', 'src/b.test.ts']],
      ['AC-4', ['src/c.test.ts']],
    ]),
  };

  it('gives one row per criterion with who claims it and what exercises it', () => {
    expect(traceCriteria(input).rows).toEqual([
      { id: 'AC-1', claimedBy: ['EE-2'], instruments: ['features/greeting.feature: A visitor'] },
      {
        id: 'AC-2',
        claimedBy: ['EE-2', 'EE-3'],
        instruments: ['src/a.test.ts: AC-2 works', 'src/b.test.ts'],
      },
      { id: 'AC-3', claimedBy: ['EE-3'], instruments: [] },
      { id: 'AC-4', claimedBy: [], instruments: ['src/c.test.ts'] },
    ]);
  });

  it('reports unclaimed and untested criteria and claims the spec does not contain', () => {
    const trace = traceCriteria(input);

    expect(trace.unclaimed).toEqual(['AC-4']);
    expect(trace.untested).toEqual(['AC-3']);
    expect(trace.unknownClaims).toEqual([{ taskId: 'EE-3', id: 'AC-9' }]);
    expect(tracePassed(trace)).toBe(false);
  });

  it('passes when every criterion is claimed and exercised; non-goals never block', () => {
    const trace = traceCriteria({
      criteria: ['AC-1'],
      nonGoals: ['NON-GOAL-1', 'NON-GOAL-2'],
      claims: new Map([['EE-2', ['AC-1']]]),
      instruments: new Map([['AC-1', ['src/a.test.ts']]]),
    });

    expect(tracePassed(trace)).toBe(true);
    expect(trace.nonGoals).toEqual(['NON-GOAL-1', 'NON-GOAL-2']);
    expect(trace.rows.map((row) => row.id)).toEqual(['AC-1']);
  });

  it('renders a table, what blocks, and the non-goals', () => {
    const report = renderCriteriaTrace(traceCriteria(input));

    expect(report).toContain('| AC-2 | EE-2, EE-3 | src/a.test.ts: AC-2 works<br>src/b.test.ts |');
    expect(report).toContain('| AC-4 | — | src/c.test.ts |');
    expect(report).toMatch(/Unclaimed.*AC-4/);
    expect(report).toMatch(/Untested.*AC-3/);
    expect(report).toMatch(/EE-3 claims AC-9/);
    expect(report).toMatch(/Non-goals.*NON-GOAL-1/s);
  });
});
