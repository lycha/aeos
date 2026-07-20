import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { ColumnSpecSchema, AgentSpecSchema } from './schemas.js';

// ── ColumnSpecSchema ──────────────────────────────────────────────

function validColumnInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    column: 'product-scoping',
    workerAgentFile: 'agents/pm-agent.yaml',
    reviewerAgentFile: 'agents/reviewer-agent.yaml',
    outputArtifact: 'prd.md',
    ...overrides,
  };
}

describe('ColumnSpecSchema', () => {
  it('parses a valid column spec with all required fields', () => {
    const result = ColumnSpecSchema.parse(validColumnInput());
    expect(result.column).toBe('product-scoping');
    expect(result.workerAgentFile).toBe('agents/pm-agent.yaml');
  });

  it('throws ZodError when column is missing', () => {
    const input = validColumnInput();
    delete input['column'];
    expect(() => ColumnSpecSchema.parse(input)).toThrow(ZodError);
  });

  it('throws ZodError when workerAgentFile is missing', () => {
    const input = validColumnInput();
    delete input['workerAgentFile'];
    expect(() => ColumnSpecSchema.parse(input)).toThrow(ZodError);
  });

  it('applies default minWordCount of 50', () => {
    expect(ColumnSpecSchema.parse(validColumnInput()).minWordCount).toBe(50);
  });

  it('applies default escalation of escalate_to_human', () => {
    expect(ColumnSpecSchema.parse(validColumnInput()).escalation).toBe('escalate_to_human');
  });

  it('applies default advanceMode of manual', () => {
    expect(ColumnSpecSchema.parse(validColumnInput()).advanceMode).toBe('manual');
  });

  it('throws ZodError for invalid advanceMode', () => {
    expect(() => ColumnSpecSchema.parse(validColumnInput({ advanceMode: 'invalid' }))).toThrow(
      ZodError,
    );
  });

  it('applies default preflight config', () => {
    const result = ColumnSpecSchema.parse(validColumnInput());
    expect(result.preflight.enabled).toBe(true);
    expect(result.preflight.questionsArtifact).toBe('questions.md');
  });

  it('leaves maxIterations unset so it can inherit the global cap', () => {
    expect(ColumnSpecSchema.parse(validColumnInput({})).maxIterations).toBeUndefined();
    expect(ColumnSpecSchema.parse(validColumnInput({ maxIterations: 2 })).maxIterations).toBe(2);
  });

  it('accepts optional executorMode field', () => {
    expect(ColumnSpecSchema.parse(validColumnInput({ executorMode: 'agentic' })).executorMode).toBe(
      'agentic',
    );
  });

  it('throws ZodError for invalid executorMode', () => {
    expect(() => ColumnSpecSchema.parse(validColumnInput({ executorMode: 'invalid' }))).toThrow(
      ZodError,
    );
  });
});

// ── AgentSpecSchema ───────────────────────────────────────────────

function validAgentInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'PM Agent',
    systemPrompt: 'You are a product manager.',
    taskInstruction: 'Write a PRD.',
    outputFormat: '## PRD',
    executor: { type: 'claude-cli', timeoutSeconds: 300 },
    ...overrides,
  };
}

describe('AgentSpecSchema', () => {
  it('parses a valid agent spec', () => {
    const result = AgentSpecSchema.parse(validAgentInput());
    expect(result.name).toBe('PM Agent');
    expect(result.executor.type).toBe('claude-cli');
  });

  it('throws ZodError when name is missing', () => {
    const input = validAgentInput();
    delete input['name'];
    expect(() => AgentSpecSchema.parse(input)).toThrow(ZodError);
  });

  it('throws ZodError when systemPrompt is missing', () => {
    const input = validAgentInput();
    delete input['systemPrompt'];
    expect(() => AgentSpecSchema.parse(input)).toThrow(ZodError);
  });

  it('accepts executor type stub', () => {
    const result = AgentSpecSchema.parse(validAgentInput({ executor: { type: 'stub' } }));
    expect(result.executor.type).toBe('stub');
  });

  it('accepts executor type opencode-cli', () => {
    const result = AgentSpecSchema.parse(validAgentInput({ executor: { type: 'opencode-cli' } }));
    expect(result.executor.type).toBe('opencode-cli');
  });

  it('throws ZodError for invalid executor type', () => {
    expect(() => AgentSpecSchema.parse(validAgentInput({ executor: { type: 'invalid' } }))).toThrow(
      ZodError,
    );
  });

  it('applies default empty selfVerificationChecklist', () => {
    expect(AgentSpecSchema.parse(validAgentInput()).selfVerificationChecklist).toEqual([]);
  });

  it('applies default timeoutSeconds of 300', () => {
    const result = AgentSpecSchema.parse(validAgentInput({ executor: { type: 'stub' } }));
    expect(result.executor.timeoutSeconds).toBe(300);
  });

  it('accepts optional role field', () => {
    expect(AgentSpecSchema.parse(validAgentInput({ role: 'worker' })).role).toBe('worker');
    expect(AgentSpecSchema.parse(validAgentInput({ role: 'reviewer' })).role).toBe('reviewer');
  });
});
