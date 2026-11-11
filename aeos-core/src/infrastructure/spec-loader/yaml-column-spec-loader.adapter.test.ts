import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ZodError } from 'zod';
import { YamlColumnSpecLoader } from './yaml-column-spec-loader.adapter.js';
import { Column } from '../../domain/model/column.js';
import { ColumnSpecNotFoundError } from '../../shared/errors.js';

let tmpDir: string;
let loader: YamlColumnSpecLoader;

/** Minimal valid column spec YAML content. */
function validColumnSpecYaml(overrides: Record<string, unknown> = {}): string {
  const spec = {
    column: 'SPEC_REVIEW',
    workerAgentFile: 'agents/pm-agent.yaml',
    reviewerAgentFile: 'agents/reviewer-agent.yaml',
    outputArtifact: 'prd.md',
    ...overrides,
  };
  return Object.entries(spec)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? `"${v}"` : v}`)
    .join('\n');
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-colspec-test-'));
  fs.mkdirSync(path.join(tmpDir, '.aeos', 'column-specs'), { recursive: true });
  loader = new YamlColumnSpecLoader();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('YamlColumnSpecLoader', () => {
  it('loads and returns a valid spec-review column spec', () => {
    const specPath = path.join(tmpDir, '.aeos', 'column-specs', 'spec-review.yaml');
    fs.writeFileSync(specPath, validColumnSpecYaml(), 'utf-8');

    const result = loader.load('SPEC_REVIEW', tmpDir);
    expect(result.column).toBe('SPEC_REVIEW');
    expect(result.workerAgentFile).toBe('agents/pm-agent.yaml');
    expect(result.reviewerAgentFile).toBe('agents/reviewer-agent.yaml');
    expect(result.outputArtifact).toBe('prd.md');
  });

  it('applies default values from schema', () => {
    const specPath = path.join(tmpDir, '.aeos', 'column-specs', 'spec-review.yaml');
    fs.writeFileSync(specPath, validColumnSpecYaml(), 'utf-8');

    const result = loader.load('SPEC_REVIEW', tmpDir);
    expect(result.minWordCount).toBe(50);
    // Unset in YAML so it inherits the global reviewLoop cap.
    expect(result.maxIterations).toBeUndefined();
    expect(result.escalation).toBe('escalate_to_human');
    expect(result.advanceMode).toBe('manual');
    expect(result.requiredSections).toEqual([]);
    expect(result.reviewerRubrics).toEqual([]);
    expect(result.executorMode).toBeUndefined();
  });

  it('loads optional executorMode when present', () => {
    const specPath = path.join(tmpDir, '.aeos', 'column-specs', 'spec-review.yaml');
    fs.writeFileSync(specPath, validColumnSpecYaml({ executorMode: 'agentic' }), 'utf-8');

    const result = loader.load('SPEC_REVIEW', tmpDir);
    expect(result.executorMode).toBe('agentic');
  });

  it('loads task-breakdown spec for TASK_BREAKDOWN column', () => {
    const specPath = path.join(tmpDir, '.aeos', 'column-specs', 'task-breakdown.yaml');
    fs.writeFileSync(specPath, validColumnSpecYaml({ column: 'TASK_BREAKDOWN' }), 'utf-8');

    const result = loader.load('TASK_BREAKDOWN', tmpDir);
    expect(result.column).toBe('TASK_BREAKDOWN');
  });

  it('finds a spec by its own `column:` field, whatever the file is called', () => {
    const dir = path.join(tmpDir, '.aeos', 'column-specs');
    fs.writeFileSync(
      path.join(dir, 'slicing.yaml'),
      validColumnSpecYaml({ column: 'TASK_BREAKDOWN' }),
    );
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a spec');

    expect(loader.load('TASK_BREAKDOWN', tmpDir).column).toBe('TASK_BREAKDOWN');
  });

  it('refuses two files that claim one column, naming both', () => {
    const dir = path.join(tmpDir, '.aeos', 'column-specs');
    fs.writeFileSync(path.join(dir, 'spec-review.yaml'), validColumnSpecYaml());
    fs.writeFileSync(path.join(dir, 'product-scoping.yaml'), validColumnSpecYaml());

    expect(() => loader.load('SPEC_REVIEW', tmpDir)).toThrow(
      /SPEC_REVIEW.*column-specs\/product-scoping\.yaml.*column-specs\/spec-review\.yaml/,
    );
    // No column loads while the specs disagree about which is which.
    expect(() => loader.labels(tmpDir)).toThrow(/product-scoping\.yaml/);
  });

  it('says which file it could not read when a column has no spec because of it', () => {
    const dir = path.join(tmpDir, '.aeos', 'column-specs');
    fs.writeFileSync(path.join(dir, 'spec-review.yaml'), 'column: [unclosed');

    expect(() => loader.load('SPEC_REVIEW', tmpDir)).toThrow(/column-specs\/spec-review\.yaml/);
  });

  it('defaults a column to the standard role with no diff, and loads what a spec declares', () => {
    const dir = path.join(tmpDir, '.aeos', 'column-specs');
    fs.writeFileSync(path.join(dir, 'spec-review.yaml'), validColumnSpecYaml());
    fs.writeFileSync(
      path.join(dir, 'integration-review.yaml'),
      validColumnSpecYaml({
        column: 'INTEGRATION_REVIEW',
        role: 'integration',
        diffContext: 'epic',
      }),
    );

    expect(loader.load('SPEC_REVIEW', tmpDir)).toMatchObject({
      role: 'standard',
      diffContext: 'none',
    });
    expect(loader.load('INTEGRATION_REVIEW', tmpDir)).toMatchObject({
      role: 'integration',
      diffContext: 'epic',
    });
  });

  it('refuses a role outside the approved vocabulary', () => {
    const specPath = path.join(tmpDir, '.aeos', 'column-specs', 'spec-review.yaml');
    fs.writeFileSync(specPath, validColumnSpecYaml({ role: 'release' }), 'utf-8');

    expect(() => loader.load('SPEC_REVIEW', tmpDir)).toThrow(ZodError);
  });

  it('throws ColumnSpecNotFoundError for BACKLOG column', () => {
    expect(() => loader.load(Column.BACKLOG, tmpDir)).toThrow(ColumnSpecNotFoundError);
    expect(() => loader.load(Column.BACKLOG, tmpDir)).toThrow('does not have a column spec');
  });

  it('throws ColumnSpecNotFoundError for DOD_GATE column', () => {
    expect(() => loader.load('DOD_GATE', tmpDir)).toThrow(ColumnSpecNotFoundError);
  });

  it('throws ColumnSpecNotFoundError for DONE column', () => {
    expect(() => loader.load(Column.DONE, tmpDir)).toThrow(ColumnSpecNotFoundError);
  });

  it('throws ColumnSpecNotFoundError when file does not exist for a mapped column', () => {
    // Don't create the file — it should throw
    expect(() => loader.load('SPEC_REVIEW', tmpDir)).toThrow(ColumnSpecNotFoundError);
    expect(() => loader.load('SPEC_REVIEW', tmpDir)).toThrow('Column spec file not found');
  });

  it('throws ZodError when YAML is missing required fields', () => {
    const specPath = path.join(tmpDir, '.aeos', 'column-specs', 'spec-review.yaml');
    fs.writeFileSync(specPath, 'column: "SPEC_REVIEW"\n', 'utf-8');

    expect(() => loader.load('SPEC_REVIEW', tmpDir)).toThrow(ZodError);
  });

  it('throws ZodError when YAML has invalid field types', () => {
    const specPath = path.join(tmpDir, '.aeos', 'column-specs', 'spec-review.yaml');
    const yaml = [
      'column: "SPEC_REVIEW"',
      'workerAgentFile: "agents/pm-agent.yaml"',
      'reviewerAgentFile: "agents/reviewer-agent.yaml"',
      'outputArtifact: "prd.md"',
      'minWordCount: "not-a-number"',
    ].join('\n');
    fs.writeFileSync(specPath, yaml, 'utf-8');

    expect(() => loader.load('SPEC_REVIEW', tmpDir)).toThrow(ZodError);
  });

  it('maps all expected columns to correct filenames', () => {
    const mappings: Array<[Column, string]> = [
      ['SPEC_REVIEW', 'spec-review'],
      ['TECH_SPEC', 'tech-spec'],
      ['TASK_BREAKDOWN', 'task-breakdown'],
      ['IMPLEMENTATION', 'implementation'],
      ['CODE_REVIEW', 'code-review'],
      ['QA', 'qa'],
      ['DOD_GATE', 'dod-gate'],
    ];

    for (const [column, filename] of mappings) {
      const specPath = path.join(tmpDir, '.aeos', 'column-specs', `${filename}.yaml`);
      fs.writeFileSync(specPath, validColumnSpecYaml({ column }), 'utf-8');
      const result = loader.load(column, tmpDir);
      expect(result.column).toBe(column);
    }
  });

  describe('labels', () => {
    const write = (filename: string, overrides: Record<string, unknown>): void => {
      fs.writeFileSync(
        path.join(tmpDir, '.aeos', 'column-specs', `${filename}.yaml`),
        validColumnSpecYaml(overrides),
        'utf-8',
      );
    };

    it("returns the spec's label with the spec", () => {
      write('tech-spec', { column: 'TECH_SPEC', label: 'Shaping' });

      expect(loader.load('TECH_SPEC', tmpDir).label).toBe('Shaping');
    });

    it('gives every column a label: from its spec, from project.json, or the default', () => {
      write('tech-spec', { column: 'TECH_SPEC', label: 'Shaping' });
      write('qa', { column: 'QA' });
      fs.writeFileSync(
        path.join(tmpDir, '.aeos', 'project.json'),
        JSON.stringify({ labels: { BACKLOG: 'Inbox' } }),
        'utf-8',
      );

      expect(loader.labels(tmpDir)).toMatchObject({
        BACKLOG: 'Inbox',
        SPEC_REVIEW: 'Spec review',
        TECH_SPEC: 'Shaping',
        QA: 'Qa',
        DONE: 'Done',
      });
    });

    it('fails to load, naming both files, when two column specs have the same label', () => {
      write('tech-spec', { column: 'TECH_SPEC', label: 'Shaping' });
      write('qa', { column: 'QA', label: 'shaping' });

      for (const failing of [() => loader.labels(tmpDir), () => loader.load('TECH_SPEC', tmpDir)]) {
        expect(failing).toThrow(/column-specs\/tech-spec\.yaml/);
        expect(failing).toThrow(/column-specs\/qa\.yaml/);
      }
    });

    it('fails on a label in project.json that is not text', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.aeos', 'project.json'),
        JSON.stringify({ labels: { DONE: 7 } }),
        'utf-8',
      );

      expect(() => loader.labels(tmpDir)).toThrow(/"labels" in \.aeos\/project\.json/);
    });

    it('fails on a label that is empty, too long, or the identifier of another column', () => {
      for (const label of ['', 'x'.repeat(41), 'done']) {
        write('qa', { column: 'QA', label });
        expect(() => loader.labels(tmpDir), label).toThrow(/column-specs\/qa\.yaml/);
      }
    });
  });
});
