import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { YamlAgentSpecLoader } from './yaml-agent-spec-loader.adapter.js';
import { AgentSpecNotFoundError } from '../../shared/errors.js';

/** Minimal valid agent spec YAML content. */
function validAgentSpecYaml(overrides: Record<string, unknown> = {}): string {
  const spec = {
    name: 'pm-agent',
    systemPrompt: 'You are a product manager.',
    taskInstruction: 'Write a PRD.',
    outputFormat: 'Markdown',
    executor: null, // handled separately below
    ...overrides,
  };

  const lines: string[] = [];
  for (const [k, v] of Object.entries(spec)) {
    if (k === 'executor') continue;
    if (typeof v === 'string') {
      lines.push(`${k}: "${v}"`);
    } else {
      lines.push(`${k}: ${v}`);
    }
  }
  lines.push('executor:');
  lines.push('  type: "stub"');
  lines.push('  timeoutSeconds: 120');
  return lines.join('\n');
}

describe('YamlAgentSpecLoader', () => {
  let tmpDir: string;
  let loader: YamlAgentSpecLoader;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-agentspec-test-'));
    fs.mkdirSync(path.join(tmpDir, '.aeos', 'agents'), { recursive: true });
    loader = new YamlAgentSpecLoader();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  it('loads and returns a valid agent spec', () => {
    const specPath = path.join(tmpDir, '.aeos', 'agents', 'pm-agent.yaml');
    fs.writeFileSync(specPath, validAgentSpecYaml(), 'utf-8');

    const result = loader.load('agents/pm-agent.yaml', tmpDir);
    expect(result.name).toBe('pm-agent');
    expect(result.systemPrompt).toBe('You are a product manager.');
    expect(result.taskInstruction).toBe('Write a PRD.');
    expect(result.outputFormat).toBe('Markdown');
    expect(result.executor.type).toBe('stub');
    expect(result.executor.timeoutSeconds).toBe(120);
  });

  it('applies default values from schema', () => {
    const specPath = path.join(tmpDir, '.aeos', 'agents', 'pm-agent.yaml');
    fs.writeFileSync(specPath, validAgentSpecYaml(), 'utf-8');

    const result = loader.load('agents/pm-agent.yaml', tmpDir);
    expect(result.selfVerificationChecklist).toEqual([]);
  });

  it('throws AgentSpecNotFoundError when file does not exist', () => {
    expect(() => loader.load('agents/nonexistent.yaml', tmpDir)).toThrow(AgentSpecNotFoundError);
    expect(() => loader.load('agents/nonexistent.yaml', tmpDir)).toThrow(
      'Agent spec file not found',
    );
  });

  it('throws ZodError when YAML is missing required fields', () => {
    const specPath = path.join(tmpDir, '.aeos', 'agents', 'bad-agent.yaml');
    fs.writeFileSync(specPath, 'name: "bad-agent"\n', 'utf-8');

    expect(() => loader.load('agents/bad-agent.yaml', tmpDir)).toThrow(ZodError);
  });

  it('throws ZodError when YAML has invalid executor type', () => {
    const specPath = path.join(tmpDir, '.aeos', 'agents', 'bad-agent.yaml');
    const yaml = [
      'name: "bad-agent"',
      'systemPrompt: "test"',
      'taskInstruction: "test"',
      'outputFormat: "test"',
      'executor:',
      '  type: "invalid-type"',
    ].join('\n');
    fs.writeFileSync(specPath, yaml, 'utf-8');

    expect(() => loader.load('agents/bad-agent.yaml', tmpDir)).toThrow(ZodError);
  });

  it('loads agent spec with optional role field', () => {
    const specPath = path.join(tmpDir, '.aeos', 'agents', 'reviewer.yaml');
    const yaml = [
      'name: "reviewer-agent"',
      'role: "reviewer"',
      'systemPrompt: "You are a code reviewer."',
      'taskInstruction: "Review the code."',
      'outputFormat: "Markdown"',
      'executor:',
      '  type: "claude-cli"',
      '  model: "claude-opus-4-6"',
      '  timeoutSeconds: 300',
    ].join('\n');
    fs.writeFileSync(specPath, yaml, 'utf-8');

    const result = loader.load('agents/reviewer.yaml', tmpDir);
    expect(result.name).toBe('reviewer-agent');
    expect(result.role).toBe('reviewer');
    expect(result.executor.type).toBe('claude-cli');
    expect(result.executor.model).toBe('claude-opus-4-6');
  });
});

