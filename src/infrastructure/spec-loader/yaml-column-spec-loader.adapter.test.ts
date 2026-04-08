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
    column: 'PRODUCT_SCOPING',
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
  it('loads and returns a valid product-scoping column spec', () => {
    const specPath = path.join(tmpDir, '.aeos', 'column-specs', 'product-scoping.yaml');
    fs.writeFileSync(specPath, validColumnSpecYaml(), 'utf-8');

    const result = loader.load(Column.PRODUCT_SCOPING, tmpDir);
    expect(result.column).toBe('PRODUCT_SCOPING');
    expect(result.workerAgentFile).toBe('agents/pm-agent.yaml');
    expect(result.reviewerAgentFile).toBe('agents/reviewer-agent.yaml');
    expect(result.outputArtifact).toBe('prd.md');
  });

  it('applies default values from schema', () => {
    const specPath = path.join(tmpDir, '.aeos', 'column-specs', 'product-scoping.yaml');
    fs.writeFileSync(specPath, validColumnSpecYaml(), 'utf-8');

    const result = loader.load(Column.PRODUCT_SCOPING, tmpDir);
    expect(result.minWordCount).toBe(50);
    expect(result.maxIterations).toBe(3);
    expect(result.escalation).toBe('escalate_to_human');
    expect(result.advanceMode).toBe('manual');
    expect(result.requiredSections).toEqual([]);
    expect(result.reviewerRubrics).toEqual([]);
  });

  it('loads architecture-spike spec for ARCH_SPIKE column', () => {
    const specPath = path.join(tmpDir, '.aeos', 'column-specs', 'architecture-spike.yaml');
    fs.writeFileSync(specPath, validColumnSpecYaml({ column: 'ARCH_SPIKE' }), 'utf-8');

    const result = loader.load(Column.ARCH_SPIKE, tmpDir);
    expect(result.column).toBe('ARCH_SPIKE');
  });

  it('throws ColumnSpecNotFoundError for BACKLOG column', () => {
    expect(() => loader.load(Column.BACKLOG, tmpDir)).toThrow(ColumnSpecNotFoundError);
    expect(() => loader.load(Column.BACKLOG, tmpDir)).toThrow('does not have a column spec');
  });

  it('throws ColumnSpecNotFoundError for DOD_GATE column', () => {
    expect(() => loader.load(Column.DOD_GATE, tmpDir)).toThrow(ColumnSpecNotFoundError);
  });

  it('throws ColumnSpecNotFoundError for DONE column', () => {
    expect(() => loader.load(Column.DONE, tmpDir)).toThrow(ColumnSpecNotFoundError);
  });

  it('throws ColumnSpecNotFoundError when file does not exist for a mapped column', () => {
    // Don't create the file — it should throw
    expect(() => loader.load(Column.PRODUCT_SCOPING, tmpDir)).toThrow(ColumnSpecNotFoundError);
    expect(() => loader.load(Column.PRODUCT_SCOPING, tmpDir)).toThrow('Column spec file not found');
  });

  it('throws ZodError when YAML is missing required fields', () => {
    const specPath = path.join(tmpDir, '.aeos', 'column-specs', 'product-scoping.yaml');
    fs.writeFileSync(specPath, 'column: "PRODUCT_SCOPING"\n', 'utf-8');

    expect(() => loader.load(Column.PRODUCT_SCOPING, tmpDir)).toThrow(ZodError);
  });

  it('throws ZodError when YAML has invalid field types', () => {
    const specPath = path.join(tmpDir, '.aeos', 'column-specs', 'product-scoping.yaml');
    const yaml = [
      'column: "PRODUCT_SCOPING"',
      'workerAgentFile: "agents/pm-agent.yaml"',
      'reviewerAgentFile: "agents/reviewer-agent.yaml"',
      'outputArtifact: "prd.md"',
      'minWordCount: "not-a-number"',
    ].join('\n');
    fs.writeFileSync(specPath, yaml, 'utf-8');

    expect(() => loader.load(Column.PRODUCT_SCOPING, tmpDir)).toThrow(ZodError);
  });

  it('maps all expected columns to correct filenames', () => {
    const mappings: Array<[Column, string]> = [
      [Column.PRODUCT_SCOPING, 'product-scoping'],
      [Column.ARCH_SPIKE, 'architecture-spike'],
      [Column.TECH_SPEC, 'tech-spec'],
      [Column.IMPLEMENTATION, 'implementation'],
      [Column.CODE_REVIEW, 'code-review'],
      [Column.QA, 'qa'],
    ];

    for (const [column, filename] of mappings) {
      const specPath = path.join(tmpDir, '.aeos', 'column-specs', `${filename}.yaml`);
      fs.writeFileSync(specPath, validColumnSpecYaml({ column }), 'utf-8');
      const result = loader.load(column, tmpDir);
      expect(result.column).toBe(column);
    }
  });
});
