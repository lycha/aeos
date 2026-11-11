// Domain service — criterion tracing: is every acceptance criterion of a spec
// claimed by a task and exercised by a test or a scenario? Deterministic; no
// model is asked. Reading files and globbing are the caller's job.

/** `AC-12`, or `AC-12a` where one decision produced two criteria. */
const ID = String.raw`AC-\d+[a-z]?`;
export const CRITERION_ID = new RegExp(`^${ID}$`);

const unique = (values: Iterable<string>): string[] => [...new Set(values)];

/**
 * The criteria and numbered non-goals a `spec.md` defines. spec-writer writes
 * each definition in bold (`**AC-12** (from ABS-4) — …`); a plain mention of an
 * id elsewhere in the text is a reference, not a criterion.
 */
export function parseCriteria(specMd: string): { criteria: string[]; nonGoals: string[] } {
  const bold = (pattern: string): string[] =>
    unique([...specMd.matchAll(new RegExp(`\\*\\*(${pattern})\\*\\*`, 'g'))].map((m) => m[1]!));
  return { criteria: bold(ID), nonGoals: bold(String.raw`NON-GOAL-\d+`) };
}

export interface Scenario {
  /** Criterion ids from the `@AC-n` tags above the scenario. */
  readonly tags: string[];
  readonly name: string;
  /** The scenario with its tag lines, as written. */
  readonly text: string;
}

/** Splits a `.feature` file into what precedes the first scenario and the scenarios. */
export function parseFeature(text: string): { header: string; scenarios: Scenario[] } {
  const lines = text.split('\n');
  const starts: number[] = [];
  lines.forEach((line, index) => {
    if (!/^\s*(Scenario|Scenario Outline|Scenario Template|Example):/.test(line)) return;
    let start = index;
    while (start > 0 && lines[start - 1]!.trim().startsWith('@')) start--;
    starts.push(start);
  });
  const scenarios = starts.map((start, i) => {
    const block = lines.slice(start, starts[i + 1] ?? lines.length);
    const title = block.findIndex((line) => !line.trim().startsWith('@'));
    return {
      tags: unique(
        block
          .slice(0, title)
          .flatMap((line) => [...line.matchAll(new RegExp(`@(${ID})\\b`, 'g'))].map((m) => m[1]!)),
      ),
      name: block[title]!.slice(block[title]!.indexOf(':') + 1).trim(),
      text: block.join('\n'),
    };
  });
  return { header: lines.slice(0, starts[0] ?? lines.length).join('\n'), scenarios };
}

/** The feature reduced to the scenarios tagged with one of `ids`; null when there are none. */
export function scenariosFor(text: string, ids: readonly string[]): string | null {
  const { header, scenarios } = parseFeature(text);
  const kept = scenarios.filter((scenario) => scenario.tags.some((tag) => ids.includes(tag)));
  return kept.length > 0 ? [header, ...kept.map((scenario) => scenario.text)].join('\n') : null;
}

/**
 * Criterion ids a test file is tagged with: `AC-n` in the title of an `it`,
 * `test` or `describe`, or `@AC-n` in a comment (title null: the whole file).
 */
export function testTags(source: string): Array<{ id: string; title: string | null }> {
  const titles = source.matchAll(
    /\b(?:it|test|describe)(?:\.[\w.]+)?(?:\([^()]*\))?\(\s*(['"`])((?:(?!\1).)*)\1/g,
  );
  const inTitles = [...titles].flatMap((match) =>
    [...match[2]!.matchAll(new RegExp(`\\b${ID}\\b`, 'g'))].map((id) => ({
      id: id[0],
      title: match[2]!,
    })),
  );
  const inComments = source
    .split('\n')
    .filter((line) => /^\s*(\/\/|\/?\*|#)/.test(line))
    .flatMap((line) => [...line.matchAll(new RegExp(`@(${ID})\\b`, 'g'))])
    .map((match) => ({ id: match[1]!, title: null }));
  return [...inTitles, ...inComments];
}

export interface CriteriaTraceInput {
  readonly criteria: readonly string[];
  readonly nonGoals: readonly string[];
  /** Task id → the criteria it declared with `--implements`. */
  readonly claims: ReadonlyMap<string, readonly string[]>;
  /** Criterion id → the scenarios and tests tagged with it. */
  readonly instruments: ReadonlyMap<string, readonly string[]>;
}

export interface CriteriaTrace {
  readonly rows: Array<{ id: string; claimedBy: string[]; instruments: string[] }>;
  /** Criteria no task claims. */
  readonly unclaimed: string[];
  /** Criteria no test title or scenario tag names. */
  readonly untested: string[];
  /** Claims of an id the spec does not contain. */
  readonly unknownClaims: Array<{ taskId: string; id: string }>;
  /** Listed for the reader; never traced, never blocking. */
  readonly nonGoals: string[];
}

export function traceCriteria(input: CriteriaTraceInput): CriteriaTrace {
  const claims = [...input.claims];
  const rows = input.criteria.map((id) => ({
    id,
    claimedBy: claims.filter(([, ids]) => ids.includes(id)).map(([taskId]) => taskId),
    instruments: [...(input.instruments.get(id) ?? [])],
  }));
  return {
    rows,
    unclaimed: rows.filter((row) => row.claimedBy.length === 0).map((row) => row.id),
    untested: rows.filter((row) => row.instruments.length === 0).map((row) => row.id),
    unknownClaims: claims.flatMap(([taskId, ids]) =>
      ids.filter((id) => !input.criteria.includes(id)).map((id) => ({ taskId, id })),
    ),
    nonGoals: [...input.nonGoals],
  };
}

export function tracePassed(trace: CriteriaTrace): boolean {
  return (
    trace.unclaimed.length === 0 && trace.untested.length === 0 && trace.unknownClaims.length === 0
  );
}

export function renderCriteriaTrace(trace: CriteriaTrace): string {
  const list = (ids: readonly string[]): string => (ids.length > 0 ? ids.join(', ') : 'none');
  return [
    '# Criteria trace',
    '',
    tracePassed(trace)
      ? 'Every criterion is claimed by a task and named by a test or a scenario.'
      : 'Blocked. An unclaimed criterion needs a task or a spec amendment; an untested one needs a tagged test or scenario; an unknown claim needs correcting.',
    '',
    `- Unclaimed: ${list(trace.unclaimed)}`,
    `- Untested: ${list(trace.untested)}`,
    `- Unknown claims: ${list(trace.unknownClaims.map((claim) => `${claim.taskId} claims ${claim.id}`))}`,
    '',
    '| Criterion | Claimed by | Instruments |',
    '| --- | --- | --- |',
    ...trace.rows.map(
      (row) =>
        `| ${row.id} | ${row.claimedBy.join(', ') || '—'} | ${row.instruments.join('<br>') || '—'} |`,
    ),
    '',
    `Non-goals (listed, not traced): ${list(trace.nonGoals)}`,
    '',
  ].join('\n');
}