describe('reviewer-agent.yaml integration', () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  let loader: YamlAgentSpecLoader;

  beforeEach(() => {
    loader = new YamlAgentSpecLoader();
  });

  /**
   * Integration test: loads the actual .aeos/agents/reviewer-agent.yaml from the repo root
   * and validates it against AgentSpecSchema (M2-013 acceptance criteria).
   */
  it('parses reviewer-agent.yaml without ZodError', () => {
    const result = loader.load('agents/reviewer-agent.yaml', repoRoot);

    // AC: AgentSpecSchema.parse() does not throw
    expect(result).toBeDefined();
    expect(result.name).toBe('reviewer-agent');
  });

  it('has role set to reviewer', () => {
    const result = loader.load('agents/reviewer-agent.yaml', repoRoot);
    expect(result.role).toBe('reviewer');
  });

  it('systemPrompt defines "evaluate, don\'t fix" behaviour', () => {
    const result = loader.load('agents/reviewer-agent.yaml', repoRoot);
    expect(result.systemPrompt).toContain('evaluate');
    expect(result.systemPrompt).toContain('You do not rewrite or fix the artifact');
  });

  it('outputFormat includes severity-grouped findings and conclusion', () => {
    const result = loader.load('agents/reviewer-agent.yaml', repoRoot);
    expect(result.outputFormat).toContain('BLOCKER');
    expect(result.outputFormat).toContain('WARNING');
    expect(result.outputFormat).toContain('INFO');
    expect(result.outputFormat).toContain('APPROVED');
    expect(result.outputFormat).toContain('REJECTED');
  });

  it('selfVerificationChecklist contains at least 3 items', () => {
    const result = loader.load('agents/reviewer-agent.yaml', repoRoot);
    expect(result.selfVerificationChecklist.length).toBeGreaterThanOrEqual(3);
  });

  it('executor.type is claude-cli', () => {
    const result = loader.load('agents/reviewer-agent.yaml', repoRoot);
    expect(result.executor.type).toBe('claude-cli');
  });

  it('executor.model is claude-sonnet-4-20250514', () => {
    const result = loader.load('agents/reviewer-agent.yaml', repoRoot);
    expect(result.executor.model).toBe('claude-sonnet-4-20250514');
  });

  it('executor.timeoutSeconds is 180', () => {
    const result = loader.load('agents/reviewer-agent.yaml', repoRoot);
    expect(result.executor.timeoutSeconds).toBe(180);
  });
});

