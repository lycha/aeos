import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { AgentSpecSchema } from './agent-spec.js';

/** Minimal valid agent spec input (only required fields). */
function validInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'pm-agent',
    systemPrompt: 'You are a product manager.',
    taskInstruction: 'Write a PRD.',
    outputFormat: 'Markdown',
    executor: { type: 'stub', timeoutSeconds: 120 },
    ...overrides,
  };
}

describe('AgentSpecSchema', () => {
  it('parses a valid agent spec', () => {
    const result = AgentSpecSchema.parse(validInput());
    expect(result.name).toBe('pm-agent');
    expect(result.systemPrompt).toBe('You are a product manager.');
    expect(result.taskInstruction).toBe('Write a PRD.');
    expect(result.outputFormat).toBe('Markdown');
  });

  it('throws ZodError when name is missing', () => {
    const input = validInput();
    delete input['name'];
    expect(() => AgentSpecSchema.parse(input)).toThrow(ZodError);
  });

  it('throws ZodError when systemPrompt is missing', () => {
    const input = validInput();
    delete input['systemPrompt'];
    expect(() => AgentSpecSchema.parse(input)).toThrow(ZodError);
  });

  it('throws ZodError when executor is missing', () => {
    const input = validInput();
    delete input['executor'];
    expect(() => AgentSpecSchema.parse(input)).toThrow(ZodError);
  });

  it('accepts executor type stub without error', () => {
    const result = AgentSpecSchema.parse(validInput({ executor: { type: 'stub' } }));
    expect(result.executor.type).toBe('stub');
  });

  it('accepts executor type claude-cli', () => {
    const result = AgentSpecSchema.parse(validInput({ executor: { type: 'claude-cli' } }));
    expect(result.executor.type).toBe('claude-cli');
  });

  it('throws ZodError for invalid executor type', () => {
    expect(() => AgentSpecSchema.parse(validInput({ executor: { type: 'invalid' } }))).toThrow(
      ZodError,
    );
  });

  it('applies default selfVerificationChecklist of empty array', () => {
    const result = AgentSpecSchema.parse(validInput());
    expect(result.selfVerificationChecklist).toEqual([]);
  });

  it('uses provided selfVerificationChecklist', () => {
    const result = AgentSpecSchema.parse(
      validInput({ selfVerificationChecklist: ['Check A', 'Check B'] }),
    );
    expect(result.selfVerificationChecklist).toEqual(['Check A', 'Check B']);
  });

  it('applies default executor timeoutSeconds of 300', () => {
    const result = AgentSpecSchema.parse(validInput({ executor: { type: 'stub' } }));
    expect(result.executor.timeoutSeconds).toBe(300);
  });

  it('accepts optional role field', () => {
    const result = AgentSpecSchema.parse(validInput({ role: 'worker' }));
    expect(result.role).toBe('worker');
  });

  it('accepts reviewer role', () => {
    const result = AgentSpecSchema.parse(validInput({ role: 'reviewer' }));
    expect(result.role).toBe('reviewer');
  });

  it('accepts optional executor model field', () => {
    const result = AgentSpecSchema.parse(
      validInput({ executor: { type: 'claude-cli', model: 'claude-opus-4-6' } }),
    );
    expect(result.executor.model).toBe('claude-opus-4-6');
  });
});
