import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { YamlDecisionsFile } from './decisions-file.adapter.js';

const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../e2e/fixtures/feature-sample/decisions.yaml',
);

describe('YamlDecisionsFile', () => {
  let dir: string;
  let file: string;
  const decisions = (): Array<Record<string, unknown>> =>
    (yaml.load(fs.readFileSync(file, 'utf-8')) as { decisions: Array<Record<string, unknown>> })
      .decisions;
  const amendment = {
    question: 'What greets a visitor at night?',
    resolution: 'The same greeting: "there".',
    evidence: 'EE-3: tickets/EE-3/EE-3-questions.md#Q-001',
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-decisions-'));
    file = path.join(dir, 'decisions.yaml');
    fs.copyFileSync(fixture, file);
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('appends a DECIDED human entry with the next free ids and keeps the rest of the file', () => {
    const before = fs.readFileSync(file, 'utf-8').replace('decisions:\n', '# why\ndecisions:\n');
    fs.writeFileSync(file, before);

    const ids = new YamlDecisionsFile().amend(dir, [amendment, amendment]);

    expect(ids).toEqual([
      { absence: 'NEW-1', becomes: 'AC-2' },
      { absence: 'NEW-2', becomes: 'AC-3' },
    ]);
    expect(decisions()).toHaveLength(3);
    expect(decisions()[1]).toEqual({
      absence: 'NEW-1',
      outcome: 'DECIDED',
      resolution: amendment.resolution,
      becomes: 'AC-2',
      decided_by: 'human',
      question: amendment.question,
      evidence: amendment.evidence,
    });
    // Everything that was there is still there, comment included, in order.
    const after = fs.readFileSync(file, 'utf-8');
    const [head, tail] = before.split('summary:');
    expect(after.startsWith(head!)).toBe(true);
    expect(after.endsWith(`summary:${tail}`)).toBe(true);
  });

  it('continues the sequences the file already has', () => {
    fs.writeFileSync(
      file,
      fs
        .readFileSync(file, 'utf-8')
        .replace('absence: ABS-1', 'absence: NEW-4')
        .replace('becomes: AC-1', 'becomes: AC-12'),
    );

    expect(new YamlDecisionsFile().amend(dir, [amendment])).toEqual([
      { absence: 'NEW-5', becomes: 'AC-13' },
    ]);
  });

  it('adds the list when the file has none', () => {
    fs.writeFileSync(file, fs.readFileSync(file, 'utf-8').replace(/decisions:\n(  .*\n)+/, ''));

    new YamlDecisionsFile().amend(dir, [amendment]);

    expect(decisions()).toMatchObject([{ absence: 'NEW-1', becomes: 'AC-1' }]);
  });
});