describe('architect-agent.yaml integration', () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  let loader: YamlAgentSpecLoader;

  beforeEach(() => {
    loader = new YamlAgentSpecLoader();
  });

  /**
   * Integration test: loads the actual .aeos/agents/architect-agent.yaml from the repo root
   * and validates it against AgentSpecSchema (M4-001 / AEOS-5 acceptance criteria).
   */
  it('parses architect-agent.yaml without ZodError', () => {
    const result = loader.load('agents/architect-agent.yaml', repoRoot);

    // AC: AgentSpecSchema.parse() does not throw
    expect(result).toBeDefined();
    expect(result.name).toBe('architect-agent');
  });

  it('has role set to worker', () => {
    const result = loader.load('agents/architect-agent.yaml', repoRoot);
    expect(result.role).toBe('worker');
  });

  it('systemPrompt describes reasoning about architecture tradeoffs', () => {
    const result = loader.load('agents/architect-agent.yaml', repoRoot);
    expect(result.systemPrompt).toContain('tradeoff');
    expect(result.systemPrompt).toContain('scalab');
    expect(result.systemPrompt).toContain('testability');
  });

  it('taskInstruction contains guidance for both ARCH_SPIKE and TECH_SPEC columns', () => {
    const result = loader.load('agents/architect-agent.yaml', repoRoot);
    expect(result.taskInstruction).toContain('### When running in ARCH_SPIKE');
    expect(result.taskInstruction).toContain('### When running in TECH_SPEC');
  });

  it('outputFormat contains inline template content for both columns', () => {
    const result = loader.load('agents/architect-agent.yaml', repoRoot);
    expect(result.outputFormat).toContain('### ARCH_SPIKE output');
    expect(result.outputFormat).toContain('### TECH_SPEC output');
  });

  it('selfVerificationChecklist contains at least 3 items', () => {
    const result = loader.load('agents/architect-agent.yaml', repoRoot);
    expect(result.selfVerificationChecklist.length).toBeGreaterThanOrEqual(3);
  });

  it('selfVerificationChecklist covers technical correctness and constraint adherence', () => {
    const result = loader.load('agents/architect-agent.yaml', repoRoot);
    const joined = result.selfVerificationChecklist.join(' ');
    expect(joined).toContain('constraint');
    expect(joined).toContain('tradeoff');
  });

  it('executor.type is claude-cli', () => {
    const result = loader.load('agents/architect-agent.yaml', repoRoot);
    expect(result.executor.type).toBe('claude-cli');
  });

  it('executor.model is claude-sonnet-4-20250514', () => {
    const result = loader.load('agents/architect-agent.yaml', repoRoot);
    expect(result.executor.model).toBe('claude-sonnet-4-20250514');
  });
});

describe('engineer-agent.yaml integration', () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  let loader: YamlAgentSpecLoader;

  beforeEach(() => {
    loader = new YamlAgentSpecLoader();
  });

  /**
   * Integration test: loads the actual .aeos/agents/engineer-agent.yaml from the repo root
   * and validates it against AgentSpecSchema (M5a-001 / AEOS-9 acceptance criteria).
   */
  it('parses engineer-agent.yaml without ZodError', () => {
    const result = loader.load('agents/engineer-agent.yaml', repoRoot);

    // AC: AgentSpecSchema.parse() does not throw
    expect(result).toBeDefined();
    expect(result.name).toBe('engineer-agent');
  });

  it('has role set to worker', () => {
    const result = loader.load('agents/engineer-agent.yaml', repoRoot);
    expect(result.role).toBe('worker');
  });

  it('systemPrompt describes reasoning about implementation tradeoffs', () => {
    const result = loader.load('agents/engineer-agent.yaml', repoRoot);
    expect(result.systemPrompt).toContain('tradeoff');
    expect(result.systemPrompt).toContain('test');
    expect(result.systemPrompt.toLowerCase()).toContain('incremental');
  });

  it('taskInstruction contains guidance for both IMPLEMENTATION and CODE_REVIEW columns', () => {
    const result = loader.load('agents/engineer-agent.yaml', repoRoot);
    expect(result.taskInstruction).toContain('### When running in IMPLEMENTATION');
    expect(result.taskInstruction).toContain('### When running in CODE_REVIEW');
  });

  it('outputFormat contains inline template content for both columns', () => {
    const result = loader.load('agents/engineer-agent.yaml', repoRoot);
    expect(result.outputFormat).toContain('### IMPLEMENTATION output');
    expect(result.outputFormat).toContain('### CODE_REVIEW output');
  });

  it('selfVerificationChecklist contains at least 3 items', () => {
    const result = loader.load('agents/engineer-agent.yaml', repoRoot);
    expect(result.selfVerificationChecklist.length).toBeGreaterThanOrEqual(3);
  });

  it('selfVerificationChecklist covers plan completeness and spec alignment', () => {
    const result = loader.load('agents/engineer-agent.yaml', repoRoot);
    const joined = result.selfVerificationChecklist.join(' ');
    expect(joined).toContain('tech spec');
    expect(joined).toContain('test');
  });

  it('executor.type is claude-cli', () => {
    const result = loader.load('agents/engineer-agent.yaml', repoRoot);
    expect(result.executor.type).toBe('claude-cli');
  });

  it('executor.model is claude-sonnet-4-20250514', () => {
    const result = loader.load('agents/engineer-agent.yaml', repoRoot);
    expect(result.executor.model).toBe('claude-sonnet-4-20250514');
  });
});
